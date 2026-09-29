import test from 'node:test';
import assert from 'node:assert/strict';
import { createComparisonParser, parseComparisonFile, compareProjects, formatXml, createXmlDiff, diffPage } from '../src/compare-core.js';
const parse = (xml, chunk = 17) => {
  const parser = createComparisonParser();
  for (let i = 0; i < xml.length; i += chunk) parser.write(xml.slice(i, i + chunk));
  return parser.finish();
};
const project = body => `<con:soapui-project xmlns:con="http://eviware.com/soapui/config" name="Project"><con:testSuite name="Suite"><con:testCase name="Case">${body}</con:testCase></con:testSuite></con:soapui-project>`;
const step = (name, text = 'assert true', id = '') => `<con:testStep name="${name}"${id ? ` id="${id}"` : ''} type="groovy"><con:config><con:script><![CDATA[${text}]]></con:script></con:config></con:testStep>`;
const compare = (a, b) => compareProjects(parse(a), parse(b));

test('normalizes element indentation, attribute order, entities, CDATA and empty-element syntax', () => {
  const a = '<soapui-project name="P"><testSuite name="S" id="s"><properties/><testCase name="C"><testStep name="One"><config><script><![CDATA[a < b && c]]></script></config></testStep></testCase></testSuite></soapui-project>';
  const b = '<soapui-project name="P">\n <testSuite id="s" name="S">\n <properties></properties>\n <testCase name="C">\n<testStep name="One"><config><script>a &lt; b &amp;&amp; c</script></config></testStep>\n</testCase>\n</testSuite>\n</soapui-project>';
  assert.equal(compare(a, b).counts.unchanged, 4);
});

test('one script change changes its ancestors but not their own XML; names use stable IDs', () => {
  const result = compare(project(step('Old name', 'assert true', 'id-1')), project(step('New name', 'assert false', 'id-1')));
  assert.equal(result.entries.length, 4);
  assert.deepEqual(result.counts, { added: 0, removed: 0, modified: 4, unchanged: 0 });
  assert.deepEqual(result.entries.map(n => n.ownChanged), [false, false, false, true]);
  assert.equal(result.entries[3].beforeName, 'Old name');
  const diff = createXmlDiff(result.entries[3]);
  assert.ok(diff.rows.some(row => row.left?.text.includes('assert true') && row.status === 'changed'));
  assert.ok(diff.rows.some(row => row.right?.text.includes('assert false') && row.status === 'changed'));
});

test('additions, removals, empty elements, attributes and project/case properties are not lost', () => {
  const a = project('<con:properties><con:property><con:name>x</con:name><con:value>1</con:value></con:property></con:properties>' + step('Removed') + step('Same'));
  const b = project('<con:properties><con:property><con:name>x</con:name><con:value>2</con:value></con:property></con:properties><con:settings/>' + step('Same') + step('Added'));
  const result = compare(a, b);
  assert.equal(result.counts.added, 1); assert.equal(result.counts.removed, 1);
  assert.equal(result.entries.find(n => n.kind === 'case').ownChanged, true);
  assert.equal(result.entries.find(n => n.name === 'Same').status, 'unchanged');
  assert.equal(result.entries.find(n => n.name === 'Same').reordered, false, 'insertion/removal does not mean reorder');
  assert.equal(compare(project(step('Same')), project(step('Same').replace('type="groovy"', 'type="groovy" disabled="true"'))).entries.at(-1).ownChanged, true);
});

test('reordering common steps is visible without any text change', () => {
  const result = compare(project(step('A') + step('B') + step('C')), project(step('C') + step('A') + step('B')));
  assert.equal(result.entries[2].orderChanged, true);
  assert.equal(result.entries[2].ownChanged, false);
  assert.equal(result.entries.filter(n => n.reordered).length, 3);
  assert.equal(result.entries[3].beforePosition, 3); assert.equal(result.entries[3].afterPosition, 1);
  assert.equal(result.counts.modified, 6);
});

