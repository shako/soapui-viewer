import { matcher, visibleRows } from './core.js';
import { demoProjects } from './demo.js';
import { createRecentStore, readRecentFile } from './recents.js';
import { setupSplitter } from './splitter.js';

const $ = id => document.getElementById(id);
const el = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const button = (text, className, action) => {
  const element = el('button', `button ${className}`, text);
  element.type = 'button';
  element.addEventListener('click', action);
  return element;
};
const format = number => number.toLocaleString('en-GB');
const kindNames = { project: 'Project', suite: 'Test suite', case: 'Test case', step: 'Test step' };
const icons = { project: 'P', suite: 'S', case: 'C', step: '›_' };
const state = {
  nodes: new Map(), roots: [], hits: {}, rows: [], selected: null,
  query: '', caseSensitive: false, expanded: new Set(), collapsed: new Set(), contextCases: new Set(),
  importing: false,
};
let requestId = 0;
const pending = new Map();
const blobURL = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
const worker = new Worker(blobURL);
URL.revokeObjectURL(blobURL);
let searchTicket = 0;
let detailTicket = 0;
let fieldTicket = 0;
let searchTimer;
const welcome = $('detail').firstElementChild;
const recentStore = createRecentStore();
const fileOrigins = new WeakMap();
let recentEntries = [];
let recentNotice = '';
let openingRecent = false;
let recentRefresh = 0;

const fileDate = timestamp => new Date(timestamp).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
const fileSize = bytes => `${(bytes / 1024 / 1024).toLocaleString('en-GB', { maximumFractionDigits: 1 })} MB`;

function renderRecents() {
  const busy = state.importing || openingRecent;
  $('recents-status').textContent = recentNotice || (!recentEntries.length ? 'No recent projects yet. Open an XML file to save it here.' : '');
  const list = document.createDocumentFragment();
  for (const entry of recentEntries) {
    const row = el('div', 'recent-entry');
    const info = el('div', 'recent-info');
    info.append(el('strong', '', entry.name), el('span', '', entry.kind === 'original'
      ? `Original file · last opened ${fileDate(entry.openedAt)} · ${fileSize(entry.size)}`
      : `Local copy saved on ${fileDate(entry.savedAt)} · ${fileSize(entry.size)}`));
    const actions = el('div', 'recent-actions');
    const alreadyOpen = state.roots.some(id => state.nodes.get(id).recentId === entry.id);
    const reopen = button(alreadyOpen ? 'Open' : entry.kind === 'original' ? 'Reopen' : 'Open copy', 'secondary', () => openRecent(entry));
    reopen.disabled = busy || alreadyOpen;
    const remove = button('Remove', 'quiet', async () => {
      try { await recentStore.remove(entry.id); recentNotice = ''; await refreshRecents(); }
      catch (error) { recentNotice = error.message; renderRecents(); }
    });
    remove.disabled = busy;
    remove.setAttribute('aria-label', `Remove ${entry.name} from recent projects`);
    actions.append(reopen, remove);
    row.append(info, actions);
    list.append(row);
  }
  $('recents-list').replaceChildren(list);
  $('forget-recents').disabled = busy || !recentEntries.length;
  $('choose-current').disabled = busy;
}

async function refreshRecents() {
  const ticket = ++recentRefresh;
  try {
    const entries = await recentStore.list();
    if (ticket !== recentRefresh) return;
    recentEntries = entries;
  } catch {
    recentNotice = 'Local storage is unavailable. You can still open and search files, but recent projects cannot be saved in this browser.';
  }
  renderRecents();
}

async function openRecent(entry) {
  if (state.importing || openingRecent) return;
  openingRecent = true;
  recentNotice = `Opening ${entry.name}…`;
  // Start before an asynchronous DB operation can consume the user activation.
  const reading = readRecentFile(entry, recentStore);
  renderRecents();
  try {
    const file = await reading;
    fileOrigins.set(file, { handle: entry.handle, id: entry.id, savedAt: entry.savedAt, isCopy: entry.kind === 'copy' });
    $('recents-dialog').close();
    recentNotice = '';
    await importFiles([file]);
  } catch (error) {
    recentNotice = error.message;
  } finally {
    openingRecent = false;
    renderRecents();
  }
}

