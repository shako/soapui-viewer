import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectParser, parseFile, matcher, countMatches, searchNodes, describeNode, fieldPage, visibleRows } from '../src/core.js';
import { demoProjects } from '../src/demo.js';

const parse = (xml, prefix = 'test', size = xml.length || 1) => {
  const parser = createProjectParser('example.xml', prefix);
  for (let i = 0; i < xml.length; i += size) parser.write(xml.slice(i, i + size));
  return parser.finish();
};
const wrap = inside => `<c:soapui-project xmlns:c="http://eviware.com/soapui/config" name="Project">${inside}</c:soapui-project>`;
const example = () => parse(demoProjects[0].xml);

test('recognizes real SoapUI hierarchy, namespaces, step types and disabled steps', () => {
  const a = example();
  assert.equal(a.nodes.filter(node => node.kind === 'suite').length, 2);
  assert.equal(a.nodes.filter(node => node.kind === 'case').length, 3);
  assert.equal(a.nodes.filter(node => node.kind === 'step').length, 6);
  const b = parse(demoProjects[1].xml);
  assert.equal(b.nodes.at(-1).disabled, true);
  assert.equal(b.nodes.at(-1).type, 'groovy');
  assert.equal(parse('<soapui-project name="Bare"><testSuite name="S"/></soapui-project>').nodes.length, 2);
});

test('each match belongs to its own suite, case or step, with ancestor totals only', () => {
  const { nodes } = example();
  const result = searchNodes(nodes, 'CRL');
  const suite = nodes.find(node => node.name === 'Certificate validation');
  const caseNode = nodes.find(node => node.name === 'Reject revoked certificate');
  const script = nodes.find(node => node.name === 'Check revocation');
  assert.equal(result.hits[suite.id].own, 1);
  assert.equal(result.hits[caseNode.id].own, 0);
  assert.equal(result.hits[script.id].own, 5);
  assert.equal(result.hits[caseNode.id].total, 7);
  assert.equal(result.occurrences, 8);
  assert.equal(result.matchingNodes, 3);
  assert.equal(result.hits[nodes[0].id].total, result.occurrences);
  const scriptField = script.fields.find(field => field.label.endsWith('script'));
  assert.ok(scriptField.value.includes('${Fetch CRL#Response}'));
});

test('CDATA and XML entities remain correct across arbitrary streaming boundaries', () => {
  const xml = wrap('<c:testSuite name="A &amp; B"><c:testCase name="C"><c:testStep name="S"><c:config><c:script><![CDATA[log.info "CRL <&> é 😀"]]></c:script><c:value>&lt;CRL&gt; &amp; &#x1F600;</c:value></c:config></c:testStep></c:testCase></c:testSuite>');
  const whole = parse(xml);
  assert.deepEqual(parse(xml, 'test', 1), whole);
  assert.deepEqual(parse(xml, 'test', 7), whole);
  assert.equal(whole.nodes[1].name, 'A & B');
  assert.equal(whole.nodes.at(-1).fields.at(-1).value, '<CRL> & 😀');
});

test('a lookalike testCase in request XML is not a SoapUI testcase', () => {
  const result = parse(wrap('<c:testSuite name="S"><c:testCase name="C"><c:testStep name="Step"><payload xmlns="urn:customer"><testCase name="CRL"/></payload></c:testStep></c:testCase></c:testSuite>'));
  assert.equal(result.nodes.length, 4);
  assert.equal(searchNodes(result.nodes, 'CRL').hits[result.nodes.at(-1).id].own, 1);
});

test('literal case-sensitive/insensitive searching supports punctuation, Unicode and multiple matches', () => {
  assert.equal(countMatches('a.b aXb A.B', matcher('a.b')), 2);
  assert.equal(countMatches('a.b aXb A.B', matcher('a.b', true)), 1);
  assert.equal(countMatches('${#Project#CRL} [CRL]', matcher('${#Project#CRL}')), 1);
  assert.equal(countMatches('anything', matcher('')), 0);
  assert.equal(countMatches('😀crl CRL', matcher('CRL')), 2);
  assert.equal(countMatches('aaa', matcher('aa')), 1);
});

test('project properties, case setup scripts, comments and assertion attributes are searchable', () => {
  const { nodes } = parse(wrap('<c:properties><c:property><c:name>CRL endpoint</c:name><c:value>https://example.invalid/crl</c:value></c:property></c:properties><c:testSuite name="S"><c:testCase name="C"><c:setupScript>CRL</c:setupScript><c:testStep name="Step"><c:assertion name="CRL check"/><!-- CRL comment --></c:testStep></c:testCase></c:testSuite>'));
  const { hits, occurrences } = searchNodes(nodes, 'CRL');
  assert.equal(hits[nodes[0].id].own, 2);
  assert.equal(hits[nodes[2].id].own, 1);
  assert.equal(hits[nodes[3].id].own, 2);
  assert.equal(occurrences, 5);
});

