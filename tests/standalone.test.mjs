import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { demoProjects } from '../src/demo.js';

test('standalone HTML embeds a working worker: imports, errors, search, detail and clearing', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1);
  assert.ok(!/\b(?:src|href)=["']https?:/i.test(html));
  assert.ok(html.includes("connect-src 'none'"));
  assert.ok(!html.includes('/* APP_SCRIPT */'));
  assert.ok(!html.includes('/* APP_STYLES */'));
  const app = new vm.Script(scripts[0][1]);
  let workerSource;
  const stop = new Error('worker captured');
  const shell = vm.createContext({
    Blob: class { constructor(parts) { workerSource = parts.join(''); } },
    URL: { createObjectURL: () => 'blob:test' },
    Worker: class { constructor() { throw stop; } },
  });
  assert.throws(() => app.runInContext(shell), error => error === stop);
  assert.ok(workerSource.length > 1000);
  const requests = new Map();
  const context = vm.createContext({
    TextDecoder, onmessage: null,
    postMessage(data) {
      if (data.event) return;
      const request = requests.get(data.id);
      requests.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(data.result);
    },
  });
  new vm.Script(workerSource).runInContext(context);
  let nextId = 0;
  const send = (action, data = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    requests.set(id, { resolve, reject });
    context.onmessage({ data: { id, action, ...data } });
  });
  const first = await send('import', { file: new File([demoProjects[0].xml], 'one.xml') });
  assert.equal(first.nodes.length, 12);
  assert.ok(first.nodes.every(node => !('fields' in node)), 'The UI must not receive the entire indexed content');
  const invalid = assert.rejects(send('import', { file: new File(['<soapui-project><testSuite name="CRL">'], 'bad.xml') }));
  const second = send('import', { file: new File([demoProjects[1].xml], 'two.xml') });
  const search = send('search', { query: 'CRL', caseSensitive: false });
  await invalid;
  const other = await second;
  const matches = await search;
  assert.equal(matches.occurrences, 12);
  assert.equal(matches.hits[first.rootId].total, 8);
  assert.equal(matches.hits[other.rootId].total, 4);
  const step = first.nodes.find(node => node.name === 'Check revocation');
  const detail = await send('detail', { nodeId: step.id, query: 'CRL', caseSensitive: false });
  const script = detail.find(field => field.label.endsWith('script'));
  const page = await send('field', { nodeId: step.id, fieldIndex: script.index, query: 'CRL', caseSensitive: false, page: { matchIndex: 4 } });
  assert.equal(page.matchIndex, 4);
  assert.equal(page.total, 5);
  assert.ok(page.marks.some(mark => mark.active));
  const nameOnly = await send('search', { query: 'CRL', caseSensitive: false, scope: 'name' });
  assert.equal(nameOnly.occurrences, 2);
  const excluded = await send('field', { nodeId: step.id, fieldIndex: script.index, query: 'CRL', caseSensitive: false, scope: 'name', page: { matchIndex: 0 } });
  assert.equal(excluded.total, 0);
  assert.equal(excluded.marks.length, 0);
  assert.ok(excluded.text.includes('CRL'));
  const contentOnly = await send('search', { query: 'CRL', caseSensitive: false, scope: 'content' });
  assert.equal(contentOnly.occurrences, 10);
  const propertyProject = await send('import', { file: new File(['<soapui-project name="Scope"><properties><property><name>CRL</name><value>CRL</value></property></properties></soapui-project>'], 'properties.xml') });
  const propertyOnly = await send('search', { query: 'CRL', caseSensitive: false, scope: 'property' });
  assert.equal(propertyOnly.occurrences, 2);
  const propertyFields = await send('detail', { nodeId: propertyProject.rootId, query: 'CRL', caseSensitive: false, scope: 'property' });
  assert.equal(propertyFields.reduce((sum, field) => sum + field.count, 0), 2);
  const propertyValue = propertyFields.find(field => field.label.endsWith('value'));
  const propertyPage = await send('field', { nodeId: propertyProject.rootId, fieldIndex: propertyValue.index, query: 'CRL', caseSensitive: false, scope: 'property', page: { matchIndex: 0 } });
  assert.equal(propertyPage.total, 1);
  await send('clear');
  assert.equal((await send('search', { query: 'CRL' })).occurrences, 0);
});