async function chooseFiles() {
  if (state.importing || openingRecent) return;
  if (typeof window.showOpenFilePicker !== 'function') { $('file-input').click(); return; }
  let handles;
  try {
    handles = await window.showOpenFilePicker({ multiple: true, types: [{ description: 'SoapUI XML projects', accept: { 'application/xml': ['.xml'] } }] });
  } catch (error) {
    if (error.name === 'AbortError') return;
    // Some browsers expose the API but block it for local file:// documents.
    $('file-input').click();
    return;
  }
  const files = [];
  for (const handle of handles) {
    try {
      const file = await handle.getFile();
      fileOrigins.set(file, { handle });
      files.push(file);
    } catch (error) { reportError(`${handle.name}: ${error.message}`); }
  }
  await importFiles(files);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; }
    catch { /* Local file viewers may need the legacy clipboard fallback. */ }
  }
  const focused = document.activeElement;
  const selection = document.getSelection();
  const ranges = Array.from({ length: selection?.rangeCount || 0 }, (_, i) => selection.getRangeAt(i).cloneRange());
  const input = el('textarea');
  input.value = text;
  input.readOnly = true;
  input.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none';
  document.body.append(input);
  try {
    input.focus({ preventScroll: true });
    input.select();
    if (!document.execCommand('copy')) throw new Error('Clipboard unavailable');
  } finally {
    input.remove();
    focused?.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
}

function reportError(message) {
  $('errors').hidden = false;
  $('errors').append(el('p', '', message));
}

worker.onmessage = ({ data }) => {
  if (data.event === 'progress') {
    $('import-label').textContent = `Reading ${data.fileName}… ${Math.round(data.progress * 100)}%`;
    $('import-progress').value = data.progress;
    return;
  }
  const request = pending.get(data.id);
  if (!request) return;
  pending.delete(data.id);
  if (data.error) request.reject(new Error(data.error));
  else request.resolve(data.result);
};
worker.onerror = () => {
  const error = new Error('Background processing has stopped. Reopen the viewer and try opening your files one at a time.');
  for (const request of pending.values()) request.reject(error);
  pending.clear();
  reportError(error.message);
};
function rpc(action, data = {}) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, action, ...data });
  });
}

function highlight(text, query = state.query) {
  const fragment = document.createDocumentFragment();
  const regex = matcher(query, state.caseSensitive);
  let previous = 0;
  let match;
  if (regex) while ((match = regex.exec(text))) {
    fragment.append(document.createTextNode(text.slice(previous, match.index)), el('mark', '', match[0]));
    previous = match.index + match[0].length;
  }
  fragment.append(document.createTextNode(text.slice(previous)));
  return fragment;
}

async function importFiles(files, { remember = true } = {}) {
  if (state.importing || !files.length) return;
  state.importing = true;
  $('errors').replaceChildren();
  $('errors').hidden = true;
  $('import-status').hidden = false;
  $('open-files').disabled = true;
  welcome.querySelector('#welcome-open').disabled = true;
  welcome.querySelector('#load-demo').disabled = true;
  $('clear-projects').disabled = true;
  renderRecents();
  try {
    for (const file of files) {
      $('import-label').textContent = `Opening ${file.name}…`;
      $('import-progress').value = 0;
      try {
        const project = await rpc('import', { file });
        state.roots.push(project.rootId);
        for (const node of project.nodes) {
          state.nodes.set(node.id, node);
          if (node.kind === 'project' || node.kind === 'suite') state.expanded.add(node.id);
        }
        if (!project.nodes.some(node => node.kind === 'suite')) {
          reportError(`${file.name}: no test suites found. For a composite project, first export it as one complete XML file.`);
        }
        updateTotals();
        const source = fileOrigins.get(file) || {};
        const root = state.nodes.get(project.rootId);
        if (source.isCopy) root.copySavedAt = source.savedAt;
        if (remember) {
          try {
            $('import-label').textContent = `Adding ${file.name} to recent projects…`;
            const entry = await recentStore.remember(file, source);
            root.recentId = entry.id;
          } catch {
            reportError(`${file.name} is open, but could not be saved to Recent. Browser storage is blocked or full. You can select the file again later.`);
          }
        }
      } catch (error) {
        reportError(`${file.name}: ${error.message}`);
      }
    }
    await runSearch();
  } finally {
    state.importing = false;
    $('import-status').hidden = true;
    $('open-files').disabled = false;
    // The welcome view may be detached after an import.
    welcome.querySelector('#welcome-open').disabled = false;
    welcome.querySelector('#load-demo').disabled = false;
    $('clear-projects').disabled = !state.roots.length;
    await refreshRecents();
  }
}