test('invalid, truncated, unrelated, encrypted and DTD XML fail explicitly', () => {
  for (const xml of ['', '<html/>', '<testSuite/>', wrap('<c:testSuite>'), '<soapui-project>&unknown;</soapui-project>', '<soapui-project encrypted="true"/>', wrap('<c:encryptedContent>opaque</c:encryptedContent>')]) {
    assert.throws(() => parse(xml));
  }
  assert.throws(() => parse('<!DOCTYPE soapui-project SYSTEM "file:///etc/passwd"><soapui-project/>'), /DTD/);
  assert.throws(() => parse('<!DOCTYPE soapui-project [<!ENTITY leak "secret">]><soapui-project>&leak;</soapui-project>'), /DTD/);
});

test('decodes UTF-8, UTF-16 and declared Windows-1252 files', async () => {
  for (const [bytes, expected] of [
    [Buffer.from('<soapui-project name="Café 😀"/>'), 'Café 😀'],
    [Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('<soapui-project name="Café 😀"/>', 'utf16le')]), 'Café 😀'],
    [Buffer.from('<?xml version="1.0" encoding="windows-1252"?><soapui-project name="Caf\xe9"/>', 'latin1'), 'Café'],
  ]) {
    const file = new File([bytes], 'encoding.xml');
    const result = await parseFile(file, 'enc');
    assert.equal(result.nodes[0].name, expected);
  }
});

test('multiple projects with identical names retain separate paths and totals', () => {
  const nodes = [...parse(demoProjects[0].xml, 'one').nodes, ...parse(demoProjects[0].xml, 'two').nodes];
  const result = searchNodes(nodes, 'CRL');
  assert.equal(new Set(nodes.map(node => node.id)).size, nodes.length);
  assert.equal(result.occurrences, 16);
  assert.equal(result.hits['one-0'].total, 8);
  assert.equal(result.hits['two-0'].total, 8);
});

test('filtered tree keeps ancestors and reveals only requested case context', () => {
  const { nodes, rootId } = example();
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const { hits } = searchNodes(nodes, 'CRL');
  const caseNode = nodes.find(node => node.name === 'Reject revoked certificate');
  const rows = context => visibleRows([rootId], nodeMap, hits, true, new Set(), new Set(), context);
  assert.deepEqual(rows(new Set()).map(row => nodeMap.get(row.id).name), [
    'Certificates · example', 'Certificate validation', 'Reject revoked certificate', 'Fetch CRL', 'Check revocation',
  ]);
  const context = rows(new Set([caseNode.id]));
  assert.equal(context.length, 7);
  assert.equal(context.filter(row => row.context).length, 2);
  assert.equal(context.some(row => nodeMap.get(row.id).name === 'Accept valid certificate'), false);
  const collapsed = visibleRows([rootId], nodeMap, hits, true, new Set(), new Set([caseNode.id]), new Set());
  assert.equal(collapsed.length, 3);
});

test('name-only suite match does not imply a match in every descendant', () => {
  const { nodes, rootId } = example();
  const { hits } = searchNodes(nodes, 'Certificate validation', true);
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const rows = visibleRows([rootId], nodeMap, hits, true, new Set(), new Set(), new Set());
  assert.equal(rows.length, 2);
});

test('long single-line fields expose the last match and every character without truncation', () => {
  const field = { value: 'a'.repeat(15000) + 'CRL' + 'b'.repeat(18000) + 'crl' };
  const first = fieldPage(field, 'CRL', false, { matchIndex: 0 });
  assert.equal(first.total, 2);
  assert.equal(first.marks.find(mark => mark.active).start, 800);
  const last = fieldPage(field, 'CRL', false, { matchIndex: 1 });
  assert.ok(last.text.endsWith('crl'));
  assert.equal(last.end, field.value.length);
  let text = '';
  let start = 0;
  do {
    const page = fieldPage(field, '', false, { start });
    text += page.text;
    start = page.end;
  } while (start < field.value.length);
  assert.equal(text, field.value);
});

test('field metadata and marks agree, including repeated overlapping candidates and Unicode offsets', () => {
  const { nodes } = example();
  const node = nodes.find(item => item.name === 'Check revocation');
  const fields = describeNode(node, 'CRL', false);
  assert.equal(fields.find(field => field.label.endsWith('script')).count, 5);
  const unicode = fieldPage({ value: 'İ 😀 CRL\ncrl' }, 'crl', false, { matchIndex: 1 });
  assert.equal(unicode.text.slice(unicode.marks[1].start, unicode.marks[1].end), 'crl');
  const repeated = fieldPage({ value: 'a'.repeat(20000) }, 'aaa', false, { start: 10001 });
  for (const mark of repeated.marks.filter(mark => mark.start > 0)) assert.equal((repeated.start + mark.start) % 3, 0);
});

test('HTML-like content stays text in the parser and is never evaluated', () => {
  const { nodes } = parse(wrap('<c:testSuite name="&lt;img src=x onerror=alert(1)&gt;"><c:setupScript><![CDATA[</script><script>alert("CRL")</script>]]></c:setupScript></c:testSuite>'));
  assert.equal(nodes[1].name, '<img src=x onerror=alert(1)>');
  assert.ok(nodes[1].fields.at(-1).value.includes('</script>'));
  assert.equal(searchNodes(nodes, 'CRL').occurrences, 1);
});
