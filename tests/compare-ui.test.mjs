import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { setupComparison } from '../src/compare-ui.js';
import { parseComparisonFile, compareProjects, createXmlDiff, diffPage } from '../src/compare-core.js';

// DOM-only tests: no browser, customer files, network, or project scripts run.
async function setup(t, git) {
  const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
  const { document, window } = parseHTML(html);
  const saved = new Map();
  const globals = { document, ResizeObserver: class { observe() {} }, localStorage: { getItem: () => null }, SOAPUI_GIT: git };
  for (const [key, value] of Object.entries(globals)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  t.after(() => { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  // LinkeDOM omits live form values and layout. Supply those browser semantics.
  for (const select of document.querySelectorAll('select')) {
    let value = select.querySelector('option').value;
    Object.defineProperty(select, 'value', { get: () => value, set: next => { value = next; } });
  }
  for (const input of document.querySelectorAll('input[type=checkbox]')) input.checked = input.hasAttribute('checked');
  Object.defineProperty(document.getElementById('compare-tree'), 'clientHeight', { value: 700 });
  document.getElementById('compare-tree').scrollTop = 0;
  let result, copied;
  const rpc = async (action, data) => {
    if (action === 'compare') {
      result = compareProjects(data.before ? await parseComparisonFile(data.before) : null, data.after ? await parseComparisonFile(data.after) : null, data);
      return { ...result, entries: result.entries.map(({ left, right, ...entry }) => entry) };
    }
    if (action === 'compare-options') {
      const { left, right } = result.entries[0];
      result = compareProjects(left ? { root: left } : null, right ? { root: right } : null, data);
      return { ...result, entries: result.entries.map(({ left, right, ...entry }) => entry) };
    }
    if (action === 'compare-detail') return diffPage(createXmlDiff(result.entries[data.nodeId], data), data.page, data.changesOnly);
    if (action === 'compare-clear') result = null;
  };
  const comparison = setupComparison(rpc, async value => { copied = value; });
  await comparison.ready;
  const $ = id => document.getElementById(id);
  const settle = async () => { for (let i = 0; i < 15; i++) await new Promise(resolve => setImmediate(resolve)); };
  const click = async node => { (typeof node === 'string' ? $(node) : node).dispatchEvent(new window.Event('click', { bubbles: true })); await settle(); };
  const check = async (node, value) => { node.checked = value; node.dispatchEvent(new window.Event('change', { bubbles: true })); await settle(); };
  return { $, document, window, comparison, click, check, settle, result: () => result, copied: () => copied };
}

test('Compare UI demo, hierarchy filter, XML diff, copy, keyboard, swap and clear use the real comparison core', async t => {
  const ui = await setup(t);
  await ui.click('compare-demo');
  assert.equal(ui.$('compare-error').hidden, true, ui.$('compare-error').textContent);
  assert.match(ui.$('compare-summary').textContent, /1 added · 0 removed · 4 changed/);
  assert.equal(ui.$('compare-tree-rows').children.length, 5);
  await ui.click(ui.document.querySelector('[role=treeitem][aria-label*="Check certificate revocation"]'));
  assert.match(ui.$('compare-detail').textContent, /Check revocation → Check certificate revocation/);
  assert.match(ui.$('compare-detail').textContent, /log.warn/);
  assert.ok(ui.document.querySelectorAll('.diff-cell.added').length > 0);
  assert.ok(ui.document.querySelectorAll('.diff-cell.removed').length > 0);
  const selected = ui.document.querySelector('[aria-selected=true]');
  await ui.click(selected.querySelector('.copy-name'));
  assert.equal(ui.copied(), 'Check certificate revocation');
  assert.match(ui.$('compare-detail').textContent, /Check revocation → Check certificate revocation/);
  await ui.check(ui.$('compare-only-changes'), false);
  assert.equal(ui.$('compare-tree-rows').children.length, 13);
  await ui.click('compare-collapse');
  assert.equal(ui.$('compare-tree-rows').children.length, 1);
  assert.equal(ui.$('compare-collapse').textContent, 'Expand');
  await ui.click('compare-collapse');
  const keyboard = new ui.window.Event('keydown', { bubbles: true, cancelable: true }); keyboard.key = 'End';
  ui.$('compare-tree').dispatchEvent(keyboard); await ui.settle();
  assert.equal(keyboard.defaultPrevented, true);
  assert.match(ui.$('compare-detail').textContent, /Health check/);
  await ui.click('compare-swap'); await ui.click('compare-run');
  assert.match(ui.$('compare-summary').textContent, /0 added · 1 removed · 4 changed/);
  await ui.click('compare-clear');
  assert.equal(ui.result(), null); assert.equal(ui.$('compare-tree-rows').children.length, 0);
});

test('Compare UI drops files, reports invalid input and does not render XML as HTML', async t => {
  const ui = await setup(t);
  await ui.click('compare-run');
  assert.match(ui.$('compare-error').textContent, /Choose the before/);
  const file = new File(['<soapui-project name="&lt;img onerror=&quot;bad&quot;&gt;"><description>&lt;script&gt;bad&lt;/script&gt;</description></soapui-project>'], 'literal.xml');
  ui.comparison.drop([file, file]);
  await ui.click('compare-run');
  assert.match(ui.$('compare-summary').textContent, /0 added · 0 removed · 0 changed/);
  await ui.check(ui.document.querySelector('#compare-detail input'), true);
  assert.match(ui.$('compare-detail').textContent, /<script>bad<\/script>/);
  assert.equal(ui.$('compare-detail').querySelectorAll('script,img').length, 0);
  ui.comparison.drop([new File(['<broken>'], 'bad.xml')]); await ui.click('compare-run');
  assert.equal(ui.$('compare-error').hidden, false);
  assert.equal(ui.$('compare-progress').hidden, true);
  assert.equal(ui.$('compare-run').disabled, false);
});

test('Git mode exposes file and revision choices, and compares missing files as removals', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async url => {
    const request = new URL(url, 'http://localhost');
    if (request.pathname.endsWith('/files')) return Response.json({ paths: request.searchParams.get('ref') === 'HEAD' ? ['project.xml'] : [], revision: '' });
    calls.push(request);
    return request.searchParams.get('ref') === 'HEAD' ? new Response('<soapui-project name="Before"/>', { headers: { 'X-Soapui-Revision': '1234567890abcdef' } }) : new Response(null, { status: 204 });
  };
  const ui = await setup(t, { base: '/session/', repository: 'synthetic', path: 'project.xml', branch: 'main', refs: [{ value: 'HEAD', label: 'HEAD' }, { value: 'WORKTREE', label: 'Working copy' }] });
  assert.equal(ui.$('git-path-before').value, 'project.xml');
  assert.equal(ui.$('git-path-after').value, 'project.xml');
  assert.match(ui.$('compare-after-name').textContent, /Not listed/);
  await ui.click('compare-run');
  assert.equal(ui.$('git-note').hidden, false);
  assert.deepEqual(calls.map(url => url.searchParams.get('ref')), ['HEAD', 'WORKTREE']);
  assert.ok(calls.every(url => url.searchParams.get('path') === 'project.xml' && url.searchParams.get('repository') === 'synthetic'));
  assert.match(ui.$('compare-summary').textContent, /0 added · 1 removed/);
  assert.match(ui.$('compare-before-name').textContent, /1234567890ab/);
  assert.match(ui.$('compare-after-name').textContent, /file not present/);
});


test('formatting filter is off by default and exposes original XML without rereading files', async t => {
  const ui = await setup(t);
  ui.comparison.drop([
    new File(['<soapui-project name="P" id="1"><testSuite name="S" id="s"/></soapui-project>'], 'before.xml'),
    new File(["<soapui-project id='1' name='P'>\n  <testSuite id='s' name='S'></testSuite>\n</soapui-project>"], 'after.xml'),
  ]);
  await ui.click('compare-run');
  assert.equal(ui.$('compare-formatting').checked, false);
  assert.match(ui.$('compare-summary').textContent, /0 changed/);
  await ui.check(ui.$('compare-formatting'), true);
  assert.match(ui.$('compare-summary').textContent, /2 changed \(2 formatting-only\)/);
  assert.equal(ui.$('compare-tree-rows').children.length, 2);
  await ui.click(ui.document.querySelector('[role=treeitem][aria-label^="Suite"]'));
  assert.match(ui.$('compare-detail').textContent, /≈ Formatting/);
  assert.match(ui.$('compare-detail').textContent, /id='s'/);
  assert.match(ui.$('compare-detail').textContent, /Whitespace markers/);
  const original = ui.document.querySelectorAll('#compare-detail input')[1];
  assert.equal(original.checked, true);
  await ui.check(original, false);
  assert.equal(ui.document.querySelectorAll('.diff-cell.added').length, 0);
  await ui.check(ui.$('compare-formatting'), false);
  assert.match(ui.$('compare-summary').textContent, /0 changed/);
  assert.equal(ui.$('compare-tree-rows').children.length, 1);
});


test('comparison setup and filters live in the sidebar and collapse after success', async t => {
  const ui = await setup(t);
  assert.ok(ui.$('compare-navigator').contains(ui.$('compare-inputs')));
  assert.ok(ui.$('compare-navigator').contains(ui.$('compare-summary')));
  assert.ok(ui.$('compare-navigator').contains(ui.$('compare-only-changes')));
  assert.ok(ui.$('compare-settings').hasAttribute('open'));
  await ui.click('compare-demo');
  assert.equal(ui.$('compare-settings').hasAttribute('open'), false);
  assert.match(ui.$('compare-source-summary').textContent, /example-before.xml → example-after.xml/);
  assert.equal(ui.document.querySelector('.compare-notes').hasAttribute('open'), false);
  ui.$('compare-settings').setAttribute('open', '');
  await ui.click('compare-swap');
  assert.ok(ui.$('compare-settings').hasAttribute('open'));
  assert.match(ui.$('compare-source-summary').textContent, /example-after.xml → example-before.xml/);
});

test('enter a Git folder, choose separate paths per branch, swap and return to linked paths without drops', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const context = { repository: '/synthetic/repository', path: '', branch: 'feature', refs: [
    { value: 'HEAD', label: 'HEAD' }, { value: 'WORKTREE', label: 'Working copy' },
    { value: 'refs/heads/main', label: 'Branch: main' }, { value: 'refs/heads/feature', label: 'Branch: feature' },
  ] };
  const requests = [];
  globalThis.fetch = async (url, options) => {
    const request = new URL(url, 'http://localhost');
    if (request.pathname.endsWith('/repository')) {
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), { path: '/synthetic/repository' });
      return Response.json(context);
    }
    const main = request.searchParams.get('ref') === 'refs/heads/main';
    if (request.pathname.endsWith('/files')) return Response.json({ paths: main ? ['old/project.xml'] : ['renamed/project.xml'] });
    requests.push(request);
    return new Response(`<soapui-project name="${main ? 'Before' : 'After'}"/>`);
  };
  const ui = await setup(t, { base: '/session/' });
  assert.equal(ui.$('git-repository-controls').hidden, false);
  ui.$('git-repository').value = '/synthetic/repository';
  await ui.click('git-open-repository');
  assert.equal(ui.$('compare-error').hidden, true, ui.$('compare-error').textContent);
  assert.equal(ui.$('git-before').value, 'refs/heads/main');
  assert.equal(ui.$('git-after').value, 'refs/heads/feature');
  assert.equal(ui.$('git-path-before').value, 'old/project.xml');
  assert.equal(ui.$('git-path-after').value, 'old/project.xml');
  assert.equal(ui.$('git-path-after').disabled, true);
  assert.match(ui.$('compare-after-name').textContent, /Not listed/);
  await ui.check(ui.$('git-same-path'), false);
  assert.equal(ui.$('git-path-after').disabled, false);
  ui.$('git-path-after').value = 'renamed/project.xml';
  ui.$('git-path-after').dispatchEvent(new ui.window.Event('input', { bubbles: true }));
  await ui.click('compare-run');
  assert.equal(ui.$('compare-error').hidden, true, ui.$('compare-error').textContent);
  assert.deepEqual(requests.map(url => [url.searchParams.get('ref'), url.searchParams.get('path')]), [
    ['refs/heads/main', 'old/project.xml'], ['refs/heads/feature', 'renamed/project.xml'],
  ]);
  assert.match(ui.$('compare-source-summary').textContent, /old\/project.xml → Branch: feature · renamed\/project.xml/);
  await ui.click('compare-swap');
  assert.equal(ui.$('git-path-before').value, 'renamed/project.xml');
  assert.equal(ui.$('git-after').value, 'refs/heads/main');
  await ui.check(ui.$('git-same-path'), true);
  assert.equal(ui.$('git-path-after').value, 'renamed/project.xml');
  ui.$('git-before').value = 'refs/heads/main';
  ui.$('git-before').dispatchEvent(new ui.window.Event('change', { bubbles: true }));
  await ui.settle();
  assert.equal(ui.$('git-path-before').value, 'renamed/project.xml', 'Branch switching must not silently change the selected path');
  assert.match(ui.$('compare-before-name').textContent, /Not listed/);
});