function updateTotals() {
  const counts = { suite: 0, case: 0, step: 0 };
  for (const node of state.nodes.values()) if (node.kind in counts) counts[node.kind]++;
  $('project-count').textContent = format(state.roots.length);
  $('totals').textContent = `${format(counts.suite)} suites · ${format(counts.case)} cases · ${format(counts.step)} steps`;
  $('collapse').disabled = !state.roots.length;
}

async function runSearch() {
  clearTimeout(searchTimer);
  const ticket = ++searchTicket;
  const query = $('search').value;
  const caseSensitive = $('case-sensitive').checked;
  if (state.roots.length) $('search-summary').textContent = 'Searching all projects…';
  const started = performance.now();
  const result = await rpc('search', { query, caseSensitive });
  if (ticket !== searchTicket) return;
  const changed = state.query !== query || state.caseSensitive !== caseSensitive;
  state.query = query;
  state.caseSensitive = caseSensitive;
  state.hits = result.hits;
  if (changed) {
    state.collapsed.clear();
    state.contextCases.clear();
    $('tree').scrollTop = 0;
  }
  $('search-summary').textContent = !state.roots.length
    ? 'Open your projects to search names and content.'
    : query
      ? `${format(result.occurrences)} ${result.occurrences === 1 ? 'match' : 'matches'} in ${format(result.matchingNodes)} ${result.matchingNodes === 1 ? 'item' : 'items'} · ${format(state.roots.length)} ${state.roots.length === 1 ? 'project' : 'projects'} searched · ${Math.round(performance.now() - started)} ms`
      : 'All items are visible. Search names, scripts, requests, properties and other content.';
  refreshRows();
  if (!state.rows.some(row => row.id === state.selected)) {
    state.selected = (state.rows.find(row => state.hits[row.id]?.own) || state.rows[0])?.id ?? null;
  }
  renderTree();
  await renderDetail();
  return { matches: result.occurrences, items: result.matchingNodes, projects: state.roots.length };
}

function refreshRows() {
  state.rows = visibleRows(state.roots, state.nodes, state.hits, !!state.query, state.expanded, state.collapsed, state.contextCases);
  $('tree-spacer').style.height = `${state.rows.length * 42}px`;
  $('tree-empty').hidden = !!state.rows.length;
  $('tree-empty').textContent = state.roots.length ? 'No matches. Try a different search term.' : 'Your open projects will appear here.';
  $('tree-description').textContent = state.query ? 'Matching items and their parents' : 'Suite → case → step';
  $('collapse').textContent = hasExpandedBranches() ? 'Collapse' : 'Expand';
  $('collapse').disabled = !state.rows.some(row => state.nodes.get(row.id).children.length);
}

function hasExpandedBranches() {
  return state.rows.some(row => row.open && state.nodes.get(row.id).children.length);
}

function isOpen(id) { return state.query ? !state.collapsed.has(id) : state.expanded.has(id); }
function toggle(id) {
  const collection = state.query ? state.collapsed : state.expanded;
  if (collection.has(id)) collection.delete(id);
  else collection.add(id);
  refreshRows();
  renderTree();
}
function ensureVisible(id) {
  const index = state.rows.findIndex(row => row.id === id);
  if (index < 0) return;
  const tree = $('tree');
  if (index * 42 < tree.scrollTop) tree.scrollTop = index * 42;
  else if ((index + 1) * 42 > tree.scrollTop + tree.clientHeight) tree.scrollTop = (index + 1) * 42 - tree.clientHeight;
}
async function select(id, reveal = false) {
  state.selected = id;
  if (reveal) ensureVisible(id);
  renderTree();
  await renderDetail();
}

