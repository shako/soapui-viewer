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
  const globals = { document, Event: window.Event, ResizeObserver: class { observe() {} }, localStorage: { getItem: () => null }, SOAPUI_GIT: git };
  for (const [key, value] of Object.entries(globals)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  t.after(() => { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  // LinkeDOM omits live form values and layout. Supply those browser semantics.
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 20, top: 100, bottom: 130, width: 300 });
  window.HTMLInputElement.prototype.select = () => {};
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.showModal = () => dialog.setAttribute('open', '');
    dialog.close = () => dialog.removeAttribute('open');
  }
  Object.defineProperty(document.documentElement, 'clientHeight', { value: 720 });
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
  const selected = ui.document.querySelector('[role=treeitem][aria-selected=true]');
  assert.ok(selected.querySelector('.copy-name').nextElementSibling.classList.contains('change-badge'));
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

test('ID changes are opt-in and closing a suite recursively closes its cases with mouse or keyboard', async t => {
  const ui = await setup(t);
  const xml = '<soapui-project name="P" id="p1"><testSuite name="S" id="s1"><testCase name="C1" id="c1"><testStep name="A" id="a1"/></testCase><testCase name="C2"><testStep name="B"/></testCase></testSuite></soapui-project>';
  ui.comparison.drop([new File([xml], 'before.xml'), new File([xml.replace(/id="([^"]+)1"/g, (_, prefix) => `id="${prefix}2"`)], 'after.xml')]);
  await ui.click('compare-run');
  assert.equal(ui.$('compare-ids').checked, false);
  assert.match(ui.$('compare-summary').textContent, /0 changed/);
  await ui.check(ui.$('compare-ids'), true);
  assert.match(ui.$('compare-summary').textContent, /4 changed/);
  await ui.click(ui.document.querySelector('[role=treeitem][aria-label^="Step A,"]'));
  assert.ok(ui.$('compare-detail').textContent.includes('id="a2"'));
  await ui.check(ui.$('compare-ids'), false);
  assert.match(ui.$('compare-summary').textContent, /0 changed/);
  assert.equal(ui.$('compare-detail').querySelectorAll('.diff-cell.added').length, 0);
  await ui.check(ui.$('compare-only-changes'), false);
  const suite = () => ui.document.querySelector('[role=treeitem][aria-label^="Suite S,"]');
  const cases = () => [...ui.document.querySelectorAll('[role=treeitem][aria-label^="Case "]')];
  await ui.click(suite()); await ui.click(suite());
  assert.equal(cases().length, 2);
  assert.ok(cases().every(row => row.getAttribute('aria-expanded') === 'false'));
  assert.equal(ui.document.querySelectorAll('[role=treeitem][aria-label^="Step "]').length, 0);
  await ui.click(cases()[0]);
  assert.equal(ui.document.querySelectorAll('[role=treeitem][aria-label^="Step "]').length, 1);
  const key = async name => {
    const event = new ui.window.Event('keydown', { bubbles: true, cancelable: true }); event.key = name;
    ui.$('compare-tree').dispatchEvent(event); await ui.settle();
  };
  await key('ArrowUp'); // Select the suite without closing it.
  await key('ArrowLeft'); await key('ArrowRight');
  assert.ok(cases().every(row => row.getAttribute('aria-expanded') === 'false'));
  assert.equal(ui.document.querySelectorAll('[role=treeitem][aria-label^="Step "]').length, 0);
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

test('inline highlights render changed text safely and keep whitespace markers in original XML', async t => {
  const ui = await setup(t);
  const xml = text => `<soapui-project name="P"><testSuite name="S"><testCase name="C"><testStep name="Script"><config><script><![CDATA[\n${text}\n]]></script></config></testStep></testCase></testSuite></soapui-project>`;
  const before = 'file="store.jks";\tlog.info "<img src=x>"';
  const after = 'file="store.p12";  log.info "<script>alert(1)</script>"';
  ui.comparison.drop([new File([xml(before)], 'before.xml'), new File([xml(after)], 'after.xml')]);
  await ui.click('compare-run');
  await ui.click(ui.document.querySelector('[role=treeitem][aria-label^="Step Script,"]'));
  const left = () => ui.$('compare-detail').querySelector('.diff-cell.removed code');
  const right = () => ui.$('compare-detail').querySelector('.diff-cell.added code');
  assert.equal(left().textContent, before);
  assert.equal(right().textContent, after);
  assert.ok([...left().querySelectorAll('mark')].some(mark => mark.textContent === 'jks'));
  assert.ok([...right().querySelectorAll('mark')].some(mark => mark.textContent === 'p12'));
  assert.ok(![...right().querySelectorAll('mark')].some(mark => mark.textContent.includes('log.info')));
  assert.equal(ui.$('compare-detail').querySelectorAll('img,script').length, 0);
  await ui.check(ui.document.querySelectorAll('#compare-detail .field-controls input')[1], true);
  assert.equal(left().textContent, before.replaceAll(' ', '·').replaceAll('\t', '⇥'));
  assert.equal(right().textContent, after.replaceAll(' ', '·'));
  assert.ok([...right().querySelectorAll('mark')].some(mark => mark.textContent.includes('··')));
});

test('disabled badges distinguish both versions, additions and removals without marking enabled children', async t => {
  const ui = await setup(t);
  const xml = '<soapui-project name="P"><testSuite name="S" disabled="true"><testCase name="C" disabled="true"><testStep name="Paused" disabled="true"/><testStep name="Active" disabled="false"/><testStep name="Default"/><testStep name="Removed" disabled="true"/></testCase></testSuite></soapui-project>';
  const after = xml.replace('name="Paused" disabled="true"', 'name="Paused" disabled="false"')
    .replace('name="Active" disabled="false"', 'name="Active" disabled="true"').replace('name="Removed"', 'name="Added"');
  ui.comparison.drop([new File([xml], 'before.xml'), new File([after], 'after.xml')]);
  await ui.click('compare-run');
  await ui.check(ui.$('compare-only-changes'), false);
  const row = name => [...ui.document.querySelectorAll('[role=treeitem]')].find(item => item.querySelector('.node-name').textContent === name);
  const label = name => row(name).querySelector('.node-identity .disabled-label')?.textContent;
  assert.equal(label('P'), undefined);
  assert.equal(label('Default'), undefined, 'Parent status does not replace the child’s own disabled flag');
  for (const name of ['S', 'C', 'Added', 'Removed']) assert.equal(label(name), 'Disabled');
  assert.equal(label('Paused'), 'Disabled → Enabled');
  assert.equal(label('Active'), 'Enabled → Disabled');
  assert.match(row('Paused').getAttribute('aria-label'), /Disabled → Enabled/);
  for (const [name, expected] of [['Paused', [true, false]], ['Active', [false, true]], ['Added', [false, true]], ['Removed', [true, false]]]) {
    await ui.click(row(name));
    const headers = [...ui.document.querySelectorAll('.diff-head strong')];
    assert.deepEqual(headers.map(header => !!header.querySelector('.disabled-label')), expected, name);
    assert.match(ui.$('compare-detail').querySelector('.detail-kind').textContent, /Disabled/);
  }
});

test('Git mode stops when the working file is missing instead of displaying every item as removed', async t => {
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
  assert.match(ui.$('compare-after-name').textContent, /File not found in the working-copy list/);
  await ui.click('compare-run');
  assert.equal(ui.$('git-note').hidden, false);
  assert.deepEqual(calls.map(url => url.searchParams.get('ref')), ['HEAD', 'WORKTREE']);
  assert.ok(calls.every(url => url.searchParams.get('path') === 'project.xml' && url.searchParams.get('repository') === 'synthetic'));
  assert.equal(ui.result(), undefined, 'Missing inputs must not reach the comparison worker');
  assert.match(ui.$('compare-error').textContent, /Cannot compare.*project.xml.*Working copy.*synthetic/);
  assert.equal(ui.$('compare-error').hidden, false);
  assert.equal(ui.$('compare-tree-rows').children.length, 0);
  assert.ok(ui.$('compare-settings').hasAttribute('open'));
  assert.equal(ui.$('compare-run').disabled, false);
  assert.match(ui.$('compare-before-name').textContent, /1234567890ab/);
  assert.match(ui.$('compare-after-name').textContent, /file not found/);
});

test('a missing comparison file stops before reading the working XML and choosing a different file recovers', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  let missing = true;
  globalThis.fetch = async url => {
    const request = new URL(url, 'http://localhost');
    if (request.pathname.endsWith('/files')) return Response.json({ paths: ['project.xml', 'history/project.xml'] });
    const ref = request.searchParams.get('ref'), path = request.searchParams.get('path');
    calls.push([ref, path]);
    return ref === 'HEAD' && path === 'project.xml' && missing
      ? new Response(null, { status: 204 }) : new Response('<soapui-project name="Example"/>');
  };
  const ui = await setup(t, { base: '/session/', repository: '/synthetic/repository', path: 'project.xml', branch: 'main', refs: [
    { value: 'HEAD', label: 'HEAD (current commit)' }, { value: 'WORKTREE', label: 'Working copy: main' },
  ] });
  await ui.click('compare-run');
  assert.deepEqual(calls, [['HEAD', 'project.xml']], 'Do not load a large working file when its comparison version is absent');
  assert.equal(ui.result(), undefined);
  assert.match(ui.$('compare-error').textContent, /Cannot compare.*HEAD.*\/synthetic\/repository/);
  assert.equal(ui.$('compare-tree-rows').children.length, 0);
  await ui.click('choose-before');
  await ui.click([...ui.$('git-file-list').children].find(row => row.title === 'history/project.xml'));
  await ui.click('compare-run');
  assert.equal(ui.$('compare-error').hidden, true);
  assert.equal(ui.$('git-path-after').value, 'project.xml');
  assert.match(ui.$('compare-summary').textContent, /0 added · 0 removed · 0 changed/);
  await ui.click('git-use-working-path');
  await ui.click('compare-run');
  assert.equal(ui.$('compare-error').hidden, false);
  assert.equal(ui.$('compare-tree-rows').children.length, 0, 'An unsuccessful comparison clears previous results');
  assert.doesNotMatch(ui.$('compare-summary').textContent, /added|removed|changed/);
  missing = false;
  await ui.click('compare-run');
  assert.equal(ui.$('compare-error').hidden, true, 'A file that becomes available can be compared without reopening the repository');
});

test('inline branch picker searches, preserves selection, hides merged branches, and supports keyboard and swap', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const requests = [];
  globalThis.fetch = async url => { requests.push(url); return Response.json({ paths: ['project.xml'] }); };
  const committedAt = '2026-10-05T08:33:00Z';
  const refs = [
    { value: 'HEAD', label: 'HEAD (current commit)' }, { value: 'WORKTREE', label: 'Working copy (saved file)' },
    { value: 'refs/heads/feature/CRL', label: 'Branch: feature/CRL', committedAt, merged: true },
    { value: 'refs/remotes/origin/CRL', label: 'Remote: origin/CRL', committedAt, merged: false },
    { value: 'refs/tags/release-CRL', label: 'Tag: release-CRL', committedAt },
    { value: 'refs/heads/main', label: 'Branch: main', committedAt: '2025-01-01T00:00:00Z', merged: true },
    { value: 'refs/heads/old-branch', label: 'Branch: old-branch', committedAt: '2024-01-01T00:00:00Z', merged: true },
  ];
  const ui = await setup(t, { base: '/session/', repository: '/synthetic', branch: 'feature/CRL', baseRef: 'refs/heads/main', refs });
  const options = side => [...ui.$('git-options-' + side).querySelectorAll('[role=option]')];
  const names = side => options(side).map(row => row.firstChild.textContent);
  const filter = (side, query) => {
    ui.$('git-query-' + side).value = query;
    ui.$('git-query-' + side).dispatchEvent(new ui.window.Event('input', { bubbles: true }));
  };
  const key = async (side, key) => {
    const event = new ui.window.Event('keydown', { bubbles: true, cancelable: true }); event.key = key;
    ui.$('git-query-' + side).dispatchEvent(event); await ui.settle(); return event;
  };
  assert.equal(ui.$('git-query-before').getAttribute('role'), 'combobox');
  assert.equal(ui.$('git-filter-before'), null, 'Search is inside the version picker');
  assert.equal(ui.$('git-show-merged').checked, false);
  assert.ok(!names('before').includes('Branch: old-branch'));
  assert.ok(names('before').includes('Branch: main'));
  assert.ok(names('before').includes('Branch: feature/CRL'), 'Current branch stays visible even when merged');
  const date = new Date(committedAt);
  const expectedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  assert.equal(options('before').find(row => row.firstChild.textContent === 'Branch: feature/CRL').querySelector('small').textContent, `${expectedDate} · latest commit · merged`);
  assert.match(ui.$('git-matches-before').textContent, /1 merged hidden/);
  assert.ok(!names('before').includes('XML file'));
  assert.ok(!names('before').some(name => name.startsWith('Working copy')));
  ui.$('git-path-before').value = 'project.xml';
  ui.$('git-path-before').dispatchEvent(new ui.window.Event('input', { bubbles: true }));
  const source = ui.$('compare-source-summary').textContent;
  filter('before', ' cRl ');
  assert.equal(ui.$('git-before').value, 'refs/heads/main');
  assert.deepEqual(names('before'), ['Branch: feature/CRL', 'Remote: origin/CRL', 'Tag: release-CRL']);
  assert.match(ui.$('git-matches-before').textContent, /3 matching.*Selected version unchanged/);
  assert.equal(ui.$('compare-source-summary').textContent, source);
  assert.equal(ui.$('git-query-before').getAttribute('aria-expanded'), 'true');
  filter('before', 'no-such-branch');
  assert.deepEqual(names('before'), []);
  assert.match(ui.$('git-options-before').textContent, /No matching versions/);
  await key('before', 'Enter');
  assert.equal(ui.$('git-before').value, 'refs/heads/main');
  await key('before', 'Escape');
  assert.equal(ui.$('git-query-before').value, 'Branch: main');
  assert.equal(ui.$('git-options-before').hidden, true);
  assert.doesNotMatch(ui.$('git-matches-before').textContent, /matching|Selected version unchanged/);
  assert.equal(requests.length, 2, 'Typing filters does not fetch files or change versions');
  filter('before', 'CRL');
  await key('before', 'ArrowDown'); await key('before', 'Enter');
  assert.equal(ui.$('git-before').value, 'refs/remotes/origin/CRL');
  assert.equal(ui.$('git-query-before').value, 'Remote: origin/CRL');
  assert.match(requests.at(-1), /ref=refs%2Fremotes%2Forigin%2FCRL/);
  assert.equal(ui.$('git-path-before').value, 'project.xml');
  await ui.check(ui.$('git-show-merged'), true);
  filter('after', 'old-branch');
  await ui.click(options('after')[0]);
  assert.equal(ui.$('git-after').value, 'refs/heads/old-branch');
  await ui.check(ui.$('git-show-merged'), false);
  assert.ok(names('after').includes('Branch: old-branch'), 'Explicitly selected merged version remains usable');
  await ui.click('compare-swap');
  assert.equal(ui.$('git-before').value, 'refs/heads/old-branch');
  assert.equal(ui.$('git-query-before').value, 'Branch: old-branch');
  assert.equal(ui.$('git-after').value, 'refs/remotes/origin/CRL');
  filter('before', 'tag:'); await key('before', 'Tab');
  assert.equal(ui.$('git-query-before').value, 'Branch: old-branch');
  assert.equal(ui.$('git-options-before').hidden, true);
  await ui.click('compare-clear');
  assert.equal(ui.$('git-before').value, 'refs/heads/main');
  assert.equal(ui.$('git-after').value, 'WORKTREE');
  assert.equal(ui.$('git-path-after').value, '');
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
  assert.match(ui.$('compare-detail').textContent, /name='S'/);
  assert.match(ui.$('compare-detail').textContent, /SoapUI IDs ignored/);
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

test('repository history prefills the last folder, opens a saved folder and clears history without losing the active comparison setup', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const paths = ['/synthetic/SoapUI projects', '/synthetic/older <repo>'];
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/repository-history/clear')) return Response.json({ repositoryHistory: [], historyWarning: '' });
    if (url.endsWith('/repository')) {
      const { path } = JSON.parse(options.body);
      return Response.json({ repository: path, folder: path, branch: 'main', refs: [{ value: 'HEAD', label: 'HEAD' }, { value: 'WORKTREE', label: 'Working copy' }], repositoryHistory: [path, ...paths.filter(p => p !== path)] });
    }
    return Response.json({ paths: ['project.xml'] });
  };
  const ui = await setup(t, { base: '/session/', repositoryHistory: paths });
  assert.equal(requests.length, 0, 'Prefilling history must not open a folder automatically');
  assert.equal(ui.$('git-repository').value, paths[0]);
  assert.equal(ui.$('git-history-list').querySelector('repo'), null);
  ui.$('git-repository').dispatchEvent(new ui.window.Event('focus'));
  assert.equal(ui.$('git-history').open, true);
  await ui.click(ui.$('git-history-list').children[1]);
  assert.deepEqual(JSON.parse(requests[0].options.body), { path: paths[1] });
  assert.equal(ui.$('git-repository').value, paths[1]);
  assert.equal(ui.$('git-history').open, false);
  assert.equal(ui.$('git-history-list').children[0].textContent, paths[1]);
  assert.equal(ui.$('git-after').value, 'WORKTREE');
  await ui.click('git-clear-history');
  assert.equal(requests.at(-1).options.method, 'POST');
  assert.equal(ui.$('git-clear-history').disabled, true);
  assert.match(ui.$('git-history-list').textContent, /No recent repositories/);
  assert.equal(ui.$('git-repository').value, paths[1], 'Clearing history keeps the open repository');
  assert.equal(ui.$('git-after').value, 'WORKTREE');
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
  assert.equal(ui.$('git-after').value, 'WORKTREE');
  assert.equal(ui.$('git-path-before').value, '', 'Opening a repository must not select an arbitrary XML or POM file');
  assert.match(ui.$('compare-before-name').textContent, /same file you choose above/);
  assert.equal(ui.$('choose-before').textContent, 'Choose a different file');
  assert.equal(ui.$('choose-after').textContent, 'Choose working file');
  assert.equal(ui.$('git-path-before').hasAttribute('list'), false);
  ui.$('git-path-before').value = 'old/project.xml';
  ui.$('git-path-before').dispatchEvent(new ui.window.Event('input', { bubbles: true }));
  assert.equal(ui.$('git-path-after').value, 'old/project.xml');
  assert.equal(ui.$('git-path-after').disabled, false);
  await ui.check(ui.$('git-same-path'), false);
  assert.equal(ui.$('git-path-after').disabled, false);
  ui.$('git-path-after').value = 'renamed/project.xml';
  ui.$('git-path-after').dispatchEvent(new ui.window.Event('input', { bubbles: true }));
  await ui.click('compare-run');
  assert.equal(ui.$('compare-error').hidden, true, ui.$('compare-error').textContent);
  assert.deepEqual(requests.map(url => [url.searchParams.get('ref'), url.searchParams.get('path')]), [
    ['refs/heads/main', 'old/project.xml'], ['WORKTREE', 'renamed/project.xml'],
  ]);
  assert.match(ui.$('compare-source-summary').textContent, /old\/project.xml → Working copy · renamed\/project.xml/);
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

test('Git file chooser starts from the working copy, searches full paths, links paths, and reads another branch without a disk picker', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const workingPath = 'SoapUI/long folder with spaces/integration/certificates/AS4-project.xml';
  const oldPath = 'Legacy/integration/old-AS4-project.xml';
  const candidates = [...Array.from({ length: 250 }, (_, i) => `module-${i}/pom.xml`), workingPath];
  const requests = [];
  globalThis.fetch = async url => {
    const request = new URL(url, 'http://localhost');
    const working = request.searchParams.get('ref') === 'WORKTREE';
    if (request.pathname.endsWith('/files')) return Response.json({ paths: working ? candidates : [oldPath] });
    requests.push([request.searchParams.get('ref'), request.searchParams.get('path')]);
    return new Response(`<soapui-project name="${working ? 'Saved working changes' : 'Old commit'}"/>`);
  };
  const ui = await setup(t, { base: '/session/', repository: '/synthetic', branch: 'feature', refs: [
    { value: 'HEAD', label: 'HEAD' }, { value: 'WORKTREE', label: 'Working copy: feature' },
    { value: 'refs/heads/main', label: 'Branch: main' }, { value: 'refs/heads/feature', label: 'Branch: feature' },
  ] });
  let diskPickers = 0;
  for (const side of ['before', 'after']) ui.$('input-' + side).addEventListener('click', () => diskPickers++);
  const search = query => {
    ui.$('git-file-search').value = query;
    ui.$('git-file-search').dispatchEvent(new ui.window.Event('input', { bubbles: true }));
  };
  assert.equal(ui.$('git-after').value, 'WORKTREE');
  await ui.click('choose-after');
  assert.ok(ui.$('git-file-dialog').hasAttribute('open'));
  assert.match(ui.$('git-file-version').textContent, /After · Working copy: feature/);
  assert.match(ui.$('git-file-note').textContent, /uncommitted/);
  assert.match(ui.$('git-file-linked').textContent, /same file path/);
  assert.equal(ui.$('git-file-list').children.length, 200);
  assert.match(ui.$('git-file-count').textContent, /251 XML files.*first 200/);
  search('missing-project');
  assert.equal(ui.$('git-file-list').children.length, 0);
  assert.match(ui.$('git-file-count').textContent, /No XML files/);
  search('as4');
  assert.equal(ui.$('git-file-list').children.length, 1, 'Filtering reaches files beyond the first 200');
  const choice = ui.$('git-file-list').querySelector('button');
  assert.equal(choice.querySelector('strong').textContent, 'AS4-project.xml');
  assert.equal(choice.querySelector('span').textContent, workingPath, 'The full path stays readable');
  await ui.click(choice);
  assert.equal(ui.$('git-file-dialog').hasAttribute('open'), false);
  assert.equal(ui.$('git-path-before').value, workingPath);
  assert.equal(ui.$('git-path-after').value, workingPath);
  assert.equal(ui.$('git-after').value, 'WORKTREE');
  await ui.click('choose-before');
  assert.match(ui.$('git-file-version').textContent, /Before · Branch: main/);
  assert.match(ui.$('git-file-note').textContent, /No checkout required/);
  assert.equal(ui.$('git-file-list').querySelector('span').textContent, oldPath);
  await ui.click('git-file-close');
  assert.equal(ui.$('git-path-before').value, workingPath, 'Cancel preserves the selected path');
  await ui.check(ui.$('git-same-path'), false);
  await ui.click('choose-before');
  assert.match(ui.$('git-file-linked').textContent, /working file stays unchanged/);
  await ui.click(ui.$('git-file-list').querySelector('button'));
  assert.equal(ui.$('git-path-before').value, oldPath);
  assert.equal(ui.$('git-path-after').value, workingPath);
  await ui.click('compare-run');
  assert.equal(ui.$('compare-error').hidden, true, ui.$('compare-error').textContent);
  assert.deepEqual(requests, [['refs/heads/main', oldPath], ['WORKTREE', workingPath]]);
  assert.equal(diskPickers, 0, 'Git and working-copy buttons never open the filesystem picker');
  ui.$('git-before').value = 'file';
  ui.$('git-before').dispatchEvent(new ui.window.Event('change', { bubbles: true }));
  await ui.settle();
  assert.equal(ui.$('choose-before').textContent, 'Choose local XML');
  await ui.click('choose-before');
  assert.equal(diskPickers, 1, 'A standalone file remains an explicit alternate source');
});

test('simple Git flow preserves the chosen subfolder, fixes the working version, and permits a different comparison file', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const workingPath = 'soapui_development/current.xml', alternatePath = 'archive/old.xml';
  const reads = [];
  globalThis.fetch = async url => {
    const request = new URL(url, 'http://localhost');
    if (request.pathname.endsWith('/files')) return Response.json({ paths: request.searchParams.get('ref') === 'WORKTREE' ? [workingPath, 'sibling/other.xml'] : [alternatePath] });
    reads.push([request.searchParams.get('ref'), request.searchParams.get('path')]);
    return new Response('<soapui-project name="Example"/>');
  };
  const ui = await setup(t, { base: '/session/', repository: '/synthetic/local', folder: '/synthetic/local/soapui_development', folderPrefix: 'soapui_development', branch: 'main', baseRef: 'refs/heads/main', refs: [
    { value: 'HEAD', label: 'HEAD (current commit)' }, { value: 'WORKTREE', label: 'Working copy: main' },
    { value: 'refs/heads/main', label: 'Branch: main', merged: true },
  ] });
  assert.equal(ui.$('git-repository').value, '/synthetic/local/soapui_development');
  assert.equal(ui.$('git-repository-root').hidden, false);
  assert.match(ui.$('git-repository-root').textContent, /repository: \/synthetic\/local$/);
  assert.match(ui.$('git-note').textContent, /only one branch/);
  assert.equal(ui.$('git-show-merged-label').hidden, true, 'No misleading merged-branch filter when only main exists');
  assert.equal(ui.$('drop-after').nextElementSibling, ui.$('drop-before'), 'Working file is the first step');
  assert.equal(ui.$('git-version-after').hidden, true, 'Only the comparison branch needs a version selector');
  assert.equal(ui.$('git-same-path-label').hidden, true, 'Same-path linking is automatic');
  assert.equal(ui.$('git-path-label-before').hidden, true);
  await ui.click('choose-after');
  assert.equal(ui.$('git-file-search').value, 'soapui_development/');
  assert.equal(ui.$('git-file-list').children.length, 1, 'Initially browse inside the folder the user supplied');
  await ui.click(ui.$('git-file-list').firstChild);
  assert.equal(ui.$('git-path-after').value, workingPath);
  assert.equal(ui.$('git-path-before').value, workingPath);
  assert.match(ui.$('compare-before-name').textContent, /File not found on this branch/);
  await ui.click('choose-before'); await ui.click('git-file-close');
  assert.equal(ui.$('git-same-path').checked, true, 'Cancel does not unlink the default path');
  await ui.click('choose-before');
  ui.$('git-file-search').value = 'archive';
  ui.$('git-file-search').dispatchEvent(new ui.window.Event('input'));
  await ui.click(ui.$('git-file-list').firstChild);
  assert.equal(ui.$('git-path-after').value, workingPath);
  assert.equal(ui.$('git-path-before').value, alternatePath);
  assert.equal(ui.$('git-same-path').checked, false);
  assert.equal(ui.$('git-use-working-path').hidden, false);
  await ui.click('compare-run');
  assert.deepEqual(reads, [['HEAD', alternatePath], ['WORKTREE', workingPath]]);
  await ui.click('git-use-working-path');
  assert.equal(ui.$('git-path-before').value, workingPath);
  assert.equal(ui.$('git-path-label-before').hidden, true);
});
