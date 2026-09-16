export const demoProjects = [
  { name: 'Certificaten-voorbeeld.xml', xml: `<?xml version="1.0" encoding="UTF-8"?>
<con:soapui-project xmlns:con="http://eviware.com/soapui/config" name="Certificaten · voorbeeld">
  <con:testSuite name="Certificaatvalidatie">
    <con:testCase name="Ingetrokken certificaat weigeren">
      <con:testStep name="Testgegevens klaarzetten" type="groovy"><con:config><con:script><![CDATA[def certificateId = 'demo-001'
testRunner.testCase.setPropertyValue('certificateId', certificateId)]]></con:script></con:config></con:testStep>
      <con:testStep name="CRL ophalen" type="restrequest"><con:config><con:restRequest><con:endpoint>https://example.invalid/crl</con:endpoint><con:request/></con:restRequest></con:config></con:testStep>
      <con:testStep name="Intrekking controleren" type="groovy"><con:config><con:script><![CDATA[// Controleer of het certificaat op de CRL staat.
def crl = context.expand('\u0024{CRL ophalen#Response}')
assert crl.contains('demo-001')
log.info 'Certificaat gevonden op de CRL'
]]></con:script></con:config></con:testStep>
      <con:testStep name="Testgegevens opruimen" type="groovy"><con:config><con:script>log.info 'Test afgerond'</con:script></con:config></con:testStep>
    </con:testCase>
    <con:testCase name="Geldig certificaat accepteren"><con:testStep name="Geldigheid controleren" type="groovy"><con:config><con:script>assert true</con:script></con:config></con:testStep></con:testCase>
    <con:tearDownScript>log.info 'CRL-testen afgerond'</con:tearDownScript>
  </con:testSuite>
  <con:testSuite name="Verbinding"><con:testCase name="Status opvragen"><con:testStep name="Healthcheck" type="restrequest"><con:config><con:endpoint>https://example.invalid/health</con:endpoint></con:config></con:testStep></con:testCase></con:testSuite>
</con:soapui-project>` },
  { name: 'Gateway-voorbeeld.xml', xml: `<soapui-project xmlns="http://eviware.com/soapui/config" name="Gateway · voorbeeld">
  <testSuite name="CRL-cache"><testCase name="Verlopen cache vernieuwen">
    <setupScript><![CDATA[// Gebruik een korte CRL-cacheduur voor deze test.
context.setProperty('cacheSeconds', 1)]]></setupScript>
    <testStep name="Cache leegmaken" type="groovy"><config><script>log.info 'Cache leeg'</script></config></testStep>
    <testStep name="Nieuwe lijst opvragen" type="request"><config><request><request><![CDATA[<request><resource>CRL</resource></request>]]></request></request></config></testStep>
    <testStep name="Oude controle" type="groovy" disabled="true"><config><script>// CRL-controle tijdelijk uitgeschakeld</script></config></testStep>
  </testCase></testSuite>
</soapui-project>` },
];