function renderTree() {
  const tree = $('tree');
  const from = Math.max(0, Math.floor(tree.scrollTop / 42) - 6);
  const until = Math.min(state.rows.length, from + Math.ceil(tree.clientHeight / 42) + 13);
  const fragment = document.createDocumentFragment();
  for (let i = from; i < until; i++) {
    const item = state.rows[i];
    const node = state.nodes.get(item.id);
    const hit = state.hits[node.id];
    const row = el('div', `tree-row${state.selected === node.id ? ' selected' : ''}${item.context ? ' context' : ''}`);
    row.id = `tree-${node.id}`;
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-level', item.depth + 1);
    row.setAttribute('aria-selected', state.selected === node.id);
    if (node.children.length) row.setAttribute('aria-expanded', item.open);
    row.setAttribute('aria-label', `${kindNames[node.kind]}: ${node.name}${hit?.own ? `, ${hit.own} ${hit.own === 1 ? 'match' : 'matches'}` : ''}${node.disabled ? ', disabled' : ''}`);
    row.style.paddingLeft = `${8 + item.depth * 16}px`;
    const arrow = el('span', 'tree-toggle', node.children.length ? (item.open ? '▾' : '▸') : '');
    arrow.setAttribute('aria-hidden', 'true');
    const name = el('span', 'node-name');
    name.append(highlight(node.name));
    name.title = node.name;
    const icon = el('span', `node-icon ${node.kind}`, icons[node.kind]);
    icon.setAttribute('aria-hidden', 'true');
    const identity = el('span', 'node-identity');
    identity.append(name);
    row.append(arrow, icon, identity);
    if (node.disabled) row.append(el('span', 'disabled-label', 'disabled'));
    if (state.query && hit?.own) {
      const label = hit.name && hit.content ? 'name + content' : hit.name ? 'name' : 'content';
      row.append(el('span', 'hit-kind', label));
    }
    if (state.query && hit?.total) {
      const badge = el('span', 'hit-badge', format(hit.total));
      badge.title = `${hit.own} ${hit.own === 1 ? 'match' : 'matches'} here; ${hit.total - hit.own} in child items`;
      row.append(badge);
    }
    const copy = button('Copy', 'quiet copy-name', async event => {
      event.stopPropagation();
      $('copy-status').textContent = '';
      try {
        await copyText(node.name);
        copy.textContent = 'Copied';
        $('copy-status').textContent = `Copied ${node.name}`;
        setTimeout(() => { copy.textContent = 'Copy'; }, 1600);
      } catch {
        reportError('Could not copy the name. Check clipboard permissions in your browser and try again.');
      }
    });
    copy.tabIndex = state.selected === node.id ? 0 : -1;
    copy.title = 'Copy name';
    copy.setAttribute('aria-label', `Copy name: ${node.name}`);
    identity.append(copy);
    row.addEventListener('click', () => {
      tree.focus({ preventScroll: true });
      state.selected = node.id;
      if (node.children.length) toggle(node.id);
      else renderTree();
      renderDetail().catch(error => reportError(error.message));
    });
    fragment.append(row);
  }
  $('tree-rows').style.transform = `translateY(${from * 42}px)`;
  $('tree-rows').replaceChildren(fragment);
  if (state.selected && document.getElementById(`tree-${state.selected}`)) tree.setAttribute('aria-activedescendant', `tree-${state.selected}`);
  else tree.removeAttribute('aria-activedescendant');
}

function ancestors(node) {
  const path = [node];
  while (node.parentId) { node = state.nodes.get(node.parentId); path.unshift(node); }
  return path;
}

