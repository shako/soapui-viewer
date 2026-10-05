import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink, mkdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { request } from 'node:http';
import { openGitRepository, startGitServer } from '../scripts/git-compare.mjs';
const exec = promisify(execFile);

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'soapui-git-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const git = (...args) => exec('git', ['-C', dir, ...args]);
  await git('init', '-b', 'main');
  await git('config', 'user.name', 'Synthetic Test');
  await git('config', 'user.email', 'test@example.invalid');
  const file = join(dir, 'project [test] with spaces.xml');
  await writeFile(file, '<soapui-project name="Before"/>');
  await git('add', '--', '.'); await git('commit', '-m', 'Before');
  await git('branch', 'baseline'); await git('tag', 'v1');
  await writeFile(file, '<soapui-project name="After"/>');
  await git('add', '--', '.'); await git('commit', '-m', 'After');
  await writeFile(file, '<soapui-project name="Working copy"/>');
  return { dir, git, file };
}

test('Git helper reads branches, tags, HEAD and working copy without modifying the repository', async t => {
  const { file, git } = await fixture(t);
  const before = (await git('status', '--porcelain=v1')).stdout;
  const project = await openGitRepository(file);
  assert.equal(project.context.branch, 'main');
  assert.ok(project.context.refs.some(ref => ref.value === 'refs/heads/baseline'));
  assert.equal((await project.snapshot('refs/heads/baseline')).bytes.toString(), '<soapui-project name="Before"/>');
  assert.equal((await project.snapshot('refs/tags/v1')).bytes.toString(), '<soapui-project name="Before"/>');
  assert.equal((await project.snapshot('HEAD')).bytes.toString(), '<soapui-project name="After"/>');
  assert.match((await project.snapshot('HEAD')).revision, /^[a-f0-9]{40,64}$/);
  assert.equal((await project.snapshot('WORKTREE')).bytes.toString(), '<soapui-project name="Working copy"/>');
  for (const ref of ['--help', 'HEAD:../../etc/passwd', 'main;touch nope', '../file', '']) await assert.rejects(project.snapshot(ref), /Choose a version/);
  assert.equal((await git('status', '--porcelain=v1')).stdout, before);
  assert.equal((await git('branch', '--show-current')).stdout.trim(), 'main');
});

test('branch and tag choices use the latest commit date, newest first across time zones', async t => {
  const { dir, git } = await fixture(t);
  const commit = async (date, message) => exec('git', ['-C', dir, 'commit', '--allow-empty', '-m', message], {
    env: { ...process.env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z' },
  });
  await commit('2024-01-02T09:00:00+01:00', 'Older');
  await git('branch', 'zzz-older');
  await git('tag', '-a', 'annotated-old', '-m', 'New tag, old commit');
  await commit('2024-01-02T08:30:00Z', 'Newer');
  await git('branch', 'aaa-newer');
  await git('tag', 'lightweight-new');
  await git('update-ref', 'refs/remotes/origin/newer', 'HEAD');
  await git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/newer');
  const refs = (await openGitRepository(dir)).context.refs;
  assert.deepEqual(refs.slice(0, 2).map(ref => ref.value), ['HEAD', 'WORKTREE']);
  const stamp = value => Date.parse(refs.find(ref => ref.value === value).committedAt);
  assert.equal(stamp('refs/heads/zzz-older'), Date.parse('2024-01-02T08:00:00Z'));
  assert.equal(stamp('refs/heads/aaa-newer'), Date.parse('2024-01-02T08:30:00Z'));
  assert.equal(stamp('refs/tags/annotated-old'), stamp('refs/heads/zzz-older'));
  assert.equal(stamp('refs/tags/lightweight-new'), stamp('refs/heads/aaa-newer'));
  assert.equal(stamp('refs/remotes/origin/newer'), stamp('refs/heads/aaa-newer'));
  assert.ok(!refs.some(ref => ref.value === 'refs/remotes/origin/HEAD'));
  const dates = refs.slice(2).map(ref => Date.parse(ref.committedAt));
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a));
});