test('unique names match regenerated IDs; ambiguous duplicates are not guessed', () => {
  assert.equal(compare(project(step('A', 'x', 'old')), project(step('A', 'x', 'new'))).entries.at(-1).status, 'modified');
  const duplicate = compare(project(step('A') + step('A')), project(step('A') + step('A')));
  assert.equal(duplicate.counts.unchanged, 5);
  const ambiguous = compare(project(step('A', 'one') + step('A', 'two')), project(step('A', 'changed') + step('A', 'different')));
  assert.equal(ambiguous.counts.added, 2); assert.equal(ambiguous.counts.removed, 2);
  const ids = compare(project(step('A', 'one', '1') + step('A', 'two', '2')), project(step('A', 'two', '2') + step('A', 'one', '1')));
  assert.equal(ids.counts.added, 0); assert.equal(ids.counts.removed, 0);
});

test('keeps namespaces, mixed content, whitespace-only values, comments and processing instructions', () => {
  const a = '<soapui-project xmlns="http://eviware.com/soapui/config" xmlns:p="urn:payload" name="P"><testSuite name="S"><testCase name="C"><testStep name="A"><config><p:payload p:attr="a&#10;b">hello <p:b/> world</p:payload><script>  </script><!--one--><?custom two?></config></testStep></testCase></testSuite></soapui-project>';
  const result = compare(a, a.replace('<script>  </script>', '<script> </script>'));
  assert.equal(result.entries.at(-1).status, 'modified');
  const xml = result.entries.at(-1).left.xml;
  assert.ok(xml.includes('xmlns:p="urn:payload"'));
  assert.ok(xml.includes('a&#10;b'));
  assert.ok(formatXml(xml).includes('hello <p:b></p:b> world'));
  assert.ok(formatXml(xml).includes('<!--one-->'));
  assert.ok(formatXml(xml).includes('<?custom two?>'));
  assert.equal(compare(a, a.replace('<!--one-->', '<!--three-->')).entries.at(-1).ownChanged, true);
  const preserved = a.replace('<config>', '<config xml:space="preserve">\n');
  assert.equal(compare(preserved, preserved.replace('<config xml:space="preserve">\n', '<config xml:space="preserve">')).entries.at(-1).ownChanged, true);
});

test('script spacing is preserved across chunks, and displayed markup never becomes executable', () => {
  const xml = project(step('Safe', '  log.info "<script>alert(1)</script>"\n\tassert x < 5 && y > 1\n'));
  const a = parse(xml, 1), b = parse(xml, 500);
  assert.equal(a.nodes.at(-1).xml, b.nodes.at(-1).xml);
  assert.ok(formatXml(a.nodes.at(-1).xml).includes('<![CDATA[  log.info'));
  assert.ok(formatXml(a.nodes.at(-1).xml).includes('\n\tassert x < 5 && y > 1\n'));
  assert.equal(compare(xml, xml.replace('  log.info', ' log.info')).entries.at(-1).status, 'modified');
});

test('rejects malformed, DTD, encrypted and foreign XML; payload hierarchy lookalikes stay content', () => {
  for (const xml of ['<soapui-project>', '<html/>', '<!DOCTYPE soapui-project><soapui-project/>', '<soapui-project encrypted="true"/>']) assert.throws(() => parse(xml));
  const data = parse(project(step('A').replace('<con:config>', '<con:config><testCase xmlns="urn:data" name="fake"/>')));
  assert.equal(data.nodes.length, 4);
});

test('missing entire file is an addition/removal and UTF-16 file reading works', async () => {
  const data = await parseComparisonFile(new File([Buffer.from('\ufeff' + project(step('A')), 'utf16le')], 'utf16.xml'));
  assert.equal(compareProjects(null, data).counts.added, 4);
  assert.equal(compareProjects(data, null).counts.removed, 4);
});

test('bounded diff pages expose every character, including long Unicode lines and a final change', () => {
  const text = 'a😀'.repeat(100000);
  const result = compare(project(step('A', text)), project(step('A', text + 'END')));
  const diff = createXmlDiff(result.entries.at(-1));
  let actual = '';
  const first = diffPage(diff, 0, false);
  for (let i = 0; i < first.pages; i++) {
    const page = diffPage(diff, i, false);
    assert.ok(page.rows.length <= 120);
    for (const row of page.rows) if (row.right) { assert.ok(!/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(row.right.text)); actual += row.right.text; }
  }
  assert.equal(actual, formatXml(result.entries.at(-1).right.xml).replaceAll('\n', ''));
  const changed = diffPage(diff);
  assert.ok(changed.rows.some(row => row.right?.text.includes('END')));
});