async function renderDetail() {
  const ticket = ++detailTicket;
  ++fieldTicket;
  const node = state.nodes.get(state.selected);
  const detail = $('detail');
  if (!node) {
    if (!state.roots.length) detail.replaceChildren(welcome);
    else {
      const empty = el('div', 'welcome');
      empty.append(el('h2', '', 'No matches found'), el('p', '', 'Try a shorter search term or turn off case-sensitive search.'));
      detail.replaceChildren(empty);
    }
    return;
  }
  const head = el('div', 'detail-head');
  const breadcrumb = el('nav', 'breadcrumb');
  breadcrumb.setAttribute('aria-label', 'Path to this item');
  const path = ancestors(node);
  path.forEach((part, index) => {
    if (index) breadcrumb.append(el('span', '', ' / '));
    breadcrumb.append(button(part.name, '', () => select(part.id, true).catch(error => reportError(error.message))));
  });
  const title = el('h2');
  title.append(highlight(node.name));
  head.append(breadcrumb, el('p', 'detail-kind', `${kindNames[node.kind]}${node.type ? ` · ${node.type}` : ''}${node.disabled ? ' · Disabled' : ''}`), title,
    el('p', 'source-meta', `${node.fileName} · XML line ${format(node.sourceLine)}${node.children.length ? ` · ${format(node.children.length)} ${node.kind === 'case' ? (node.children.length === 1 ? 'step' : 'steps') : (node.children.length === 1 ? 'item' : 'items')}` : ''}`));
  if (path[0].copySavedAt) head.append(el('p', 'copy-notice', `Local copy saved on ${fileDate(path[0].copySavedAt)}. Reopen the original XML file to see changes made since then.`));
  const body = el('div', 'detail-body');
  body.append(el('p', 'match-note', 'Loading content…'));
  detail.replaceChildren(head);
  const caseNode = path.find(part => part.kind === 'case');
  if (state.query && caseNode) {
    const context = el('div', 'context-bar');
    const all = state.contextCases.has(caseNode.id);
    context.append(el('span', '', all ? 'All steps in this test case are visible.' : 'Want to see the other steps in this test case?'));
    context.append(button(all ? 'Show matching steps only' : `Show all ${caseNode.children.length} ${caseNode.children.length === 1 ? 'step' : 'steps'}`, 'secondary', () => {
      if (all) state.contextCases.delete(caseNode.id);
      else state.contextCases.add(caseNode.id);
      state.collapsed.delete(caseNode.id);
      refreshRows();
      if (!state.rows.some(row => row.id === state.selected)) state.selected = caseNode.id;
      ensureVisible(caseNode.id);
      renderTree();
      renderDetail().catch(error => reportError(error.message));
    }));
    detail.append(context);
  }
  detail.append(body);
  const fields = await rpc('detail', { nodeId: node.id, query: state.query, caseSensitive: state.caseSensitive });
  if (ticket !== detailTicket) return;
  // Keep the worker's field indices intact; only the displayed order changes.
  const orderedFields = state.query ? [...fields].sort((a, b) => b.count - a.count || a.index - b.index) : fields;
  body.replaceChildren();
  const hits = state.hits[node.id] || { own: 0, total: 0 };
  body.append(el('p', 'match-note', state.query
    ? `${format(hits.own)} ${hits.own === 1 ? 'match' : 'matches'} in this item${hits.total > hits.own ? ` · ${format(hits.total - hits.own)} in child items` : ''}.`
    : 'Choose a field to view its full text.'));
  const controls = el('div', 'field-controls');
  const label = el('label', 'field-label', 'Content');
  label.htmlFor = 'field-select';
  const fieldSelect = el('select');
  fieldSelect.id = 'field-select';
  const allLabel = el('label', 'check');
  const allFields = el('input');
  allFields.type = 'checkbox';
  allFields.checked = !state.query || hits.own === 0;
  allLabel.append(allFields, document.createTextNode('Include fields without matches'));
  allLabel.hidden = !state.query;
  controls.append(fieldSelect, allLabel);
  const viewer = el('div');
  body.append(label, controls, viewer);
  let activeField = null;

  async function showField(page = {}) {
    const fieldIndex = Number(fieldSelect.value);
    if (!fieldSelect.options.length) {
      fieldSelect.classList.remove('has-matches');
      viewer.replaceChildren(el('p', 'field-empty', hits.total > hits.own
        ? 'Matches are in child items. Select them in the tree, or select Include fields without matches above.'
        : 'No matches in this item’s fields. Select Include fields without matches above to view all content.'));
      return;
    }
    const thisFieldTicket = ++fieldTicket;
    activeField = fields[fieldIndex];
    fieldSelect.classList.toggle('has-matches', !!state.query && activeField.count > 0);
    if (!Object.keys(page).length && activeField.count) page = { matchIndex: 0 };
    const result = await rpc('field', { nodeId: node.id, fieldIndex, query: state.query, caseSensitive: state.caseSensitive, page });
    if (ticket !== detailTicket || thisFieldTicket !== fieldTicket) return;
    const toolbar = el('div', 'code-toolbar');
    toolbar.append(el('span', '', `From text line ${format(result.line)} · ${format(result.length)} ${result.length === 1 ? 'character' : 'characters'}`));
    if (result.total) {
      const navigation = el('div', 'match-navigation');
      const index = result.matchIndex;
      const previous = button('↑', 'secondary', () => showField({ matchIndex: index === null ? result.total - 1 : (index + result.total - 1) % result.total }).catch(error => reportError(error.message)));
      previous.setAttribute('aria-label', 'Previous match in this field');
      const next = button('↓', 'secondary', () => showField({ matchIndex: index === null ? 0 : (index + 1) % result.total }).catch(error => reportError(error.message)));
      next.setAttribute('aria-label', 'Next match in this field');
      navigation.append(el('span', '', index === null ? `${format(result.total)} ${result.total === 1 ? 'match' : 'matches'}` : `Match ${format(index + 1)} / ${format(result.total)}`), previous, next);
      toolbar.append(navigation);
    }
    const code = el('pre', 'code');
    code.tabIndex = 0;
    code.setAttribute('aria-label', activeField.label);
    let offset = 0;
    for (const mark of result.marks) {
      code.append(document.createTextNode(result.text.slice(offset, mark.start)), el('mark', mark.active ? 'active' : '', result.text.slice(mark.start, mark.end)));
      offset = mark.end;
    }
    code.append(document.createTextNode(result.text.slice(offset)));
    viewer.replaceChildren(toolbar, code);
    if (result.start > 0 || result.end < result.length) {
      const pages = el('div', 'page-tools');
      const previous = button('← Previous section', 'secondary', () => showField({ start: Math.max(0, result.start - 12000) }).catch(error => reportError(error.message)));
      previous.disabled = result.start === 0;
      const next = button('Next section →', 'secondary', () => showField({ start: result.end }).catch(error => reportError(error.message)));
      next.disabled = result.end >= result.length;
      pages.append(previous, el('span', '', `Characters ${format(result.start + 1)}–${format(result.end)} of ${format(result.length)}`), next);
      viewer.append(pages);
    }
    requestAnimationFrame(() => {
      const mark = code.querySelector('mark.active');
      if (mark) code.scrollTop = mark.offsetTop - code.offsetTop - 80;
    });
  }

  async function populateFields() {
    const previous = fieldSelect.value;
    fieldSelect.replaceChildren();
    const matchingGroup = el('optgroup', 'field-group-matches');
    matchingGroup.label = 'Matching fields (most matches first)';
    const otherGroup = el('optgroup');
    otherGroup.label = 'Fields without matches';
    for (const field of orderedFields) {
      if (state.query && !allFields.checked && !field.count) continue;
      const prefix = state.query ? (field.count ? `${format(field.count)} ${field.count === 1 ? 'match' : 'matches'} — ` : 'No matches — ') : '';
      const option = el('option', state.query ? (field.count ? 'field-option-match' : 'field-option-no-match') : '', `${prefix}${field.label}`);
      option.value = field.index;
      if (state.query) (field.count ? matchingGroup : otherGroup).append(option);
      else fieldSelect.append(option);
    }
    if (matchingGroup.children.length) fieldSelect.append(matchingGroup);
    if (otherGroup.children.length) fieldSelect.append(otherGroup);
    fieldSelect.disabled = !fieldSelect.options.length;
    if ([...fieldSelect.options].some(option => option.value === previous)) fieldSelect.value = previous;
    else {
      const preferred = (state.query && orderedFields.find(field => field.count > 0))
        || fields.find(field => (!state.query || allFields.checked || field.count)
          && /(?:^| \/ )(script|setupScript|tearDownScript|request|query|description)$/i.test(field.label));
      if (preferred) fieldSelect.value = preferred.index;
    }
    await showField();
  }
  fieldSelect.addEventListener('change', () => showField().catch(error => reportError(error.message)));
  allFields.addEventListener('change', () => populateFields().catch(error => reportError(error.message)));
  await populateFields();
}