test('merged status follows main ancestry and remains unknown without a main or master baseline', async t => {
  const { dir, git } = await fixture(t);
  await git('checkout', '-b', 'feature/unmerged');
  await git('commit', '--allow-empty', '-m', 'Feature only');
  await git('checkout', 'main');
  await git('update-ref', 'refs/remotes/origin/old', 'baseline');
  const { context } = await openGitRepository(dir);
  assert.equal(context.baseRef, 'refs/heads/main');
  const merged = ref => context.refs.find(item => item.value === ref).merged;
  assert.equal(merged('refs/heads/baseline'), true);
  assert.equal(merged('refs/remotes/origin/old'), true);
  assert.equal(merged('refs/heads/feature/unmerged'), false);
  assert.equal(merged('refs/tags/v1'), false);
  assert.ok(await (await openGitRepository(dir)).snapshot('refs/heads/baseline', 'project [test] with spaces.xml'), 'Merged branches can still be explicitly compared');
  await git('branch', '-m', 'main', 'trunk');
  const unknown = (await openGitRepository(dir)).context;
  assert.equal(unknown.baseRef, '');
  assert.equal(unknown.refs.find(item => item.value === 'refs/heads/baseline').merged, undefined);
});

test('Git file absence is explicit; symlinks are not read as project snapshots', async t => {
  const { file, git, dir } = await fixture(t);
  await git('rm', '-f', '--', file); await git('commit', '-m', 'Remove');
  const project = await openGitRepository(file);
  assert.equal(await project.snapshot('HEAD'), null);
  assert.equal(await project.snapshot('WORKTREE'), null);
  assert.ok(await project.snapshot('refs/heads/baseline'));
  const target = join(dir, 'other.xml'); await writeFile(target, '<soapui-project/>');
  await symlink(target, file);
  await assert.rejects(project.snapshot('WORKTREE'), /Symlink/);
});

