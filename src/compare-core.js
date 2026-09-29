import { SaxesParser } from 'saxes';
import { diffArrays } from 'diff';
import { SOAP_NS, kinds, parents, readXmlFile } from './core.js';

const escapeText = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;');
const escapeAttribute = value => escapeText(value).replace(/"/g, '&quot;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;');

// Capture each hierarchy item's own XML. Descendant suites/cases/steps have their
// own entries, so a project never needs a second copy of every script it contains.
export function createComparisonParser() {
  const parser = new SaxesParser({ xmlns: true });
  const stack = [];
  const nodes = [];
  const source = [];
  let tagStart = 0;
  let root;
  // SAX positions are UTF-16 offsets into the decoded source, including chunks.
  parser.on('opentagstart', tag => { tagStart = parser.position - tag.name.length - 2; });
  parser.on('doctype', () => { throw new Error('XML with a DTD is not supported.'); });
  parser.on('opentag', tag => {
    const parent = stack.at(-1);
    const soap = tag.uri === SOAP_NS || tag.uri === '';
    const kind = soap ? kinds[tag.local] : undefined;
    const attr = name => Object.values(tag.attributes).find(a => !a.uri && a.local === name)?.value;
    if (!parent && kind !== 'project') throw new Error('Choose a complete SoapUI XML project.');
    if ((kind === 'project' && attr('encrypted') === 'true') || (soap && tag.local === 'encryptedContent')) {
      throw new Error('This project is encrypted. Export a decrypted copy from SoapUI first.');
    }
    const isNode = !parent || (kind && parent.isNode && parent.node.kind === parents[kind]);
    const namespaces = { ...parent?.namespaces, ...tag.ns };
    const attributes = Object.fromEntries(Object.values(tag.attributes).map(a => [a.name, a.value]));
    let node = parent?.node;
    if (isNode) {
      node = { id: nodes.length, kind, name: attr('name') || '(unnamed)', soapId: attr('id') || '', children: [], xml: '', raw: '', start: tagStart, end: 0 };
      nodes.push(node);
      if (parent) parent.node.children.push(node);
      else root = node;
      // Make the isolated fragment namespace-complete, including inherited prefixes.
      for (const [prefix, uri] of Object.entries(namespaces)) {
        if (prefix !== 'xml') attributes[prefix ? `xmlns:${prefix}` : 'xmlns'] = uri;
      }
    }
    if (parent) parent.hasElements = true;
    const space = tag.attributes['xml:space']?.value;
    stack.push({ node, isNode, name: tag.name, namespaces,
      preserve: space === 'preserve' || (space !== 'default' && !!parent?.preserve),
      open: `<${tag.name}${Object.keys(attributes).sort().map(key => ` ${key}="${escapeAttribute(attributes[key])}"`).join('')}>`,
      parts: [], hasElements: false,
    });
  });
  const text = (value, cdata = false) => {
    const frame = stack.at(-1);
    if (!frame) return;
    const previous = frame.parts.at(-1);
    if (previous?.text !== undefined) { previous.text += value; previous.cdata ||= cdata; }
    else frame.parts.push({ text: value, cdata });
  };
  parser.on('text', value => text(value));
  parser.on('cdata', value => text(value, true));
  parser.on('comment', value => stack.at(-1)?.parts.push({ xml: `<!--${value}-->` }));
  parser.on('processinginstruction', value => stack.at(-1)?.parts.push({ xml: `<?${value.target}${value.body ? ` ${value.body}` : ''}?>` }));
  parser.on('closetag', () => {
    const frame = stack.pop();
    const elementOnly = frame.hasElements && !frame.preserve && !frame.parts.some(p => p.text !== undefined && (p.text.trim() || p.cdata));
    const content = frame.parts.filter(p => !elementOnly || p.text === undefined).map(p => p.xml ?? escapeText(p.text)).join('');
    const xml = `${frame.open}${content}</${frame.name}>`;
    if (frame.isNode) { frame.node.xml = xml; frame.node.end = parser.position; }
    else stack.at(-1).parts.push({ xml });
  });
  return {
    write(chunk) { source.push(chunk); parser.write(chunk); },
    finish() {
      parser.close();
      if (!root) throw new Error('This file does not contain a SoapUI project.');
      const original = source.join('');
      for (const node of nodes) {
        const parts = [];
        let offset = node.start;
        for (const child of node.children) { parts.push(original.slice(offset, child.start)); offset = child.end; }
        parts.push(original.slice(offset, node.end));
        node.raw = parts.join('');
      }
      return { root, nodes };
    },
  };
}

export const parseComparisonFile = (file, progress) => readXmlFile(file, createComparisonParser(), progress);

// Match unique IDs first, then unique names within the same parent. Never guess
// between duplicate names/IDs. A move to another parent is an addition + removal.
export function compareProjects(before, after, { includeFormatting = false } = {}) {
  const entries = [];
  const counts = { added: 0, removed: 0, modified: 0, unchanged: 0 };
  const kindsChanged = { project: 0, suite: 0, case: 0, step: 0 };
  function visit(left, right, parentId = null) {
    const entry = { id: entries.length, parentId, kind: (right || left).kind, name: (right || left).name,
      beforeName: left?.name ?? null, afterName: right?.name ?? null, children: [], left, right,
      ownChanged: !!left && !!right && left.xml !== right.xml,
      ownFormattingChanged: !!left && !!right && left.xml === right.xml && left.raw !== right.raw, reordered: false, orderChanged: false };
    entries.push(entry);
    const a = left?.children || [], b = right?.children || [];
    const pairs = new Map(), used = new Set();
    for (const key of ['soapId', 'name']) {
      const index = list => {
        const map = new Map();
        for (const node of list) {
          if (!node[key]) continue;
          const k = `${node.kind}:${node[key]}`;
          map.set(k, map.has(k) ? null : node);
        }
        return map;
      };
      const ai = index(a), bi = index(b);
      for (const [k, old] of ai) {
        const next = bi.get(k);
        if (old && next && !pairs.has(next) && !used.has(old)) { pairs.set(next, old); used.add(old); }
      }
    }
    // Identical duplicate siblings at the same position are safe to retain.
    // Changed ambiguous siblings remain separate additions/removals.
    const identical = (x, y) => x.kind === y.kind && x.xml === y.xml && x.children.length === y.children.length
      && x.children.every((child, i) => identical(child, y.children[i]));
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (!used.has(a[i]) && !pairs.has(b[i]) && identical(a[i], b[i])) { pairs.set(b[i], a[i]); used.add(a[i]); }
    }
    const oldCommon = a.filter(n => used.has(n));
    const newCommon = b.filter(n => pairs.has(n)).map(n => pairs.get(n));
    const oldPositions = new Map(oldCommon.map((n, i) => [n, i]));
    const newPositions = new Map(newCommon.map((n, i) => [n, i]));
    const positionsA = new Map(a.map((n, i) => [n, i + 1]));
    const positionsB = new Map(b.map((n, i) => [n, i + 1]));
    for (const next of b) {
      const old = pairs.get(next);
      const child = visit(old, next, entry.id);
      child.beforePosition = old ? positionsA.get(old) : null;
      child.afterPosition = positionsB.get(next);
      child.reordered = !!old && oldPositions.get(old) !== newPositions.get(old);
      if (child.reordered) { child.status = 'modified'; child.semanticChanged = true; child.formattingOnly = false; }
      entry.orderChanged ||= child.reordered;
      entry.children.push(child.id);
    }
    for (let i = 0; i < a.length; i++) {
      if (!used.has(a[i])) {
        const child = visit(a[i], null, entry.id);
        child.beforePosition = i + 1;
        child.afterPosition = null;
        entry.children.push(child.id);
      }
    }
    entry.semanticChanged = !left || !right || entry.ownChanged || entry.orderChanged || entry.children.some(id => entries[id].semanticChanged);
    entry.status = !left ? 'added' : !right ? 'removed'
      : entry.semanticChanged || (includeFormatting && entry.ownFormattingChanged) || entry.children.some(id => entries[id].status !== 'unchanged') ? 'modified' : 'unchanged';
    entry.formattingOnly = entry.status === 'modified' && !entry.semanticChanged;
    return entry;
  }
  const root = visit(before?.root, after?.root);
  for (const entry of entries) {
    counts[entry.status]++;
    if (entry.status !== 'unchanged') kindsChanged[entry.kind]++;
  }
  return { rootId: root.id, entries, counts, kindsChanged, formattingCount: entries.filter(entry => entry.formattingOnly).length };
}

