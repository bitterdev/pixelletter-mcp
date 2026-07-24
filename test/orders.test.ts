/* Author: Fabian Bitter (fabian@bitter.de) */

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAddOption, validateCashOnDelivery, type CashOnDelivery } from '../src/pixelletter/options.js';
import {
  ACTIONS,
  buildAccountInfoXml,
  buildCancelOrderXml,
  buildTextOrderXml,
  buildUploadOrderXml,
  CONTROL_NO_DUPLEX,
  normalizeDestination,
  resolveControl,
  validateOrderOptions,
} from '../src/pixelletter/orders.js';

const cashOnDelivery: CashOnDelivery = {
  name: 'MUSTER GMBH',
  bankAccountId: '1234567',
  bankCode: '70050000',
  bankName: 'MUSTERBANK',
  amount: '49,90',
  reasonForPayment1: 'RECHNUNG 2026-1',
};

test('additional services are emitted as a sorted comma separated code list', () => {
  assert.equal(buildAddOption({ registered: true }), '27');
  assert.equal(buildAddOption({ registered: true, returnReceipt: true, personalDelivery: true }), '27,28,29');
  assert.equal(buildAddOption({ registeredDropIn: true }), '30');
  assert.equal(buildAddOption({}), '');
  assert.equal(buildAddOption({ extraCodes: [42] }), '42');
});

test('colour printing and GoGreen reach the addoption field', () => {
  assert.equal(buildAddOption({ colorPrint: true }), '33');
  assert.equal(buildAddOption({ goGreen: true }), '44');
  assert.equal(buildAddOption({ registered: true, colorPrint: true, goGreen: true }), '27,33,44');
});

test('duplex is the default and only simplex writes the control field', () => {
  assert.equal(resolveControl(undefined, undefined), undefined);
  assert.equal(resolveControl(true, undefined), undefined);
  assert.equal(resolveControl(false, undefined), CONTROL_NO_DUPLEX);
  assert.equal(resolveControl(undefined, 'SOMETHING'), 'SOMETHING');
  assert.throws(() => resolveControl(false, 'SOMETHING'), /either duplex or the raw control field/i);
});

test('the combination rules of the handbook are enforced', () => {
  assert.throws(() => buildAddOption({ returnReceipt: true }), /only allowed together with registered/i);
  assert.throws(() => buildAddOption({ personalDelivery: true }), /only allowed together with registered/i);
  assert.throws(() => buildAddOption({ registered: true, registeredDropIn: true }), /cannot be combined/i);
  assert.throws(() => buildAddOption({ extraCodes: [31] }), /cashOnDelivery block/i);
});

test('cash on delivery adds code 31 and validates the bank details', () => {
  assert.equal(buildAddOption({ registered: true }, cashOnDelivery), '27,31');
  assert.throws(() => validateCashOnDelivery({ ...cashOnDelivery, bankCode: '123' }), /exactly 8 digits/i);
  assert.throws(() => validateCashOnDelivery({ ...cashOnDelivery, bankAccountId: '123' }), /6 to 10 digits/i);
  assert.throws(() => validateCashOnDelivery({ ...cashOnDelivery, amount: '49.90' }), /XXXX,XX/);
  assert.throws(() => validateCashOnDelivery({ ...cashOnDelivery, amount: '2,00' }), /between 3,00 and 1600,00/);
  assert.throws(() => validateCashOnDelivery({ ...cashOnDelivery, name: '' }), /1 to 27 characters/i);
});

test('destination codes are normalised and checked', () => {
  assert.equal(normalizeDestination('de'), 'DE');
  assert.equal(normalizeDestination(''), undefined);
  assert.throws(() => normalizeDestination('DEU'), /two letter ISO/i);
});

