import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFile, searchNodes, visibleRows } from '../src/core.js';

test('streams two projects larger than 23 MB and finds matches across 24,000 steps', async t => {
  const parts = ['<soapui-project xmlns="http://eviware.com/soapui/config" name="Large synthetic project">'];
  const padding = '// ordinary script content\n'.repeat(92);
  for (let s = 0; s < 40; s++) {
    parts.push(`<testSuite name="Suite ${s}">`);
    for (let c = 0; c < 30; c++) {
      parts.push(`<testCase name="Case ${c}">`);
      for (let step = 0; step < 10; step++) {
        parts.push(`<testStep name="Step ${step}" type="groovy"><config><script><![CDATA[${padding}${step === 7 ? '// CRL boundary check' : '// no match'}]]></script></config></testStep>`);
      }
      parts.push('</testCase>');
    }
    parts.push('</testSuite>');
  }
  parts.push('</soapui-project>');
  const file = new File(parts, 'large-synthetic.xml');
  assert.ok(file.size > 23 * 1024 * 1024);
  const start = performance.now();
  let progressCalls = 0;
  const first = await parseFile(file, 'large1', () => progressCalls++);
  const second = await parseFile(file, 'large2');
  const parsed = performance.now();
  const nodes = [...first.nodes, ...second.nodes];
  const result = searchNodes(nodes, 'CRL');
  const searched = performance.now();
  assert.equal(nodes.filter(node => node.kind === 'step').length, 24000);
  assert.equal(result.occurrences, 2400);
  assert.equal(result.matchingNodes, 2400);
  assert.deepEqual(result.matchingKinds, { project: 2, suite: 80, case: 2400, step: 2400 });
  assert.equal(result.hits[first.rootId].total, 1200);
  assert.equal(result.hits[second.rootId].total, 1200);
  assert.ok(progressCalls > 90);
  const map = new Map(nodes.map(node => [node.id, node]));
  const rows = visibleRows([first.rootId, second.rootId], map, result.hits, true, new Set(), new Set(), new Set());
  assert.equal(rows.length, 4882);
  t.diagnostic(`Per project: ${(file.size / 1024 / 1024).toFixed(1)} MiB. Two imports: ${Math.round(parsed - start)} ms. Search: ${Math.round(searched - parsed)} ms. Heap: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MiB. Synthetic data in Node; browser/hardware timings vary.`);
});