// Formatting is for inspection, not an export. Leaf text and mixed content are
// kept intact (including script indentation); element-only content is indented.
export function formatXml(xml) {
  if (!xml) return '';
  const parser = new SaxesParser({ xmlns: true });
  const stack = [];
  let result = '';
  parser.on('opentag', tag => {
    const parent = stack.at(-1);
    const space = tag.attributes['xml:space']?.value;
    stack.push({ name: tag.name, open: `<${tag.name}${Object.values(tag.attributes).map(a => ` ${a.name}="${escapeAttribute(a.value)}"`).join('')}>`,
      parts: [], preserve: space === 'preserve' || (space !== 'default' && !!parent?.preserve) });
  });
  parser.on('text', value => stack.at(-1).parts.push({ text: value }));
  parser.on('comment', value => stack.at(-1).parts.push({ raw: `<!--${value}-->` }));
  parser.on('processinginstruction', value => stack.at(-1).parts.push({ raw: `<?${value.target}${value.body ? ` ${value.body}` : ''}?>` }));
  parser.on('closetag', () => {
    const frame = stack.pop();
    if (stack.length) stack.at(-1).parts.push({ element: frame });
    else {
      const render = (node, depth, inline = false) => {
        const mixed = inline || node.preserve || node.parts.some(p => p.text !== undefined);
        if (node.parts.length && node.parts.every(p => p.text !== undefined)) {
          const text = node.parts.map(p => p.text).join('');
          if (/[\n<&]/.test(text)) return `${node.open}<![CDATA[${text.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]></${node.name}>`;
        }
        const parts = node.parts.map(p => p.element ? render(p.element, depth + 1, mixed) : p.raw ?? escapeText(p.text));
        if (mixed || !parts.length) return `${node.open}${parts.join('')}</${node.name}>`;
        const indent = '  '.repeat(depth);
        return `${node.open}\n${parts.map(p => `${indent}  ${p}`).join('\n')}\n${indent}</${node.name}>`;
      };
      result = render(frame, 0);
    }
  });
  parser.write(xml).close();
  return result;
}

