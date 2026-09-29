import { parseComparisonFile, compareProjects, createXmlDiff, diffPage } from './compare-core.js';
import { parseFile, searchNodes, describeNode, fieldPage } from './core.js';

const nodes = new Map();
let serial = 0;
let comparison;
let selectedDiff;
let queue = Promise.resolve();

async function handle({ id, action, ...data }) {
  try {
    let result;
    if (action === 'compare') {
      comparison = null;
      selectedDiff = null;
      const parse = file => file ? parseComparisonFile(file, progress => postMessage({ event: 'compare-progress', fileName: file.name, progress })) : null;
      const before = await parse(data.before);
      const after = await parse(data.after);
      if (!before && !after) throw new Error('Choose at least one project version.');
      comparison = compareProjects(before, after, data);
      result = { ...comparison, entries: comparison.entries.map(({ left, right, ...entry }) => entry) };
    } else if (action === 'compare-options') {
      if (!comparison) throw new Error('Compare the project versions first.');
      const { left, right } = comparison.entries[comparison.rootId];
      comparison = compareProjects(left ? { root: left } : null, right ? { root: right } : null, data);
      selectedDiff = null;
      result = { ...comparison, entries: comparison.entries.map(({ left, right, ...entry }) => entry) };
    } else if (action === 'compare-detail') {
      const entry = comparison?.entries[data.nodeId];
      if (!entry) throw new Error('Compare the project versions again.');
      if (selectedDiff?.id !== entry.id || selectedDiff.original !== !!data.original) selectedDiff = { id: entry.id, original: !!data.original, ...createXmlDiff(entry, data) };
      result = diffPage(selectedDiff, data.page, data.changesOnly);
    } else if (action === 'compare-clear') {
      comparison = null;
      selectedDiff = null;
      result = true;
    } else if (action === 'import') {
      const project = await parseFile(data.file, `p${serial++}`, progress => {
        postMessage({ event: 'progress', fileName: data.file.name, progress });
      });
      for (const node of project.nodes) nodes.set(node.id, node);
      result = { rootId: project.rootId, nodes: project.nodes.map(({ fields, ...node }) => node) };
    } else if (action === 'search') {
      result = searchNodes([...nodes.values()], data.query, data.caseSensitive, data.scope);
    } else if (action === 'detail') {
      const node = nodes.get(data.nodeId);
      if (!node) throw new Error('This item is no longer open.');
      result = describeNode(node, data.query, data.caseSensitive, data.scope);
    } else if (action === 'field') {
      const field = nodes.get(data.nodeId)?.fields[data.fieldIndex];
      if (!field) throw new Error('This field is no longer available.');
      result = fieldPage(field, data.query, data.caseSensitive, data.page, data.scope);
    } else if (action === 'clear') {
      nodes.clear();
      result = true;
    } else {
      throw new Error('Unknown action.');
    }
    postMessage({ id, result });
  } catch (error) {
    postMessage({ id, error: error.message });
  }
}

onmessage = ({ data }) => { queue = queue.then(() => handle(data)); };