test('large unrelated changes fall back to complete blocks with no dropped lines', () => {
  const a = Array.from({ length: 2300 }, (_, i) => `old ${i}`).join('\n');
  const b = Array.from({ length: 2300 }, (_, i) => `new ${i}`).join('\n');
  const result = compare(project(step('A', a)), project(step('A', b)));
  const diff = createXmlDiff(result.entries.at(-1));
  assert.equal(diff.fallback, true);
  assert.ok(diff.rows.filter(row => row.left).map(row => row.left.text).join('\n').includes(a));
  assert.ok(diff.rows.filter(row => row.right).map(row => row.right.text).join('\n').includes(b));
});

test('compares two 25+ MiB projects with 12,000 steps without duplicating scripts into parents', async t => {
  const padding = '// ordinary content\n'.repeat(115);
  const parts = Array.from({ length: 12000 }, (_, i) => step(`Step ${i}`, padding + (i === 9000 ? 'before' : 'same'), `id-${i}`));
  const a = new File([project(parts.join(''))], 'before.xml');
  const b = new File([project(parts.join('').replace('before', 'after'))], 'after.xml');
  assert.ok(a.size > 25 * 1024 * 1024);
  const start = performance.now();
  const result = compareProjects(await parseComparisonFile(a), await parseComparisonFile(b));
  assert.equal(result.entries.length, 12003);
  assert.equal(result.counts.modified, 4);
  assert.equal(result.entries.find(n => n.name === 'Step 9000').ownChanged, true);
  assert.ok(result.entries[0].left.xml.length < 200);
  assert.ok(result.entries[2].left.xml.length < 200);
  t.diagnostic(`Compared two ${(a.size / 1024 / 1024).toFixed(1)} MiB synthetic files in ${Math.round(performance.now() - start)} ms. Node functional test, not a browser benchmark.`);
});


test('formatting differences are opt-in: attribute order, quotes, indentation, CDATA and empty spelling', () => {
  const a = '<soapui-project name="P" id="p"><testSuite name="S"><testCase name="C"><testStep name="A"><config><script><![CDATA[a < b]]></script><empty/></config></testStep></testCase></testSuite></soapui-project>';
  const b = "<soapui-project id='p' name='P'>\r\n <testSuite name=\"S\"><testCase name=\"C\"><testStep name=\"A\"><config><script>a &lt; b</script><empty></empty></config></testStep></testCase></testSuite>\r\n</soapui-project>";
  const before = parse(a, 1), after = parse(b, 3);
  assert.equal(compareProjects(before, after).counts.modified, 0);
  const included = compareProjects(before, after, { includeFormatting: true });
  assert.equal(included.counts.modified, 4);
  assert.equal(included.formattingCount, 4);
  assert.equal(included.entries.at(-1).ownFormattingChanged, true);
  assert.equal(included.entries.at(-1).ownChanged, false);
  assert.equal(createXmlDiff(included.entries.at(-1)).rows.filter(row => row.status === 'changed').length, 0);
  const original = createXmlDiff(included.entries.at(-1), { original: true });
  assert.ok(original.rows.some(row => row.left?.text.includes('<![CDATA[a < b]]>')));
  assert.ok(original.rows.some(row => row.right?.text.includes('a &lt; b')));
  const changed = compareProjects(before, parse(b.replace('a &lt; b', 'a &lt; c')), { includeFormatting: true });
  assert.equal(changed.formattingCount, 0, 'Content changes and ancestors are never labelled formatting-only');
});

test('raw own fragments preserve exact text across chunks, Unicode, BOM, long tags and child omission', () => {
  const before = '\ufeff<?xml version="1.0"?><soapui-project name="😀" id="p">  <testSuite name="S"><testCase name="C"><testStep name="First"/><testStep name="Second" note="'+ 'x'.repeat(300000) +'">\r\n<config><![CDATA[😀<&]]></config></testStep></testCase></testSuite>\n</soapui-project>';
  const data = parse(before, 512);
  assert.equal(data.root.raw, '<soapui-project name="😀" id="p">  \n</soapui-project>');
  assert.equal(data.nodes.find(node => node.name === 'First').raw, '<testStep name="First"/>');
  const second = data.nodes.find(node => node.name === 'Second');
  assert.equal(second.raw, before.slice(before.indexOf('<testStep name="Second"'), before.indexOf('</testCase>')));
  assert.ok(!data.nodes.find(node => node.kind === 'case').raw.includes('testStep'));
});