test('letters need a destination, faxes need a number', () => {
  assert.throws(() => validateOrderOptions({ action: ACTIONS.letter }), /destination country is mandatory/i);
  assert.throws(() => validateOrderOptions({ action: ACTIONS.fax }), /fax number is required/i);
  assert.throws(() => validateOrderOptions({ action: ACTIONS.fax, fax: '089 123' }), /international format/i);
  assert.throws(
    () => validateOrderOptions({ action: ACTIONS.fax, fax: '+49 89 72448483', addOption: '27' }),
    /only allowed for letter orders/i,
  );
  validateOrderOptions({ action: ACTIONS.letterAndFax, fax: '+49 89 72448483', destination: 'DE' });
});

test('the text order carries the address, subject and message blocks', () => {
  const xml = buildTextOrderXml({
    action: ACTIONS.letter,
    destination: 'DE',
    location: '3',
    addOption: '27',
    transaction: 'INV-4711',
    address: 'Erika Mustermann\nMusterstr. 28\nD-81237 Musterstadt',
    subject: 'Widerspruch & Frist',
    message: 'Sehr geehrte Frau Mustermann,\n\nvielen Dank.',
  });
  assert.match(xml, /<order type="text">/);
  assert.match(xml, /<action>1<\/action>/);
  assert.match(xml, /<location>3<\/location>/);
  assert.match(xml, /<destination>DE<\/destination>/);
  assert.match(xml, /<addoption>27<\/addoption>/);
  assert.match(xml, /<transaction>INV-4711<\/transaction>/);
  assert.match(xml, /<subject>Widerspruch &amp; Frist<\/subject>/);
  assert.match(xml, /Musterstr\. 28/);
  assert.match(xml, /vielen Dank\./);
  for (const name of ['action', 'transaction', 'control', 'fax', 'location', 'destination', 'addoption', 'returnaddress']) {
    assert.match(xml, new RegExp(`<${name}>`), `option ${name} is always present`);
  }
});

test('empty text orders are refused before they cost a round trip', () => {
  assert.throws(
    () => buildTextOrderXml({ action: ACTIONS.letter, destination: 'DE', address: '', message: 'x' }),
    /address must not be empty/i,
  );
  assert.throws(
    () => buildTextOrderXml({ action: ACTIONS.letter, destination: 'DE', address: 'x', message: '  ' }),
    /text must not be empty/i,
  );
});

test('the upload order has no text block and the cancel and info commands are minimal', () => {
  const upload = buildUploadOrderXml({ action: ACTIONS.letter, destination: 'AT' });
  assert.match(upload, /<order type="upload">/);
  assert.doesNotMatch(upload, /<text>/);

  assert.match(buildCancelOrderXml(' 12345 '), /<order type="cancel">\s*<id>12345<\/id>/);
  assert.throws(() => buildCancelOrderXml(''), /order id is required/i);
  assert.match(buildAccountInfoXml(), /<account:info type="all" \/>/);
});

test('the signature order embeds the notification fields', () => {
  const xml = buildUploadOrderXml({
    action: ACTIONS.invoiceSignature,
    signatureNotification: {
      sender: 'billing@example.com',
      recipient: 'customer@example.com',
      subject: 'Invoice',
      body: 'Attached',
      filename: 'invoice.pdf',
    },
  });
  assert.match(xml, /<action>4<\/action>/);
  assert.match(xml, /<sender>billing@example\.com<\/sender>/);
  assert.match(xml, /<recipient>customer@example\.com<\/recipient>/);
  assert.match(xml, /<filename>invoice\.pdf<\/filename>/);
});

test('the cash on delivery block matches the wiretransfer structure', () => {
  const xml = buildUploadOrderXml({ action: ACTIONS.letter, destination: 'DE', addOption: '31', cashOnDelivery });
  assert.match(xml, /<wiretransfer>/);
  assert.match(xml, /<bankaccountid>1234567<\/bankaccountid>/);
  assert.match(xml, /<blz>70050000<\/blz>/);
  assert.match(xml, /<amount>49,90<\/amount>/);
});
