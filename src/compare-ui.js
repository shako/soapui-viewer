import { setupSplitter } from './splitter.js';
import { demoProjects } from './demo.js';
import { setupVersionPicker } from './git-version-picker.js';

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
const disabledLabel = entry => entry.beforeDisabled != null && entry.afterDisabled != null && entry.beforeDisabled !== entry.afterDisabled
  ? entry.afterDisabled ? 'Enabled → Disabled' : 'Disabled → Enabled'
  : entry.afterDisabled || entry.beforeDisabled ? 'Disabled' : '';

export function setupComparison(rpc, copyText) {
  let files = { before: null, after: null };
  let result, selected, busy = false, rows = [], collapsed = new Set(), ticket = 0;
  let git = globalThis.SOAPUI_GIT;
  let filePickerSide;
  const paths = { before: [], after: [] };
  const pickers = Object.fromEntries(['before', 'after'].map(side => [side, setupVersionPicker(side, () => {
    $('git-' + side).dispatchEvent(new Event('change', { bubbles: true }));
  })]));
  const error = message => { $('compare-error').textContent = message; $('compare-error').hidden = !message; };
  const guard = action => (...args) => {
    try { Promise.resolve(action(...args)).catch(e => error(e.message)); } catch (e) { error(e.message); }
  };

  function invalidate() {
    ++ticket;
    $('compare-settings').setAttribute('open', '');
    result = null;
    selected = null;
    $('compare-navigator').classList.remove('has-comparison');
    $('compare-tree-spacer').style.height = '0px';
    $('compare-tree-rows').replaceChildren();
    $('compare-detail').replaceChildren(el('div', 'welcome', workingComparison() ? 'Choose your working file and the comparison branch, then select Compare.' : 'Choose a before and after version, then select Compare.'));
    $('compare-summary').textContent = 'Compare the same project at two points in time.';
    $('compare-collapse').disabled = true;
  }
  const versionName = side => git?.refs?.find(ref => ref.value === $('git-' + side).value)?.label || 'XML file';
  const workingComparison = () => git?.repository && $('git-after').value === 'WORKTREE' && $('git-before').value !== 'file';
  function fileLabels() {
    const working = workingComparison();
    $('compare-before-title').textContent = working ? '2. Compare with' : 'Before';
    $('compare-after-title').textContent = working ? '1. Current working copy' : 'After';
    $('git-version-label-before').textContent = working ? 'Branch' : 'Version';
    $('git-version-after').hidden = !git?.repository || working;
    $('git-matches-after').hidden = !git?.repository || working;
    $('git-same-path-label').hidden = !git?.repository || working;
    $('git-use-working-path').hidden = !working || $('git-same-path').checked;
    $('compare-swap').hidden = working;
    $('compare-demo').hidden = working;
    const first = $(working ? 'drop-after' : 'drop-before'), second = $(working ? 'drop-before' : 'drop-after');
    if (first.nextElementSibling !== second) $('compare-inputs').insertBefore(first, second);
    for (const side of ['before', 'after']) {
      const fromGit = git?.repository && $('git-' + side).value !== 'file';
      const path = $('git-path-' + side).value;
      $('choose-' + side).textContent = working && side === 'before' ? 'Choose a different file' : fromGit ? $('git-' + side).value === 'WORKTREE' ? 'Choose working file' : 'Choose from Git' : 'Choose local XML';
      $('git-path-label-' + side).hidden = !fromGit || (working && side === 'before' && $('git-same-path').checked);
      $('compare-' + side + '-name').textContent = fromGit
        ? !path ? 'Choose a SoapUI file from this version, or type its repository path.' : paths[side].includes(path) ? `${paths[side].length} XML files in this version${$('git-' + side).value === 'WORKTREE' ? ' · Includes saved, uncommitted changes.' : ''}` : 'Not listed in this version. Check the file path before comparing.'
        : files[side]?.name || 'Drop one XML file here or choose a file';
      if (working && side === 'after') $('compare-after-name').textContent = `${versionName('after')} · ${path && !paths.after.includes(path) ? 'File not found in the working-copy list. Check the file path before comparing.' : 'Includes saved, uncommitted changes.'}`;
      if (working && side === 'before' && $('git-same-path').checked) $('compare-before-name').textContent = !path
        ? 'Uses the same file you choose above.'
        : paths.before.includes(path) ? `Same file: ${path}` : `File not found on this branch: ${path}. Choose another branch or a different file.`;
    }
    const description = side => $('git-' + side).value !== 'file' && git?.repository
      ? `${versionName(side)} · ${$('git-path-' + side).value || 'Choose a file'}` : files[side]?.name || 'Choose XML';
    const summary = $('compare-source-summary');
    summary.textContent = `${description('before')} → ${description('after')}`;
    summary.title = summary.textContent;
    $('git-path-after').disabled = busy || (!working && $('git-same-path').checked && $('git-after').value !== 'file');
  }
  async function gitJSON(route, options) {
    const response = await fetch(git.base + route, { cache: 'no-store', ...options });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }
  function renderHistory() {
    const paths = git?.repositoryHistory || [];
    $('git-history-summary').textContent = `Recent repositories (${paths.length})`;
    $('git-clear-history').disabled = busy || !paths.length;
    $('git-history-warning').textContent = git?.historyWarning || '';
    $('git-history-warning').hidden = !git?.historyWarning;
    const list = $('git-history-list');
    list.replaceChildren();
    for (const path of paths) {
      const open = button(path, () => {
        if (busy) return;
        $('git-repository').value = path;
        $('git-open-repository').click();
      });
      open.title = path;
      open.disabled = busy;
      list.append(open);
    }
    if (!paths.length) list.append(el('p', 'source-meta', 'No recent repositories. Open a Git folder to remember it here.'));
  }
  async function loadPaths(side) {
    const ref = $('git-' + side).value;
    paths[side] = [];
    if (!git?.repository || ref === 'file') return;
    const data = await gitJSON(`files?repository=${encodeURIComponent(git.repository)}&ref=${encodeURIComponent(ref)}`);
    paths[side] = data.paths;
  }
  function linkPaths(source = workingComparison() ? 'after' : 'before') {
    if ($('git-same-path').checked) $('git-path-' + (source === 'before' ? 'after' : 'before')).value = $('git-path-' + source).value;
    fileLabels();
  }
  function renderGitFiles() {
    const query = $('git-file-search').value.trim().toLowerCase();
    const matches = paths[filePickerSide].filter(path => path.toLowerCase().includes(query));
    const shown = matches.slice(0, 200);
    $('git-file-count').textContent = !matches.length ? 'No XML files match this search.' : `${matches.length} XML files${matches.length > shown.length ? ' · Showing the first 200. Type more to narrow the list.' : ''}`;
    const list = document.createDocumentFragment();
    for (const path of shown) {
      const choose = button('', () => {
        const side = filePickerSide;
        if (workingComparison() && side === 'before') $('git-same-path').checked = false;
        $('git-path-' + side).value = path;
        linkPaths(side); invalidate(); error('');
        $('git-file-dialog').close();
      });
      choose.append(el('strong', '', path.split('/').pop()), el('span', '', path));
      choose.title = path; list.append(choose);
    }
    $('git-file-list').replaceChildren(list);
    $('git-file-list').scrollTop = 0;
  }
  function chooseFile(side) {
    if (busy) return;
    if (!git?.repository || $('git-' + side).value === 'file') { $('input-' + side).click(); return; }
    filePickerSide = side;
    $('git-file-version').textContent = `${side === 'before' ? 'Before' : 'After'} · ${versionName(side)}`;
    $('git-file-note').textContent = $('git-' + side).value === 'WORKTREE'
      ? 'Files in the checked-out working copy, including saved, uncommitted changes.'
      : 'Files stored in this Git version. No checkout required.';
    $('git-file-linked').textContent = workingComparison()
      ? side === 'before' ? 'Choose a different file on the comparison branch. Your working file stays unchanged.' : 'The same file path is used on the comparison branch unless you choose a different file there.'
      : $('git-same-path').checked ? 'The selected path will be used on both sides. Turn off “Use the same file path on both sides” to choose different paths.' : '';
    $('git-file-search').value = git.folderPrefix ? `${git.folderPrefix}/` : '';
    renderGitFiles();
    $('git-file-dialog').showModal();
    $('git-file-search').focus();
  }
  $('git-file-search').addEventListener('input', renderGitFiles);
  $('git-file-search').addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'Enter') {
      event.preventDefault();
      const first = $('git-file-list').querySelector('button');
      if (event.key === 'ArrowDown') first?.focus();
      else if ($('git-file-list').children.length === 1) first?.click();
    }
  });
  $('git-file-close').addEventListener('click', () => $('git-file-dialog').close());
  async function configureGit(context) {
    git = { ...context, base: git.base };
    renderHistory();
    $('git-repository').value = git.folder || git.repository;
    $('git-repository-root').hidden = !git.folder || git.folder === git.repository;
    $('git-repository-root').textContent = `This folder belongs to the Git repository: ${git.repository}`;
    $('git-note').hidden = false;
    const branches = git.refs.filter(ref => /^refs\/(heads|remotes)\//.test(ref.value));
    $('git-note').textContent = `Current branch: ${git.branch || 'Detached HEAD'}.${branches.length === 1 ? ' This repository has only one branch. For branches from another repository, open that repository’s folder.' : ' Local branches and remote branches already available on disk.'}`;
    $('git-show-merged-label').hidden = !git.refs.some(ref => ref.merged && ![git.baseRef, `refs/heads/${git.branch}`].includes(ref.value));
    $('git-show-merged-label').title = git.baseRef ? `Merged means included in ${git.baseRef.replace(/^refs\/(heads|remotes)\//, '')}. This does not use pull-request status.` : '';
    $('git-show-merged').checked = false;
    $('git-same-path-label').hidden = false;
    $('git-same-path').checked = true;
    for (const side of ['before', 'after']) {
      $('git-version-' + side).hidden = false;
      pickers[side].update(git, false);
      $('git-matches-' + side).hidden = false;
    }
    const baseline = ['refs/heads/main', 'refs/heads/master'].find(ref => git.refs.some(item => item.value === ref));
    const current = `refs/heads/${git.branch}`;
    const branchComparison = !git.path && baseline && current !== baseline && git.refs.some(item => item.value === current);
    pickers.before.setValue(branchComparison ? baseline : 'HEAD');
    pickers.after.setValue('WORKTREE');
    await Promise.all(['before', 'after'].map(loadPaths));
    $('git-path-after').value = git.path || '';
    linkPaths();
    $('compare-detail').replaceChildren(el('div', 'welcome', 'Choose a file from your current working copy, then choose the branch to compare with. The same file path is used automatically.'));
  }
  $('git-open-repository').addEventListener('click', guard(async () => {
    if (busy) return;
    setBusy(true); invalidate(); error('');
    $('compare-progress-label').textContent = 'Reading repository…';
    try {
      const context = await gitJSON('repository', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: $('git-repository').value }) });
      await configureGit(context);
      $('git-history').open = false;
    } finally { setBusy(false); }
  }));
  $('git-repository').addEventListener('focus', () => {
    if (git?.repositoryHistory?.length) $('git-history').open = true;
  });
  $('git-clear-history').addEventListener('click', guard(async () => {
    if (busy) return;
    setBusy(true);
    try {
      Object.assign(git, await gitJSON('repository-history/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
      renderHistory();
      if (!git.repository) $('git-repository').value = '';
    } finally { setBusy(false); }
  }));
  $('git-repository').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); $('git-open-repository').click(); }
  });
  $('git-show-merged').addEventListener('change', () => {
    for (const side of ['before', 'after']) pickers[side].update(git, $('git-show-merged').checked);
  });
  $('git-same-path').addEventListener('change', () => { linkPaths(); invalidate(); });
  $('git-use-working-path').addEventListener('click', () => { $('git-same-path').checked = true; linkPaths(); invalidate(); error(''); });
  for (const side of ['before', 'after']) {
    $('git-path-' + side).addEventListener('input', () => { linkPaths(side); invalidate(); error(''); });
  }
  function setFile(side, list) {
    if (busy || !list.length) return;
    if (list.length !== 1) { error('Drop one project version on each side.'); return; }
    files[side] = list[0];
    pickers[side].setValue('file');
    fileLabels(); invalidate(); error('');
  }
  for (const side of ['before', 'after']) {
    $('choose-' + side).addEventListener('click', () => chooseFile(side));
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
      pickers[side].setValue($('git-' + side).value);
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
    $('compare-ids').disabled = value;
    $('compare-progress').hidden = !value;
    $('git-path-after').disabled = value || (!workingComparison() && $('git-same-path').checked && $('git-after').value !== 'file');
    $('git-clear-history').disabled = value || !git?.repositoryHistory?.length;
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
    if (response.status === 204) {
      $('compare-' + side + '-name').textContent = `${path} · ${versionName(side)} · file not found`;
      throw new Error(`Cannot compare: "${path}" was not found in ${versionName(side)} (repository: ${git.repository}). Choose another branch or file, or open the correct repository. Both files must exist to compare their contents.`);
    }
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
      if (workingComparison() && !$('git-path-after').value) throw new Error('Choose a file from the current working copy first.');
      const before = await source('before'), after = await source('after');
      result = await rpc('compare', { before, after, includeFormatting: $('compare-formatting').checked, includeIds: $('compare-ids').checked });
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
    $('compare-navigator').classList.add('has-comparison');
    const c = result.counts, k = result.kindsChanged;
    $('compare-summary').textContent = `${c.added} added · ${c.removed} removed · ${c.modified} changed${result.formattingCount ? ` (${result.formattingCount} formatting-only)` : ''} · Affected: ${k.project} project, ${k.suite} suites, ${k.case} cases, ${k.step} steps`;
  }
  const updateOptions = guard(async () => {
    if (!result || busy) return;
    setBusy(true); error('');
    $('compare-progress-label').textContent = 'Updating comparison…';
    try {
      const previous = result.entries[selected], count = result.entries.length;
      result = await rpc('compare-options', { includeFormatting: $('compare-formatting').checked, includeIds: $('compare-ids').checked });
      if (result.entries.length !== count || result.entries[selected]?.name !== previous?.name) { selected = result.rootId; collapsed.clear(); }
      summarize();
      $('compare-tree').scrollTop = 0;
      refreshRows();
      await showDetail();
    } finally { setBusy(false); }
  });
  $('compare-formatting').addEventListener('change', updateOptions);
  $('compare-ids').addEventListener('change', updateOptions);
  $('compare-run').addEventListener('click', guard(compare));
  $('compare-swap').addEventListener('click', () => {
    [files.before, files.after] = [files.after, files.before];
    const beforeRef = $('git-before').value, afterRef = $('git-after').value;
    pickers.before.setValue(afterRef);
    pickers.after.setValue(beforeRef);
    const pathA = $('git-path-before'), pathB = $('git-path-after');
    [pathA.value, pathB.value] = [pathB.value, pathA.value];
    [paths.before, paths.after] = [paths.after, paths.before];
    linkPaths(); invalidate();
  });
  $('compare-clear').addEventListener('click', guard(async () => {
    files = { before: null, after: null };
    if (git?.repository) {
      setBusy(true);
      try { await configureGit({ ...git, path: '' }); } finally { setBusy(false); }
    } else for (const side of ['before', 'after']) pickers[side].setValue('file');
    fileLabels(); invalidate(); error('');
    await rpc('compare-clear');
  }));
  $('compare-demo').addEventListener('click', guard(async () => {
    const before = demoProjects[0].xml.replace('name="Check revocation"', 'name="Check revocation" id="demo-revocation"');
    const after = before.replace('Check revocation', 'Check certificate revocation')
      .replace('log.info', 'log.warn')
      .replace('</con:testCase>', '<con:testStep name="New verification" type="groovy"><con:config><con:script>assert true</con:script></con:config></con:testStep></con:testCase>');
    files = { before: new File([before], 'example-before.xml'), after: new File([after], 'example-after.xml') };
    for (const side of ['before', 'after']) pickers[side].setValue('file');
    fileLabels();
    await compare();
  }));

  function collapseBranch(id) {
    const entry = result.entries[id];
    if (!entry.children.length) return;
    collapsed.add(id);
    for (const child of entry.children) collapseBranch(child);
  }
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
      const disabled = disabledLabel(entry);
      row.setAttribute('aria-label', `${kinds[entry.kind]} ${entry.name}, ${badge(entry)}${entry.reordered ? ', order changed' : ''}${disabled ? `, ${disabled}` : ''}`);
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
      identity.append(el('span', 'node-name', entry.name));
      if (disabled) identity.append(el('span', 'disabled-label', disabled));
      row.append(identity, copy, el('span', `change-badge ${entry.formattingOnly ? 'formatting' : entry.status}`, entry.reordered ? '↕ Order' : badge(entry)));
      row.addEventListener('click', guard(async () => {
        selected = entry.id;
        tree.focus({ preventScroll: true });
        if (entry.children.length) collapsed.has(entry.id) ? collapsed.delete(entry.id) : collapseBranch(entry.id);
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
      if (current.children.length && !collapsed.has(selected)) collapseBranch(selected);
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
    const disabled = disabledLabel(entry);
    head.append(el('p', 'breadcrumb', path.join(' › ')), el('p', 'detail-kind', `${kinds[entry.kind]} · ${badge(entry)}${disabled ? ` · ${disabled}` : ''}`), el('h2', '', entry.beforeName && entry.afterName && entry.beforeName !== entry.afterName ? `${entry.beforeName} → ${entry.afterName}` : entry.name));
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
    if (!entry.includeIds) controls.append(el('span', 'source-meta', 'SoapUI IDs ignored'));
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
      info.textContent = `${data.fallback ? 'Large change: showing complete blocks without fine alignment. ' : ''}Red = before · Green = after. Darker highlights mark changed text within a line. ${original.checked ? 'Original XML, with nested hierarchy items omitted. Whitespace markers: · space, ⇥ tab, ␍ carriage return.' : 'Formatted XML fragments.'} Line numbers refer to these fragments; ↳ continues a long line.`;
      const content = document.createDocumentFragment();
      const headers = el('div', 'diff-row diff-head');
      for (const side of ['before', 'after']) {
        const heading = el('strong', '', side === 'before' ? 'Before' : 'After');
        if (entry[`${side}Disabled`]) heading.append(document.createTextNode(' '), el('span', 'disabled-label', 'Disabled'));
        headers.append(heading);
      }
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
          const code = el('code');
          for (const part of value?.parts || [{ text: value?.text || '' }]) {
            const text = original.checked ? part.text.replace(/ /g, '·').replace(/\t/g, '⇥').replace(/\r/g, '␍') : part.text;
            code.append(part.changed ? el('mark', 'diff-inline-change', text) : document.createTextNode(text));
          }
          cell.append(el('span', 'diff-number', value ? `${value.continued ? '↳' : value.line} ${row.status === 'changed' ? side === 'left' ? '−' : '+' : ''}` : ''), code);
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
    renderHistory();
    $('git-repository').value = git.folder || git.repository || git.repositoryHistory?.[0] || '';
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
