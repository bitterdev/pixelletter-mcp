/* Author: Fabian Bitter (fabian@bitter.de) */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRequestXml,
  decodeResponseBody,
  escapeXml,
  parseAccountInfo,
  parseOrderResponse,
} from '../src/pixelletter/xml.js';

test('escaping follows the reference class, ampersand and angle brackets only', () => {
  assert.equal(escapeXml('Müller & Söhne <GmbH>'), 'Müller &amp; Söhne &lt;GmbH&gt;');
  assert.equal(escapeXml(undefined), '');
});

test('the request carries the auth block the handbook documents', () => {
  const xml = buildRequestXml(
    {
      email: 'user@example.com',
      password: 'secret',
      acceptTerms: true,
      waiveWithdrawalRight: true,
      testMode: true,
    },
    '<command><order type="upload"></order></command>',
  );
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8" standalone="yes"\?>/);
  assert.match(xml, /<pixelletter version="1\.3">/);
  assert.match(xml, /<email>user@example\.com<\/email>/);
  assert.match(xml, /<password>secret<\/password>/);
  assert.match(xml, /<agb>ja<\/agb>/);
  assert.match(xml, /<widerrufsverzicht>ja<\/widerrufsverzicht>/);
  assert.match(xml, /<testmodus>true<\/testmodus>/);
  assert.match(xml, /<command>/);
});

test('waiving nothing and running live flips the auth flags', () => {
  const xml = buildRequestXml(
    { email: 'a@b.de', password: 'x', acceptTerms: true, waiveWithdrawalRight: false, testMode: false },
    '<command/>',
  );
  assert.match(xml, /<widerrufsverzicht>nein<\/widerrufsverzicht>/);
  assert.match(xml, /<testmodus>false<\/testmodus>/);
});

test('a success response yields code, message and transaction', () => {
  const parsed = parseOrderResponse(`<?xml version="1.0" encoding="UTF-8"?>
<pixelletter version="1.3">
  <response>
    <result code="100">
      <msg>Auftrag erfolgreich übermittelt</msg>
    </result>
    <transaction>ABC-123</transaction>
  </response>
</pixelletter>`);
  assert.equal(parsed.code, '100');
  assert.equal(parsed.message, 'Auftrag erfolgreich übermittelt');
  assert.equal(parsed.transaction, 'ABC-123');
});

test('a response without a transaction reports undefined', () => {
  const parsed = parseOrderResponse('<pixelletter><response><result code="021"><msg>Guthaben</msg></result></response></pixelletter>');
  assert.equal(parsed.code, '021');
  assert.equal(parsed.transaction, undefined);
});

test('garbage instead of XML is rejected loudly', () => {
  assert.throws(() => parseOrderResponse('<html>login</html>'), /unexpected response/i);
});

test('the account info yields customer data and the credit as a number', () => {
  const info = parseAccountInfo(`<?xml version="1.0" encoding="iso-8859-1"?>
<pixelletter version="1.1">
  <costumer:id>342010</costumer:id>
  <costumer:data>
    <company />
    <firstname>Manfred</firstname>
    <lastname>Müller</lastname>
    <country>DE</country>
    <payment:type>guthaben</payment:type>
  </costumer:data>
  <costumer:credit currency="EUR">27.20</costumer:credit>
</pixelletter>`);
  assert.equal(info.customerId, '342010');
  assert.equal(info.credit, 27.2);
  assert.equal(info.currency, 'EUR');
  assert.equal(info.customer.firstname, 'Manfred');
  assert.equal(info.customer.company, '');
  assert.equal(info.customer['payment:type'], 'guthaben');
});

test('the declared encoding decides how the response bytes are read', () => {
  const latin1 = Buffer.concat([
    Buffer.from('<?xml version="1.0" encoding="iso-8859-1"?><msg>M', 'latin1'),
    Buffer.from([0xfc]),
    Buffer.from('ller</msg>', 'latin1'),
  ]);
  assert.match(decodeResponseBody(latin1), /Müller/);

  const utf8 = Buffer.from('<?xml version="1.0" encoding="UTF-8"?><msg>Müller</msg>', 'utf8');
  assert.match(decodeResponseBody(utf8), /Müller/);
});
