import { parseFile, searchNodes, describeNode, fieldPage } from './core.js';

const nodes = new Map();
let serial = 0;
let queue = Promise.resolve();

async function handle({ id, action, ...data }) {
  try {
    let result;
    if (action === 'import') {
      const project = await parseFile(data.file, `p${serial++}`, progress => {
        postMessage({ event: 'progress', fileName: data.file.name, progress });
      });
      for (const node of project.nodes) nodes.set(node.id, node);
      result = { rootId: project.rootId, nodes: project.nodes.map(({ fields, ...node }) => node) };
    } else if (action === 'search') {
      result = searchNodes([...nodes.values()], data.query, data.caseSensitive);
    } else if (action === 'detail') {
      const node = nodes.get(data.nodeId);
      if (!node) throw new Error('Dit onderdeel is niet meer geopend.');
      result = describeNode(node, data.query, data.caseSensitive);
    } else if (action === 'field') {
      const field = nodes.get(data.nodeId)?.fields[data.fieldIndex];
      if (!field) throw new Error('Dit veld is niet meer beschikbaar.');
      result = fieldPage(field, data.query, data.caseSensitive, data.page);
    } else if (action === 'clear') {
      nodes.clear();
      result = true;
    } else {
      throw new Error('Onbekende actie.');
    }
    postMessage({ id, result });
  } catch (error) {
    postMessage({ id, error: error.message });
  }
}

onmessage = ({ data }) => { queue = queue.then(() => handle(data)); };