$('open-files').addEventListener('click', () => chooseFiles().catch(error => reportError(error.message)));
$('welcome-open').addEventListener('click', () => chooseFiles().catch(error => reportError(error.message)));
$('open-recents').addEventListener('click', () => { $('recents-dialog').showModal(); refreshRecents(); });
$('close-recents').addEventListener('click', () => $('recents-dialog').close());
$('choose-current').addEventListener('click', () => {
  $('recents-dialog').close();
  chooseFiles().catch(error => reportError(error.message));
});
$('forget-recents').addEventListener('click', async () => {
  try { await recentStore.clear(); recentNotice = ''; await refreshRecents(); }
  catch (error) { recentNotice = error.message; renderRecents(); }
});
$('file-input').addEventListener('change', event => {
  importFiles([...event.target.files]).catch(error => reportError(error.message));
  event.target.value = '';
});
$('load-demo').addEventListener('click', () => {
  $('search').value = 'CRL';
  importFiles(demoProjects.map(project => new File([project.xml], project.name, { type: 'application/xml' })), { remember: false }).catch(error => reportError(error.message));
});
$('search').addEventListener('input', () => {
  ++searchTicket;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch().catch(error => reportError(error.message)), 180);
});
$('case-sensitive').addEventListener('change', () => runSearch().catch(error => reportError(error.message)));
$('clear-projects').addEventListener('click', async () => {
  await rpc('clear');
  state.nodes.clear();
  state.roots = [];
  state.selected = null;
  state.expanded.clear();
  state.collapsed.clear();
  state.contextCases.clear();
  $('search').value = '';
  $('clear-projects').disabled = true;
  $('errors').hidden = true;
  updateTotals();
  await runSearch();
  renderRecents();
});
$('collapse').addEventListener('click', () => {
  const parentIds = [...state.nodes.values()].filter(node => node.children.length).map(node => node.id);
  if (hasExpandedBranches()) {
    if (state.query) state.collapsed = new Set(parentIds);
    else state.expanded.clear();
  } else {
    if (state.query) state.collapsed.clear();
    else state.expanded = new Set(parentIds);
  }
  refreshRows();
  renderTree();
});
$('tree').addEventListener('scroll', renderTree, { passive: true });
new ResizeObserver(renderTree).observe($('tree'));
$('tree').addEventListener('keydown', event => {
  if (event.target !== event.currentTarget || !state.rows.length) return;
  const index = state.rows.findIndex(row => row.id === state.selected);
  const current = state.nodes.get(state.selected);
  let target;
  if (event.key === 'ArrowDown') target = state.rows[Math.min(state.rows.length - 1, index + 1)]?.id;
  else if (event.key === 'ArrowUp') target = state.rows[Math.max(0, index - 1)]?.id;
  else if (event.key === 'Home') target = state.rows[0].id;
  else if (event.key === 'End') target = state.rows.at(-1).id;
  else if (event.key === 'ArrowRight' && current?.children.length) {
    if (!isOpen(current.id)) toggle(current.id);
    else if (state.rows[index + 1]?.depth > state.rows[index].depth) target = state.rows[index + 1].id;
  } else if (event.key === 'ArrowLeft' && current) {
    if (current.children.length && isOpen(current.id)) toggle(current.id);
    else target = current.parentId;
  } else return;
  event.preventDefault();
  if (target) select(target, true).catch(error => reportError(error.message));
});
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    $('search').focus();
    $('search').select();
  }
});
let dragDepth = 0;
document.addEventListener('dragenter', event => {
  if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); dragDepth++; $('drop-overlay').hidden = state.importing; }
});
document.addEventListener('dragover', event => {
  if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
});
document.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $('drop-overlay').hidden = true;
});
document.addEventListener('drop', event => {
  event.preventDefault();
  dragDepth = 0;
  $('drop-overlay').hidden = true;
  if (state.importing) return;
  const files = [...event.dataTransfer.files];
  // Capture every handle in the drop event itself, before the first await.
  const items = [...event.dataTransfer.items].filter(item => item.kind === 'file');
  const entries = items.map(item => ({
    file: item.getAsFile(),
    handle: item.getAsFileSystemHandle ? item.getAsFileSystemHandle().catch(() => null) : Promise.resolve(null),
  }));
  Promise.all(entries.map(async entry => {
    const handle = await entry.handle;
    if (entry.file && handle?.kind === 'file') fileOrigins.set(entry.file, { handle });
    return entry.file;
  })).then(imported => importFiles(items.length ? imported.filter(Boolean) : files)).catch(error => reportError(error.message));
});

setupSplitter($('workspace'), $('sidebar-splitter'), $('navigator'));
refreshRecents();

// Optional browser-native agent access, using exactly the same visible search flow.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  Promise.resolve(document.modelContext.registerTool({
    name: 'search_open_soapui_projects',
    title: 'Search open SoapUI projects',
    description: 'Filter the visible project tree by a literal search term in names and content. Only searches files the user has already opened.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    async execute(input) {
      if (!input || typeof input.query !== 'string' || Object.keys(input).some(key => key !== 'query')) throw new Error('Provide only a text query.');
      if (state.importing) throw new Error('Wait for the projects to finish loading.');
      if (!state.roots.length) throw new Error('Open a SoapUI project first.');
      $('search').value = input.query;
      return await runSearch();
    },
  }, { signal: lifecycle.signal })).catch(() => {});
  addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
