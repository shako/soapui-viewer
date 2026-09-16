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
  assert.deepEqual(result.matchingKinds, { project: 1, suite: 1, case: 1, step: 2 });
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
  assert.deepEqual(result.matchingKinds, { project: 2, suite: 2, case: 2, step: 4 });
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
  const { hits, matchingKinds } = searchNodes(nodes, 'Certificate validation', true);
  assert.deepEqual(matchingKinds, { project: 1, suite: 1, case: 0, step: 0 });
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

test('search summary reports zero matching branches when nothing matches or the search is cleared', () => {
  const { nodes } = example();
  for (const query of ['', 'no-such-value']) {
    assert.deepEqual(searchNodes(nodes, query).matchingKinds, { project: 0, suite: 0, case: 0, step: 0 });
  }
  assert.deepEqual(searchNodes([], 'CRL').matchingKinds, { project: 0, suite: 0, case: 0, step: 0 });
});

const scopedProject = () => parse(`<c:soapui-project xmlns:c="http://eviware.com/soapui/config" name="Project CRL">
  <c:properties><c:property><c:name>CRL endpoint</c:name><c:value>crl-url</c:value></c:property></c:properties>
  <c:testSuite name="Suite CRL"><c:testCase name="Case">
    <c:properties><c:property><c:name>Setting</c:name><c:value>CRL</c:value></c:property></c:properties>
    <c:testStep name="Step CRL" type="groovy"><c:config>
      <c:script><![CDATA[log.info 'CRL']]></c:script>
      <payload xmlns="urn:request"><properties><property><name>CRL payload</name><value>CRL payload value</value></property></properties></payload>
      <c:assertion name="CRL assertion"/>
    </c:config></c:testStep>
    <c:testStep name="Property bag" type="properties" disabled="true"><c:config><c:properties>
      <c:property><c:name>CRL key</c:name><c:value>CRL CRL</c:value></c:property>
    </c:properties></c:config></c:testStep>
  </c:testCase></c:testSuite>
</c:soapui-project>`);

test('name, property and content filters partition hits without counting repeated occurrences as extra branches', () => {
  const { nodes } = scopedProject();
  const results = Object.fromEntries(['all', 'name', 'property', 'content'].map(scope => [scope, searchNodes(nodes, 'CRL', false, scope)]));
  assert.equal(results.all.occurrences, 13);
  assert.equal(results.name.occurrences, 3);
  assert.equal(results.property.occurrences, 6);
  assert.equal(results.content.occurrences, 4);
  assert.equal(results.all.occurrences, results.name.occurrences + results.property.occurrences + results.content.occurrences);
  for (const scope of ['name', 'property', 'content']) {
    assert.deepEqual(results[scope].matchingKinds, { project: 1, suite: 1, case: 1, step: 1 });
  }
  const script = nodes.find(node => node.name === 'Step CRL');
  const properties = nodes.find(node => node.name === 'Property bag');
  assert.equal(results.property.hits[script.id].own, 0, 'Request XML property elements are content');
  assert.equal(results.property.hits[properties.id].own, 3, 'Disabled property steps are still searchable');
  assert.equal(results.content.hits[properties.id].own, 0);
  assert.equal(searchNodes(nodes, 'crl', true, 'property').occurrences, 1);
  assert.equal(searchNodes(nodes, 'crl', true, 'name').occurrences, 0);
});

test('field counts and highlight pages obey the scope while keeping excluded content available for context', () => {
  const { nodes } = scopedProject();
  for (const scope of ['all', 'name', 'property', 'content']) {
    const result = searchNodes(nodes, 'CRL', false, scope);
    for (const node of nodes) {
      const fields = describeNode(node, 'CRL', false, scope);
      assert.equal(fields.reduce((sum, field) => sum + field.count, 0), result.hits[node.id].own);
      for (const field of fields) {
        const page = fieldPage(node.fields[field.index], 'CRL', false, { matchIndex: 0 }, scope);
        assert.equal(page.total, field.count);
        assert.equal(page.marks.length, field.count);
        assert.equal(page.text, node.fields[field.index].value);
      }
    }
  }
});

test('properties are recognized in namespace-free exports without treating nested request payloads as properties', () => {
  const { nodes } = parse(`<soapui-project name="Project"><properties><property><name>CRL</name><value>CRL</value></property></properties>
    <testSuite name="Suite"><testCase name="Case"><testStep name="Step"><config>
      <payload><properties><property><name>CRL</name></property></properties></payload>
    </config></testStep></testCase></testSuite></soapui-project>`);
  assert.equal(searchNodes(nodes, 'CRL', false, 'property').occurrences, 2);
  assert.equal(searchNodes(nodes, 'CRL', false, 'content').occurrences, 1);
});
