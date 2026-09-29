import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const exec = promisify(execFile);
const maxBytes = 256 * 1024 * 1024;
async function git(repo, args, binary = false) {
  const { stdout } = await exec('git', ['--no-pager', '--literal-pathspecs', '-C', repo, ...args], {
    encoding: binary ? 'buffer' : 'utf8', maxBuffer: maxBytes, timeout: 30000,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
  return binary ? stdout : stdout.trim();
}

function validatePath(path) {
  if (typeof path !== 'string' || !/\.xml$/i.test(path) || /[\\\0]/.test(path) || /^[a-z]:/i.test(path)
    || path.split('/').some(part => !part || part === '.' || part === '..' || part.toLowerCase() === '.git')) {
    throw new Error('Choose an XML file path relative to this repository.');
  }
  return path;
}

export async function openGitRepository(inputPath) {
  if (typeof inputPath !== 'string' || !inputPath.trim()) throw new Error('Enter your Git repository folder.');
  const requested = resolve(inputPath.startsWith('~/') ? resolve(homedir(), inputPath.slice(2)) : inputPath);
  let input = requested, directory = false;
  try { input = await realpath(requested); directory = (await stat(input)).isDirectory(); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    input = resolve(await realpath(dirname(requested)), basename(requested));
  }
  const repository = await realpath(await git(directory ? input : dirname(input), ['rev-parse', '--show-toplevel']));
  const path = directory ? '' : validatePath(relative(repository, input).split(sep).join('/'));
  const branch = await git(repository, ['branch', '--show-current']);
  const names = (await git(repository, ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes', 'refs/tags'])).split('\n').filter(Boolean);
  const refs = [{ value: 'HEAD', label: 'HEAD (current commit)' }, { value: 'WORKTREE', label: 'Working copy (saved file)' },
    ...names.filter(ref => !ref.endsWith('/HEAD')).map(ref => ({ value: ref, label: ref.replace(/^refs\/heads\//, 'Branch: ').replace(/^refs\/remotes\//, 'Remote: ').replace(/^refs\/tags\//, 'Tag: ') }))];
  const allowed = new Set(refs.map(ref => ref.value));
  const validateRef = ref => { if (!allowed.has(ref)) throw new Error('Choose a version from the list.'); };
  const commit = ref => git(repository, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);
  async function workingFile(path) {
    const file = resolve(repository, validatePath(path));
    try {
      if (await realpath(file) !== file) throw new Error('Symlink paths are not supported. Choose a regular file inside this repository.');
      return (await stat(file)).isFile() ? file : null;
    } catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null; throw error; }
  }
  return {
    context: { repository, path, branch, fileName: path ? basename(path) : '', refs },
    async listFiles(ref) {
      validateRef(ref);
      if (ref === 'WORKTREE') {
        const output = await git(repository, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], true);
        const candidates = [...new Set(output.toString('utf8').split('\0').filter(name => /\.xml$/i.test(name)))];
        const paths = [];
        // Bound filesystem concurrency in large repositories. Deleted and symlink
        // files do not appear as available working-copy choices.
        for (let i = 0; i < candidates.length; i += 64) {
          const batch = await Promise.all(candidates.slice(i, i + 64).map(async path => {
            try { return await workingFile(path) ? path : null; } catch { return null; }
          }));
          paths.push(...batch.filter(Boolean));
        }
        return { paths: paths.sort(), revision: '' };
      }
      const revision = await commit(ref);
      const output = await git(repository, ['ls-tree', '-rz', revision], true);
      const paths = output.toString('utf8').split('\0').filter(line => /^(100644|100755) blob /.test(line))
        .map(line => line.slice(line.indexOf('\t') + 1)).filter(path => /\.xml$/i.test(path));
      return { paths: paths.sort(), revision };
    },
    async snapshot(ref, selectedPath = path) {
      validateRef(ref);
      const path = validatePath(selectedPath);
      if (ref === 'WORKTREE') {
        const file = await workingFile(path);
        if (!file) return null;
        if ((await stat(file)).size > maxBytes) throw new Error('Choose an XML file smaller than 256 MiB.');
        return { bytes: await readFile(file), revision: '' };
      }
      const revision = await commit(ref);
      const listing = await git(repository, ['ls-tree', '-z', revision, '--', path], true);
      const item = listing.toString('utf8').split('\0').find(line => line.slice(line.indexOf('\t') + 1) === path);
      if (!item) return null;
      const [mode, type, hash] = item.slice(0, item.indexOf('\t')).split(' ');
      if (type !== 'blob' || !['100644', '100755'].includes(mode)) throw new Error('The selected Git path is not a regular file.');
      if (Number(await git(repository, ['cat-file', '-s', hash])) > maxBytes) throw new Error('Choose an XML file smaller than 256 MiB.');
      return { bytes: await git(repository, ['cat-file', 'blob', hash], true), revision };
    },
  };
}

export async function startGitServer(project, template) {
  const base = `/${randomBytes(24).toString('hex')}/`;
  const html = () => {
    const config = JSON.stringify({ ...project?.context, base }).replace(/</g, '\\u003c');
    return template.replace("connect-src 'none'", "connect-src 'self'")
      .replace('<script>', () => `<script>globalThis.SOAPUI_GIT=${config};\n`);
  };
  let origin;
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    const reply = (status, body = '') => { response.writeHead(status); response.end(body); };
    const json = value => { response.setHeader('Content-Type', 'application/json'); reply(200, JSON.stringify(value)); };
    if (request.headers.host !== new URL(origin).host || (request.headers.origin && request.headers.origin !== origin)) return reply(403, 'Local access only.');
    try {
      const url = new URL(request.url, origin);
      if (request.method === 'POST' && url.pathname === `${base}repository`) {
        if (request.headers.origin !== origin || request.headers['content-type'] !== 'application/json') return reply(403, 'Open a repository from the local viewer.');
        let body = '';
        for await (const chunk of request) { body += chunk; if (body.length > 16384) return reply(413, 'Repository path is too long.'); }
        const next = await openGitRepository(JSON.parse(body).path);
        project = next;
        return json(project.context);
      }
      if (request.method !== 'GET') return reply(405, 'Read-only helper.');
      if (url.pathname === base) {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        reply(200, html());
      } else if (url.pathname === `${base}files`) {
        if (!project) throw new Error('Open a Git repository first.');
        if (url.searchParams.get('repository') !== project.context.repository) throw new Error('Repository changed. Reopen your Git folder in this tab.');
        json(await project.listFiles(url.searchParams.get('ref')));
      } else if (url.pathname === `${base}file`) {
        if (!project) throw new Error('Open a Git repository first.');
        if (url.searchParams.get('repository') !== project.context.repository) throw new Error('Repository changed. Reopen your Git folder in this tab.');
        const snapshot = await project.snapshot(url.searchParams.get('ref'), url.searchParams.get('path') ?? undefined);
        if (!snapshot) return reply(204);
        response.setHeader('Content-Type', 'application/octet-stream');
        response.setHeader('X-Soapui-Revision', snapshot.revision);
        reply(200, snapshot.bytes);
      } else reply(404, 'Not found.');
    } catch (error) { reply(400, error.message); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { server, url: origin + base };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args[0] === '--help') {
    console.log('Usage: npm run compare:git -- ["/path/to/repository-or-project.xml"]\n\nEnter a Git folder in the viewer, then choose a version and XML file on each side. No checkout or fetch. Stop with Ctrl+C.');
    process.exitCode = args[0] === '--help' ? 0 : 1;
    return;
  }
  const project = args[0] ? await openGitRepository(args[0]) : null;
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const { server, url } = await startGitServer(project, html);
  console.log(`SoapUI Git comparison${project ? `: ${project.context.repository}` : ''}\n${url}\nLocal access only. Stop with Ctrl+C.`);
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
  const browser = spawn(command, [url], { stdio: 'ignore' });
  browser.on('error', () => console.log('Open the URL above in your browser.'));
  process.once('SIGINT', () => server.close(() => process.exit(0)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
