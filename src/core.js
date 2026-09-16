import { SaxesParser } from 'saxes';

const SOAP_NS = 'http://eviware.com/soapui/config';
const kinds = { 'soapui-project': 'project', testSuite: 'suite', testCase: 'case', testStep: 'step' };
const parents = { suite: 'project', case: 'suite', step: 'case' };

export function createProjectParser(fileName, prefix) {
  const parser = new SaxesParser({ xmlns: true });
  const nodes = [];
  const stack = [];
  let root;
  const addField = (node, label, value, isName = false) => {
    if (value.trim()) node.fields.push({ label, value, isName });
  };
  parser.on('doctype', () => { throw new Error('XML with a DTD is not supported. Export the project without a DTD.'); });
  parser.on('opentag', tag => {
    const parent = stack.at(-1);
    const isSoap = tag.uri === SOAP_NS || tag.uri === '';
    const kind = isSoap ? kinds[tag.local] : undefined;
    if (!parent && kind !== 'project') {
      throw new Error('This is not a complete SoapUI project. Choose the XML export with soapui-project as its root element.');
    }
    const attributes = Object.values(tag.attributes).filter(attr => attr.uri !== 'http://www.w3.org/2000/xmlns/');
    const attr = name => attributes.find(item => item.local === name && !item.uri)?.value;
    if ((kind === 'project' && attr('encrypted') === 'true') || (isSoap && tag.local === 'encryptedContent')) {
      throw new Error('This project is encrypted. Export a decrypted copy from SoapUI first.');
    }
    const isNode = !parent || (kind && parent.isNode && parent.node.kind === parents[kind]);
    let node = parent?.node;
    if (isNode) {
      node = {
        id: `${prefix}-${nodes.length}`, parentId: parent?.node.id ?? null, kind,
        name: attr('name') || (kind === 'project' ? fileName : '(unnamed)'),
        type: attr('type') || '', disabled: attr('disabled') === 'true',
        sourceLine: parser.line, fileName, children: [], fields: [],
      };
      addField(node, 'Name', node.name, true);
      if (parent) parent.node.children.push(node.id);
      else root = node;
      nodes.push(node);
    }
    const path = isNode ? [] : [...parent.path, tag.local];
    for (const attribute of attributes) {
      if (isNode && attribute.local === 'name' && !attribute.uri) continue;
      addField(node, [...path, `@${attribute.name}`].join(' / '), attribute.value);
    }
    stack.push({ node, path, isNode, text: [] });
  });
  const onText = value => { if (stack.length) stack.at(-1).text.push(value); };
  parser.on('text', onText);
  parser.on('cdata', onText);
  parser.on('comment', value => {
    const frame = stack.at(-1);
    if (frame) addField(frame.node, [...frame.path, 'XML comment'].join(' / '), value);
  });
  parser.on('closetag', () => {
    const frame = stack.pop();
    addField(frame.node, frame.path.join(' / ') || 'Text', frame.text.join(''));
  });
  return {
    write(chunk) { parser.write(chunk); },
    finish() {
      parser.close();
      if (!root) throw new Error('This file does not contain a SoapUI project.');
      return { rootId: root.id, nodes };
    },
  };
}

export function detectEncoding(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  if (bytes[0] === 0x3c && bytes[1] === 0) return 'utf-16le';
  if (bytes[0] === 0 && bytes[1] === 0x3c) return 'utf-16be';
  const header = new TextDecoder('ascii').decode(bytes);
  return header.match(/^\s*<\?xml[^?]*encoding\s*=\s*["']([^"']+)/i)?.[1] || 'utf-8';
}

export async function parseFile(file, prefix, onProgress = () => {}) {
  const header = new Uint8Array(await file.slice(0, 256).arrayBuffer());
  const decoder = new TextDecoder(detectEncoding(header), { fatal: true });
  const parser = createProjectParser(file.name, prefix);
  const chunkSize = 256 * 1024;
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    const bytes = await file.slice(offset, offset + chunkSize).arrayBuffer();
    parser.write(decoder.decode(bytes, { stream: true }));
    onProgress(Math.min(1, (offset + chunkSize) / file.size));
  }
  parser.write(decoder.decode());
  return parser.finish();
}

export function matcher(query, caseSensitive = false) {
  if (!query) return null;
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
}

export function countMatches(value, regex) {
  if (!regex) return 0;
  regex.lastIndex = 0;
  let count = 0;
  while (regex.exec(value)) count++;
  return count;
}

export function searchNodes(nodes, query, caseSensitive = false) {
  const regex = matcher(query, caseSensitive);
  const hits = new Map();
  let occurrences = 0;
  let matchingNodes = 0;
  for (const node of nodes) {
    let name = 0;
    let content = 0;
    for (const field of node.fields) {
      const count = countMatches(field.value, regex);
      if (field.isName) name += count;
      else content += count;
    }
    const own = name + content;
    if (own) matchingNodes++;
    occurrences += own;
    hits.set(node.id, { own, total: own, name, content });
  }
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (node.parentId) hits.get(node.parentId).total += hits.get(node.id).total;
  }
  return { hits: Object.fromEntries(hits), occurrences, matchingNodes };
}

export function describeNode(node, query, caseSensitive) {
  const regex = matcher(query, caseSensitive);
  return node.fields.map((field, index) => ({
    index, label: field.label, length: field.value.length,
    count: countMatches(field.value, regex), isName: field.isName,
  }));
}

export function fieldPage(field, query, caseSensitive, { start = 0, matchIndex = null } = {}) {
  const value = field.value;
  const regex = matcher(query, caseSensitive);
  const size = Math.max(12000, query.length + 400);
  let total = 0;
  let target = null;
  if (regex) {
    let match;
    while ((match = regex.exec(value))) {
      if (total === matchIndex) target = match.index;
      total++;
    }
  }
  if (target !== null) start = Math.max(0, target - 800);
  start = Math.max(0, Math.min(start, Math.max(0, value.length - 1)));
  // Keep surrogate pairs intact at page boundaries.
  if (start > 0 && /[\uDC00-\uDFFF]/.test(value[start])) start--;
  let end = Math.min(value.length, start + size);
  if (end < value.length && /[\uDC00-\uDFFF]/.test(value[end])) end++;
  const marks = [];
  if (regex) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(value)) && match.index < end) {
      if (match.index + match[0].length > start) {
        marks.push({ start: Math.max(0, match.index - start), end: Math.min(end, match.index + match[0].length) - start, active: match.index === target });
      }
    }
  }
  let line = 1;
  for (let i = 0; i < start; i++) if (value[i] === '\n') line++;
  return { text: value.slice(start, end), start, end, length: value.length, line, marks, total, matchIndex: target === null ? null : matchIndex };
}

// Flatten only visible branches; the UI renders a small window of these rows.
export function visibleRows(roots, nodeMap, hits, searching, expanded, collapsed, contextCases) {
  const rows = [];
  const visit = (id, depth, context = false) => {
    const node = nodeMap.get(id);
    if (searching && !context && !hits[id]?.total) return;
    const open = searching ? !collapsed.has(id) : expanded.has(id);
    rows.push({ id, depth, open, context: searching && !hits[id]?.total });
    if (open) {
      const showContext = context || contextCases.has(id);
      for (const child of node.children) visit(child, depth + 1, showContext);
    }
  };
  for (const id of roots) visit(id, 0);
  return rows;
}
