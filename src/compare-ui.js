import { setupSplitter } from './splitter.js';
import { demoProjects } from './demo.js';

const $ = id => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (text, action) => {
  const node = el('button', 'button secondary', text);
  node.addEventListener('click', action);
  return node;
};
const badges = { added: '+ Added', removed: '− Removed', modified: '~ Changed', unchanged: '= Unchanged' };
const badge = entry => entry.formattingOnly ? '≈ Formatting' : badges[entry.status];
const kinds = { project: 'Project', suite: 'Suite', case: 'Case', step: 'Step' };

export function setupComparison(rpc, copyText) {
  let files = { before: null, after: null };
  let result, selected, busy = false, rows = [], collapsed = new Set(), ticket = 0;
  let git = globalThis.SOAPUI_GIT;
  const paths = { before: [], after: [] };
  const error = message => { $('compare-error').textContent = message; $('compare-error').hidden = !message; };
  const guard = action => (...args) => {
    try { Promise.resolve(action(...args)).catch(e => error(e.message)); } catch (e) { error(e.message); }
  };

  function invalidate() {
    ++ticket;
    $('compare-settings').setAttribute('open', '');
    result = null;
    selected = null;
    $('compare-tree-spacer').style.height = '0px';
    $('compare-tree-rows').replaceChildren();
    $('compare-detail').replaceChildren(el('div', 'welcome', 'Choose a before and after version, then select Compare.'));
    $('compare-summary').textContent = 'Compare the same project at two points in time.';
    $('compare-collapse').disabled = true;
  }
  const versionName = side => git?.refs?.find(ref => ref.value === $('git-' + side).value)?.label || 'XML file';
  function fileLabels() {
    for (const side of ['before', 'after']) {
      const fromGit = git?.repository && $('git-' + side).value !== 'file';
      const path = $('git-path-' + side).value;
      $('git-path-label-' + side).hidden = !fromGit;
      $('compare-' + side + '-name').textContent = fromGit
        ? !path ? 'Choose or type a project path.' : paths[side].includes(path) ? `${paths[side].length} XML files in this version` : 'Not listed in this version. Compare as absent, or choose another path.'
        : files[side]?.name || 'Drop one XML file here or choose a file';
    }
    const description = side => $('git-' + side).value !== 'file' && git?.repository
      ? `${versionName(side)} · ${$('git-path-' + side).value || 'Choose a file'}` : files[side]?.name || 'Choose XML';
    const summary = $('compare-source-summary');
    summary.textContent = `${description('before')} → ${description('after')}`;
    summary.title = summary.textContent;
    $('git-path-after').disabled = busy || ($('git-same-path').checked && $('git-after').value !== 'file');
  }
  async function gitJSON(route, options) {
    const response = await fetch(git.base + route, { cache: 'no-store', ...options });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }
  async function loadPaths(side) {
    const ref = $('git-' + side).value;
    paths[side] = [];
    $('git-files-' + side).replaceChildren();
    if (!git?.repository || ref === 'file') return;
    const data = await gitJSON(`files?repository=${encodeURIComponent(git.repository)}&ref=${encodeURIComponent(ref)}`);
    paths[side] = data.paths;
    filterPathChoices(side);
  }
  function filterPathChoices(side) {
    const query = $('git-path-' + side).value.toLowerCase();
    const list = document.createDocumentFragment();
    // Keep native suggestions usable in repositories with thousands of XML files.
    // Typing narrows the list, and any relative XML path can also be entered.
    for (const path of paths[side].filter(path => path.toLowerCase().includes(query)).slice(0, 200)) {
      const option = el('option'); option.value = path; list.append(option);
    }
    $('git-files-' + side).replaceChildren(list);
  }
  function linkPaths() {
    if ($('git-same-path').checked) $('git-path-after').value = $('git-path-before').value;
    for (const side of ['before', 'after']) filterPathChoices(side);
    fileLabels();
  }
  async function configureGit(context) {
    git = { ...context, base: git.base };
    $('git-repository').value = git.repository;
    $('git-note').hidden = false;
    $('git-note').textContent = `Current branch: ${git.branch || 'Detached HEAD'}. Local versions only; no checkout or fetch.`;
    $('git-same-path-label').hidden = false;
    $('git-same-path').checked = true;
    for (const side of ['before', 'after']) {
      const select = $('git-' + side);
      select.parentElement.hidden = false;
      const local = el('option', '', 'XML file'); local.value = 'file';
      select.replaceChildren(local);
      for (const ref of git.refs) { const option = el('option', '', ref.label); option.value = ref.value; select.append(option); }
    }
    const baseline = ['refs/heads/main', 'refs/heads/master'].find(ref => git.refs.some(item => item.value === ref));
    const current = `refs/heads/${git.branch}`;
    const branchComparison = !git.path && baseline && current !== baseline && git.refs.some(item => item.value === current);
    $('git-before').value = branchComparison ? baseline : 'HEAD';
    $('git-after').value = branchComparison ? current : 'WORKTREE';
    await Promise.all(['before', 'after'].map(loadPaths));
    const afterPaths = new Set(paths.after);
    $('git-path-before').value = git.path || paths.before.find(path => afterPaths.has(path)) || paths.before[0] || paths.after[0] || '';
    linkPaths();
  }
  $('git-open-repository').addEventListener('click', guard(async () => {
    if (busy) return;
    setBusy(true); invalidate(); error('');
    $('compare-progress-label').textContent = 'Reading repository…';
    try {
      const context = await gitJSON('repository', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: $('git-repository').value }) });
      await configureGit(context);
    } finally { setBusy(false); }
  }));
  $('git-repository').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); $('git-open-repository').click(); }
  });
  $('git-same-path').addEventListener('change', () => { linkPaths(); invalidate(); });
  for (const side of ['before', 'after']) {
    $('git-path-' + side).addEventListener('input', () => { linkPaths(); invalidate(); error(''); });
  }
  function setFile(side, list) {
    if (busy || !list.length) return;
    if (list.length !== 1) { error('Drop one project version on each side.'); return; }
    files[side] = list[0];
    $('git-' + side).value = 'file';
    fileLabels(); invalidate(); error('');
  }
  for (const side of ['before', 'after']) {
    $('choose-' + side).addEventListener('click', () => $('input-' + side).click());
    $('input-' + side).addEventListener('change', event => { setFile(side, [...event.target.files]); event.target.value = ''; });
    const zone = $('drop-' + side);
    zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('dragging'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
    zone.addEventListener('drop', event => {
      event.preventDefault(); event.stopPropagation(); zone.classList.remove('dragging');
      setFile(side, [...event.dataTransfer.files]);
    });
    $('git-' + side).addEventListener('change', guard(async () => {
      if (busy) return;
      invalidate(); error(''); setBusy(true);
      $('compare-progress-label').textContent = 'Listing XML files…';
      try { await loadPaths(side); linkPaths(); } finally { setBusy(false); }
    }));
  }
  function setBusy(value) {
    busy = value;
    for (const input of $('compare-inputs').querySelectorAll('button, input, select')) input.disabled = value;
    $('compare-clear').disabled = value;
    $('compare-formatting').disabled = value;
    $('compare-progress').hidden = !value;
    $('git-path-after').disabled = value || ($('git-same-path').checked && $('git-after').value !== 'file');
  }
  async function source(side) {
    const ref = $('git-' + side).value;
    if (!git || ref === 'file') {
      if (!files[side]) throw new Error(`Choose the ${side} XML file.`);
      return files[side];
    }
    const path = $('git-path-' + side).value;
    if (!path) throw new Error(`Choose the ${side} project file.`);
    const response = await fetch(`${git.base}file?repository=${encodeURIComponent(git.repository)}&ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(path)}`, { cache: 'no-store' });
    if (response.status === 204) { $('compare-' + side + '-name').textContent = `${path} · ${versionName(side)} · file not present`; return null; }
    if (!response.ok) throw new Error(await response.text());
    const revision = response.headers.get('X-Soapui-Revision');
    const name = `${path} · ${versionName(side)}${revision ? ` · ${revision.slice(0, 12)}` : ''}`;
    $('compare-' + side + '-name').textContent = name;
    return new File([await response.blob()], name);
  }
  async function compare() {
    if (busy) return;
    invalidate(); error(''); setBusy(true);
    $('compare-progress-label').textContent = 'Reading project versions…';
    try {
      const before = await source('before'), after = await source('after');
      result = await rpc('compare', { before, after, includeFormatting: $('compare-formatting').checked });
      collapsed.clear();
      selected = result.rootId;
      summarize();
      $('compare-collapse').disabled = false;
      $('compare-tree').scrollTop = 0;
      refreshRows();
      await showDetail();
      $('compare-settings').removeAttribute('open');
    } finally { setBusy(false); }
  }
  function summarize() {
    const c = result.counts, k = result.kindsChanged;
    $('compare-summary').textContent = `${c.added} added · ${c.removed} removed · ${c.modified} changed${result.formattingCount ? ` (${result.formattingCount} formatting-only)` : ''} · Affected: ${k.project} project, ${k.suite} suites, ${k.case} cases, ${k.step} steps`;
  }
  $('compare-formatting').addEventListener('change', guard(async () => {
    if (!result || busy) return;
    setBusy(true); error('');
    $('compare-progress-label').textContent = 'Updating comparison…';
    try {
      result = await rpc('compare-options', { includeFormatting: $('compare-formatting').checked });
      summarize();
      $('compare-tree').scrollTop = 0;
      refreshRows();
      await showDetail();
    } finally { setBusy(false); }
  }));
  $('compare-run').addEventListener('click', guard(compare));
  $('compare-swap').addEventListener('click', () => {
    [files.before, files.after] = [files.after, files.before];
    const a = $('git-before'), b = $('git-after');
    [a.value, b.value] = [b.value, a.value];
    const pathA = $('git-path-before'), pathB = $('git-path-after');
    [pathA.value, pathB.value] = [pathB.value, pathA.value];
    [paths.before, paths.after] = [paths.after, paths.before];
    linkPaths(); invalidate();
  });
  $('compare-clear').addEventListener('click', guard(async () => {
    files = { before: null, after: null };
    $('git-before').value = $('git-after').value = 'file';
    fileLabels(); invalidate(); error('');
    await rpc('compare-clear');
  }));
  $('compare-demo').addEventListener('click', guard(async () => {
    const before = demoProjects[0].xml.replace('name="Check revocation"', 'name="Check revocation" id="demo-revocation"');
    const after = before.replace('Check revocation', 'Check certificate revocation')
      .replace('log.info', 'log.warn')
      .replace('</con:testCase>', '<con:testStep name="New verification" type="groovy"><con:config><con:script>assert true</con:script></con:config></con:testStep></con:testCase>');
    files = { before: new File([before], 'example-before.xml'), after: new File([after], 'example-after.xml') };
    $('git-before').value = $('git-after').value = 'file';
    fileLabels();
    await compare();
  }));

  function refreshRows() {
    if (!result) return;
    rows = [];
    const visit = (id, depth) => {
      const entry = result.entries[id];
      if ($('compare-only-changes').checked && entry.status === 'unchanged' && id !== result.rootId) return;
      rows.push({ entry, depth });
      if (!collapsed.has(id)) for (const child of entry.children) visit(child, depth + 1);
    };
    visit(result.rootId, 0);
    if (!rows.some(row => row.entry.id === selected)) { selected = result.rootId; guard(showDetail)(); }
    $('compare-tree-spacer').style.height = `${rows.length * 42}px`;
    $('compare-collapse').textContent = rows.some(({ entry }) => entry.children.length && !collapsed.has(entry.id)) ? 'Collapse' : 'Expand';
    renderTree();
  }
  function renderTree() {
    if (!result) return;
    const tree = $('compare-tree');
    const start = Math.max(0, Math.floor(tree.scrollTop / 42) - 5);
    const end = Math.min(rows.length, start + Math.ceil(tree.clientHeight / 42) + 10);
    const fragment = document.createDocumentFragment();
    for (const { entry, depth } of rows.slice(start, end)) {
      const row = el('div', `tree-row ${entry.id === selected ? 'selected' : ''}`);
      row.id = `comparison-item-${entry.id}`;
      row.style.paddingLeft = `${9 + depth * 18}px`;
      row.setAttribute('role', 'treeitem');
      row.setAttribute('aria-level', depth + 1);
      row.setAttribute('aria-selected', entry.id === selected);
      row.setAttribute('aria-label', `${kinds[entry.kind]} ${entry.name}, ${badge(entry)}${entry.reordered ? ', order changed' : ''}`);
      if (entry.children.length) row.setAttribute('aria-expanded', !collapsed.has(entry.id));
      row.title = `${kinds[entry.kind]}: ${entry.name}`;
      row.append(el('span', 'tree-toggle', entry.children.length ? collapsed.has(entry.id) ? '▸' : '▾' : ''), el('span', `node-icon ${entry.kind}`, kinds[entry.kind][0]));
      const identity = el('span', 'node-identity');
      const copy = button('Copy', guard(async event => {
        await copyText(entry.name);
        $('compare-copy-status').textContent = `Copied ${entry.name}`;
      }));
      // Stop synchronously: clipboard completion must not toggle the parent row.
      copy.addEventListener('click', event => event.stopPropagation());
      copy.classList.add('copy-name');
      copy.tabIndex = entry.id === selected ? 0 : -1;
      copy.setAttribute('aria-label', `Copy ${entry.name}`);
      identity.append(el('span', 'node-name', entry.name), copy);
      row.append(identity, el('span', `change-badge ${entry.formattingOnly ? 'formatting' : entry.status}`, entry.reordered ? '↕ Order' : badge(entry)));
      row.addEventListener('click', guard(async () => {
        selected = entry.id;
        tree.focus({ preventScroll: true });
        if (entry.children.length) collapsed.has(entry.id) ? collapsed.delete(entry.id) : collapsed.add(entry.id);
        refreshRows(); await showDetail();
      }));
      fragment.append(row);
    }
    $('compare-tree-rows').style.transform = `translateY(${start * 42}px)`;
    $('compare-tree-rows').replaceChildren(fragment);
    const active = $(`comparison-item-${selected}`);
    if (active) tree.setAttribute('aria-activedescendant', active.id);
    else tree.removeAttribute('aria-activedescendant');
  }
  $('compare-only-changes').addEventListener('change', () => { $('compare-tree').scrollTop = 0; refreshRows(); });
  $('compare-collapse').addEventListener('click', () => {
    if (!result) return;
    if (rows.some(({ entry }) => entry.children.length && !collapsed.has(entry.id))) collapsed = new Set(result.entries.filter(e => e.children.length).map(e => e.id));
    else collapsed.clear();
    refreshRows();
  });
  $('compare-tree').addEventListener('scroll', renderTree, { passive: true });
  new ResizeObserver(renderTree).observe($('compare-tree'));
  $('compare-tree').addEventListener('keydown', guard(async event => {
    if (event.target !== event.currentTarget || !result || !rows.length) return;
    const index = rows.findIndex(r => r.entry.id === selected), current = result.entries[selected];
    let target;
    if (event.key === 'ArrowDown') target = rows[Math.min(rows.length - 1, index + 1)].entry.id;
    else if (event.key === 'ArrowUp') target = rows[Math.max(0, index - 1)].entry.id;
    else if (event.key === 'Home') target = rows[0].entry.id;
    else if (event.key === 'End') target = rows.at(-1).entry.id;
    else if (event.key === 'ArrowRight' && current.children.length) {
      if (collapsed.has(selected)) collapsed.delete(selected);
      else target = rows[index + 1]?.depth > rows[index].depth ? rows[index + 1].entry.id : undefined;
    } else if (event.key === 'ArrowLeft') {
      if (current.children.length && !collapsed.has(selected)) collapsed.add(selected);
      else target = current.parentId;
    } else return;
    event.preventDefault();
    if (target != null) selected = target;
    refreshRows();
    const top = rows.findIndex(r => r.entry.id === selected) * 42, tree = $('compare-tree');
    if (top < tree.scrollTop || top + 42 > tree.scrollTop + tree.clientHeight) tree.scrollTop = top;
    renderTree(); await showDetail();
  }));

  async function showDetail() {
    if (!result) return;
    const version = ++ticket, entry = result.entries[selected];
    const detail = $('compare-detail');
    const head = el('div', 'detail-head');
    const path = []; let ancestor = entry;
    while (ancestor) { path.unshift(ancestor.name); ancestor = result.entries[ancestor.parentId]; }
    head.append(el('p', 'breadcrumb', path.join(' › ')), el('p', 'detail-kind', `${kinds[entry.kind]} · ${badge(entry)}`), el('h2', '', entry.beforeName && entry.afterName && entry.beforeName !== entry.afterName ? `${entry.beforeName} → ${entry.afterName}` : entry.name));
    const note = entry.reordered ? `Order changed: position ${entry.beforePosition} → ${entry.afterPosition}. ` : '';
    
    const body = el('div', 'compare-body');
    const notes = el('details', 'compare-notes');
    notes.append(el('summary', '', 'Details and changed children'));
    notes.append(el('p', 'source-meta', note + (entry.kind === 'step' ? 'Complete step XML, formatted for reading.' : 'Own XML only. Nested suites, cases and steps are listed separately below and in the tree.')));
    if (entry.children.length) {
      const children = entry.children.map(id => result.entries[id]);
      const changed = children.filter(child => child.status !== 'unchanged');
      notes.append(el('p', 'match-note', `${changed.length} of ${children.length} direct children changed${entry.orderChanged ? ' · Child order changed' : ''}. Select one to inspect its XML.`));
      const list = el('div', 'compare-children');
      for (const child of changed.slice(0, 50)) {
        const link = button(`${badge(child)} · ${child.name}${child.reordered ? ` · position ${child.beforePosition} → ${child.afterPosition}` : ''}`, guard(async () => {
          selected = child.id;
          let parent = result.entries[child.parentId];
          while (parent) { collapsed.delete(parent.id); parent = result.entries[parent.parentId]; }
          refreshRows(); $('compare-tree').scrollTop = rows.findIndex(r => r.entry.id === selected) * 42;
          await showDetail();
        }));
        list.append(link);
      }
      notes.append(list);
      if (changed.length > 50) notes.append(el('p', 'match-note', 'The first 50 changed children are listed here. All items are available in the tree.'));
    }
    const label = el('label', 'check');
    const all = el('input'); all.type = 'checkbox';
    label.append(all, document.createTextNode('Show unchanged XML lines'));
    const originalLabel = el('label', 'check');
    const original = el('input'); original.type = 'checkbox'; original.checked = entry.formattingOnly;
    originalLabel.append(original, document.createTextNode('Show original XML (including formatting)'));
    const controls = el('div', 'field-controls'); controls.append(label, originalLabel);
    const info = el('p', 'source-meta', 'Comparing XML…');
    const grid = el('div', 'diff-grid');
    const paging = el('div', 'page-tools');
    notes.append(info);
    body.append(controls, notes, grid, paging);
    detail.replaceChildren(head, body);
    async function page(number = 0) {
      const mine = ++ticket;
      const data = await rpc('compare-detail', { nodeId: entry.id, page: number, changesOnly: !all.checked, original: original.checked });
      if (mine !== ticket || !result) return;
      info.textContent = `${data.fallback ? 'Large change: showing complete blocks without fine alignment. ' : ''}Red = before · Green = after. ${original.checked ? 'Original XML, with nested hierarchy items omitted. Whitespace markers: · space, ⇥ tab, ␍ carriage return.' : 'Formatted XML fragments.'} Line numbers refer to these fragments; ↳ continues a long line.`;
      const content = document.createDocumentFragment();
      const headers = el('div', 'diff-row diff-head');
      headers.append(el('strong', '', 'Before'), el('strong', '', 'After'));
      content.append(headers);
      if (!data.rows.length) {
        const message = el('p', 'diff-empty', entry.status === 'unchanged' ? 'No XML differences.' : 'No own XML differences. Changes are in the children or their order.');
        content.append(message);
      }
      for (const row of data.rows) {
        if (row.gap) content.append(el('p', 'diff-gap', '⋯ Unchanged lines ⋯'));
        const line = el('div', 'diff-row');
        for (const side of ['left', 'right']) {
          const value = row[side];
          const cell = el('div', `diff-cell ${value && row.status === 'changed' ? side === 'left' ? 'removed' : 'added' : ''}`);
          cell.append(el('span', 'diff-number', value ? `${value.continued ? '↳' : value.line} ${row.status === 'changed' ? side === 'left' ? '−' : '+' : ''}` : ''), el('code', '', original.checked ? (value?.text || '').replace(/ /g, '·').replace(/\t/g, '⇥').replace(/\r/g, '␍') : value?.text || ''));
          line.append(cell);
        }
        content.append(line);
      }
      grid.replaceChildren(content);
      grid.scrollTop = 0;
      const previous = button('Previous', guard(() => page(data.page - 1))), next = button('Next', guard(() => page(data.page + 1)));
      previous.disabled = data.page === 0; next.disabled = data.page + 1 >= data.pages;
      paging.replaceChildren(previous, el('span', '', `Page ${data.page + 1} of ${data.pages}`), next);
    }
    all.addEventListener('change', guard(() => page()));
    original.addEventListener('change', guard(() => page()));
    if (version === ticket) await page();
  }

  setupSplitter($('compare-workspace'), $('compare-splitter'), $('compare-navigator'));
  invalidate();
  const ready = (async () => {
    if (!git) return;
    $('compare-git-help').hidden = true;
    $('git-repository-controls').hidden = false;
    if (!git.repository) return;
    setBusy(true);
    $('compare-progress-label').textContent = 'Listing XML files…';
    try { await configureGit(git); }
    catch (e) { error(e.message); }
    finally { setBusy(false); }
  })();
  return {
    ready,
    progress(data) { $('compare-progress-label').textContent = `Reading ${data.fileName}… ${Math.round(data.progress * 100)}%`; $('compare-progress-bar').value = data.progress; },
    drop(list) {
      if (busy || !list.length) return;
      if (list.length === 2) { setFile('before', [list[0]]); setFile('after', [list[1]]); }
      else if (list.length === 1) setFile(files.before ? 'after' : 'before', list);
      else error('Choose two versions of one project.');
    },
  };
}
