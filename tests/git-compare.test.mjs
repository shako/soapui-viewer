import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink, mkdir } from 'node:fs/promises';
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
