export const demoProjects = [
  { name: 'Certificates-example.xml', xml: `<?xml version="1.0" encoding="UTF-8"?>
<con:soapui-project xmlns:con="http://eviware.com/soapui/config" name="Certificates · example">
  <con:testSuite name="Certificate validation">
    <con:testCase name="Reject revoked certificate">
      <con:testStep name="Prepare test data" type="groovy"><con:config><con:script><![CDATA[def certificateId = 'demo-001'
testRunner.testCase.setPropertyValue('certificateId', certificateId)]]></con:script></con:config></con:testStep>
      <con:testStep name="Fetch CRL" type="restrequest"><con:config><con:restRequest><con:endpoint>https://example.invalid/crl</con:endpoint><con:request/></con:restRequest></con:config></con:testStep>
      <con:testStep name="Check revocation" type="groovy"><con:config><con:script><![CDATA[// Check whether the certificate is on the CRL.
def crl = context.expand('\u0024{Fetch CRL#Response}')
assert crl.contains('demo-001')
log.info 'Certificate found on the CRL'
]]></con:script></con:config></con:testStep>
      <con:testStep name="Clean up test data" type="groovy"><con:config><con:script>log.info 'Test completed'</con:script></con:config></con:testStep>
    </con:testCase>
    <con:testCase name="Accept valid certificate"><con:testStep name="Check validity" type="groovy"><con:config><con:script>assert true</con:script></con:config></con:testStep></con:testCase>
    <con:tearDownScript>log.info 'CRL tests completed'</con:tearDownScript>
  </con:testSuite>
  <con:testSuite name="Connection"><con:testCase name="Get status"><con:testStep name="Health check" type="restrequest"><con:config><con:endpoint>https://example.invalid/health</con:endpoint></con:config></con:testStep></con:testCase></con:testSuite>
</con:soapui-project>` },
  { name: 'Gateway-example.xml', xml: `<soapui-project xmlns="http://eviware.com/soapui/config" name="Gateway · example">
  <testSuite name="CRL cache"><testCase name="Refresh expired cache">
    <setupScript><![CDATA[// Use a short CRL cache duration for this test.
context.setProperty('cacheSeconds', 1)]]></setupScript>
    <testStep name="Clear cache" type="groovy"><config><script>log.info 'Cache cleared'</script></config></testStep>
    <testStep name="Request new list" type="request"><config><request><request><![CDATA[<request><resource>CRL</resource></request>]]></request></request></config></testStep>
    <testStep name="Legacy check" type="groovy" disabled="true"><config><script>// CRL check temporarily disabled</script></config></testStep>
  </testCase></testSuite>
</soapui-project>` },
];
