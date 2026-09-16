import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const worker = await build({ entryPoints: ['src/worker.js'], bundle: true, write: false, format: 'iife', minify: true });
const app = await build({
  entryPoints: ['src/app.js'], bundle: true, write: false, format: 'iife', minify: true,
  define: { WORKER_SOURCE: JSON.stringify(worker.outputFiles[0].text) },
});
const template = await readFile('src/index.html', 'utf8');
const css = await readFile('src/style.css', 'utf8');
const ownLicense = await readFile('LICENSE', 'utf8');
const notices = await readFile('THIRD-PARTY-LICENSES.txt', 'utf8');
const xmlcharsLicense = await readFile('node_modules/xmlchars/LICENSE', 'utf8');
const licenseComment = `<!-- SoapUI Viewer\n${ownLicense}\n\nIncluded libraries: saxes 6.0.0 and xmlchars 2.2.0\n${notices}\n\nxmlchars:\n${xmlcharsLicense}\n-->`;
const safeScript = app.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', template.replace('</head>', () => `${licenseComment}\n</head>`).replace('/* APP_STYLES */', () => css).replace('/* APP_SCRIPT */', () => safeScript));
console.log('Built: dist/index.html — standalone, offline, no installation required.');