test('local HTTP helper confines XML reads to its selected repository behind a local session path', async t => {
  const { file } = await fixture(t);
  const project = await openGitRepository(file);
  const template = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const { server, url } = await startGitServer(project, template);
  t.after(() => new Promise(resolve => server.close(resolve)));
  const html = await (await fetch(url)).text();
  assert.ok(html.includes("connect-src 'self'"));
  assert.ok(html.includes('globalThis.SOAPUI_GIT='));
  const endpoint = url + 'file?repository=' + encodeURIComponent(project.context.repository) + '&ref=HEAD';
  const response = await fetch(endpoint);
  assert.equal(response.status, 200); assert.match(response.headers.get('X-Soapui-Revision'), /^[a-f0-9]{40,64}$/);
  assert.equal(await response.text(), '<soapui-project name="After"/>');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal((await fetch(new URL('/file?ref=HEAD', url))).status, 404);
  assert.equal((await fetch(endpoint, { method: 'POST' })).status, 405);
  assert.equal((await fetch(endpoint, { headers: { Origin: 'https://example.invalid' } })).status, 403);
  assert.equal((await fetch(endpoint.replace('ref=HEAD', 'ref=--help'))).status, 400);
  assert.equal((await fetch(endpoint + '&path=/etc/passwd')).status, 400);
  assert.equal((await fetch(endpoint + '&path=../private.xml')).status, 400);
  assert.equal((await fetch(endpoint.replace(encodeURIComponent(project.context.repository), 'different'))).status, 400);
  const badHost = await new Promise((resolve, reject) => {
    const req = request(url, { headers: { Host: 'example.invalid' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(badHost, 403);
});


test('repository mode lists version-specific XML paths and supports different files on each branch', async t => {
  const { file, git, dir } = await fixture(t);
  await mkdir(join(dir, 'projects'));
  await git('mv', '--', file, 'projects/renamed.xml');
  await writeFile(join(dir, 'notes.txt'), 'Not a project');
  await symlink('renamed.xml', join(dir, 'projects/link.xml'));
  await git('add', '--', '.'); await git('commit', '-m', 'Rename XML and add other file types');
  await writeFile(join(dir, 'local.xml'), '<soapui-project name="Untracked"/>');
  const repo = await openGitRepository(dir);
  assert.equal(repo.context.path, '');
  const baseline = await repo.listFiles('refs/heads/baseline');
  const head = await repo.listFiles('HEAD');
  assert.deepEqual(baseline.paths, ['project [test] with spaces.xml']);
  assert.deepEqual(head.paths, ['projects/renamed.xml']);
  assert.deepEqual((await repo.listFiles('WORKTREE')).paths, ['local.xml', 'projects/renamed.xml']);
  assert.equal((await repo.snapshot('refs/heads/baseline', baseline.paths[0])).bytes.toString(), '<soapui-project name="Before"/>');
  assert.equal((await repo.snapshot('HEAD', head.paths[0])).bytes.toString(), '<soapui-project name="Working copy"/>');
  assert.equal(await repo.snapshot('HEAD', baseline.paths[0]), null, 'Missing old name remains absent instead of silently choosing another file');
  for (const path of ['../outside.xml', '/tmp/outside.xml', '.git/secrets.xml', 'projects/../../outside.xml', 'notes.txt', 'projects/link.xml']) {
    await assert.rejects(repo.snapshot('WORKTREE', path));
  }
  await assert.rejects(repo.snapshot('HEAD', 'projects/link.xml'), /regular file/);
  const outside = await mkdtemp(join(tmpdir(), 'soapui-outside-test-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'outside.xml'), '<soapui-project/>');
  await symlink(outside, join(dir, 'linked-directory'));
  await assert.rejects(repo.snapshot('WORKTREE', 'linked-directory/outside.xml'), /Symlink/);
  await rm(join(dir, 'projects/renamed.xml'));
  assert.deepEqual((await repo.listFiles('WORKTREE')).paths, ['local.xml']);
});

test('a project subfolder stays distinct from its containing repository and a nested repository uses its own branches', async t => {
  const { dir, git } = await fixture(t);
  const folder = join(dir, 'soapui_development');
  await mkdir(folder);
  const nestedFile = join(folder, 'project.xml');
  await writeFile(nestedFile, '<soapui-project/>');
  await git('add', '--', '.'); await git('commit', '-m', 'Nested project');
  const project = await openGitRepository(folder + '/');
  assert.equal(project.context.folder, folder);
  assert.equal(project.context.repository, await realpath(dir));
  assert.equal(project.context.folderPrefix, 'soapui_development');
  assert.equal(project.context.branch, 'main');
  assert.equal((await openGitRepository(nestedFile)).context.path, 'soapui_development/project.xml');
  assert.ok((await project.listFiles('HEAD')).paths.includes('soapui_development/project.xml'));
  await exec('git', ['-C', folder, 'init', '-b', 'feature/nested']);
  const nested = await openGitRepository(folder);
  assert.equal(nested.context.repository, await realpath(folder));
  assert.equal(nested.context.folderPrefix, '');
  assert.equal(nested.context.branch, 'feature/nested');
  assert.ok(!nested.context.refs.some(ref => ref.value === 'refs/heads/main'), 'Never borrow branches from the parent repository');
});

test('helper starts without a file and accepts an explicit repository folder from its own viewer', async t => {
  const { dir } = await fixture(t);
  const template = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const { server, url } = await startGitServer(null, template);
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = new URL(url).origin;
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ path: dir }) };
  assert.equal((await fetch(url + 'repository', { ...options, headers: { 'Content-Type': 'application/json', Origin: 'https://example.invalid' } })).status, 403);
  const response = await fetch(url + 'repository', options);
  assert.equal(response.status, 200);
  const context = await response.json();
  assert.equal(context.branch, 'main');
  const query = '?repository=' + encodeURIComponent(context.repository) + '&ref=HEAD';
  const list = await (await fetch(url + 'files' + query)).json();
  assert.deepEqual(list.paths, ['project [test] with spaces.xml']);
  assert.equal((await fetch(url + 'file' + query + '&path=' + encodeURIComponent(list.paths[0]))).status, 200);
  const invalid = await fetch(url + 'repository', { ...options, body: JSON.stringify({ path: '/nonexistent/soapui-test-repository' }) });
  assert.equal(invalid.status, 400);
  assert.equal((await fetch(url + 'file' + query + '&path=' + encodeURIComponent(list.paths[0]))).status, 200, 'Failed repository selection preserves the previous session');
  assert.equal((await fetch(url + 'repository', { ...options, body: 'invalid json' })).status, 400);
});