// Long physical lines are segmented for bounded rendering; no text is omitted.
function displayLines(xml, original) {
  if (!xml) return [];
  return (original ? xml : formatXml(xml)).split('\n').flatMap((text, index) => {
    const chunks = [];
    let offset = 0;
    do {
      let end = Math.min(text.length, offset + 1000);
      if (end < text.length && /[\uDC00-\uDFFF]/.test(text[end])) end++;
      chunks.push({ text: text.slice(offset, end), line: index + 1, continued: offset > 0 });
      offset = end;
    } while (offset < text.length);
    return chunks;
  });
}

export function createXmlDiff(entry, { original = false } = {}) {
  const field = original ? 'raw' : 'xml';
  const left = displayLines(entry.left?.[field], original), right = displayLines(entry.right?.[field], original);
  const changes = diffArrays(left.map(l => l.text), right.map(l => l.text), { timeout: 750, maxEditLength: 2000 });
  // A bounded fallback still shows all text; it simply forgoes fine alignment.
  const blocks = changes || [{ removed: true, count: left.length }, { added: true, count: right.length }];
  const rows = [];
  let a = 0, b = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block.added && !block.removed) {
      for (let j = 0; j < block.count; j++) rows.push({ left: left[a++], right: right[b++], status: 'same' });
    } else {
      const removed = block.removed ? block.count : 0;
      const added = block.added ? block.count : blocks[i + 1]?.added ? blocks[++i].count : 0;
      for (let j = 0; j < Math.max(removed, added); j++) rows.push({ left: j < removed ? left[a++] : null, right: j < added ? right[b++] : null, status: 'changed' });
    }
  }
  return { rows, fallback: !changes };
}

export function diffPage(diff, page = 0, changesOnly = true) {
  const indexes = [];
  for (let i = 0; i < diff.rows.length; i++) {
    if (!changesOnly || diff.rows[i].status !== 'same') {
      const start = changesOnly ? Math.max(0, i - 3) : i;
      const end = changesOnly ? Math.min(diff.rows.length - 1, i + 3) : i;
      for (let j = Math.max(start, (indexes.at(-1) ?? -1) + 1); j <= end; j++) indexes.push(j);
    }
  }
  const pages = Math.max(1, Math.ceil(indexes.length / 120));
  page = Math.max(0, Math.min(pages - 1, page));
  return { page, pages, totalRows: diff.rows.length, fallback: diff.fallback,
    rows: indexes.slice(page * 120, (page + 1) * 120).map((index, i) => ({ ...diff.rows[index], gap: index > (indexes[page * 120 + i - 1] ?? -1) + 1 })) };
}
