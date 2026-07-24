/* Author: Fabian Bitter (fabian@bitter.de) */

import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_ENDPOINT, loadConfig, type PixelLetterConfig } from '../src/pixelletter/config.js';
import { ACTIONS } from '../src/pixelletter/orders.js';
import { planOrder } from '../src/server/dispatch.js';

const config: PixelLetterConfig = {
  email: 'user@example.com',
  password: 'secret',
  endpoint: DEFAULT_ENDPOINT,
  acceptTerms: true,
  waiveWithdrawalRight: true,
  forceTestMode: false,
  timeoutMs: 5000,
};

test('a file path plans an upload order, text plans a text order', () => {
  const upload = planOrder({ files: ['/tmp/letter.pdf'], destination: 'DE' }, ACTIONS.letter, config);
  assert.equal(upload.kind, 'upload');
  assert.match(upload.command, /<order type="upload">/);

  const text = planOrder(
    { address: ['Erika Mustermann', 'Musterstr. 28', 'D-81237 Musterstadt'], text: 'Hallo', destination: 'DE' },
    ACTIONS.letter,
    config,
  );
  assert.equal(text.kind, 'text');
  assert.match(text.command, /Musterstr\. 28/);
  assert.match(text.command, /<address>\s*Erika Mustermann/);
});

test('mixing documents and text, or sending nothing, is refused', () => {
  assert.throws(
    () => planOrder({ files: ['/tmp/a.pdf'], text: 'Hallo', destination: 'DE' }, ACTIONS.letter, config),
    /not both/i,
  );
  assert.throws(() => planOrder({ destination: 'DE' }, ACTIONS.letter, config), /Nothing to send/i);
  assert.throws(() => planOrder({ text: 'Hallo', destination: 'DE' }, ACTIONS.letter, config), /recipient address is required/i);
});

test('defaults from the environment fill in location and destination', () => {
  const withDefaults: PixelLetterConfig = { ...config, defaultLocation: '3', defaultDestination: 'AT' };
  const plan = planOrder({ files: ['/tmp/a.pdf'] }, ACTIONS.letter, withDefaults);
  assert.equal(plan.options.location, '3');
  assert.equal(plan.options.destination, 'AT');
  assert.match(plan.command, /<location>3<\/location>/);

  const explicit = planOrder({ files: ['/tmp/a.pdf'], location: '1', destination: 'ch' }, ACTIONS.letter, withDefaults);
  assert.equal(explicit.options.location, '1');
  assert.equal(explicit.options.destination, 'CH');
});

test('registered mail reaches the addoption field, a fax order rejects it', () => {
  const plan = planOrder({ files: ['/tmp/a.pdf'], destination: 'DE', registered: true, returnReceipt: true }, ACTIONS.letter, config);
  assert.equal(plan.options.addOption, '27,28');
  assert.match(plan.command, /<addoption>27,28<\/addoption>/);

  assert.throws(
    () => planOrder({ files: ['/tmp/a.pdf'], fax: '+49 89 72448483', registered: true }, ACTIONS.fax, config),
    /only allowed for letter orders/i,
  );
});

test('print options are letter only and single sided writes NODUPLEX', () => {
  const plan = planOrder(
    { files: ['/tmp/a.pdf'], destination: 'DE', colorPrint: true, goGreen: true, duplex: false },
    ACTIONS.letter,
    config,
  );
  assert.equal(plan.options.addOption, '33,44');
  assert.equal(plan.options.control, 'NODUPLEX');
  assert.match(plan.command, /<control>NODUPLEX<\/control>/);

  const duplex = planOrder({ files: ['/tmp/a.pdf'], destination: 'DE', duplex: true }, ACTIONS.letter, config);
  assert.equal(duplex.options.control, undefined);
  assert.match(duplex.command, /<control><\/control>/);

  assert.throws(
    () => planOrder({ files: ['/tmp/a.pdf'], fax: '+49 89 72448483', duplex: false }, ACTIONS.fax, config),
    /only applies to letters/i,
  );
  assert.throws(
    () => planOrder({ files: ['/tmp/a.pdf'], fax: '+49 89 72448483', colorPrint: true }, ACTIONS.fax, config),
    /only allowed for letter orders/i,
  );
});

test('a letter without a destination is stopped before the request', () => {
  assert.throws(() => planOrder({ files: ['/tmp/a.pdf'] }, ACTIONS.letter, config), /destination country is mandatory/i);
});

test('the configuration is read from the environment and validated', () => {
  const loaded = loadConfig({
    PIXELLETTER_EMAIL: ' user@example.com ',
    PIXELLETTER_PASSWORD: 'secret',
    PIXELLETTER_DEFAULT_LOCATION: '2',
    PIXELLETTER_DEFAULT_DESTINATION: 'at',
    PIXELLETTER_FORCE_TEST_MODE: 'true',
  } as NodeJS.ProcessEnv);
  assert.equal(loaded.email, 'user@example.com');
  assert.equal(loaded.endpoint, DEFAULT_ENDPOINT);
  assert.equal(loaded.defaultLocation, '2');
  assert.equal(loaded.defaultDestination, 'AT');
  assert.equal(loaded.forceTestMode, true);
  assert.equal(loaded.waiveWithdrawalRight, true);

  assert.throws(() => loadConfig({ PIXELLETTER_PASSWORD: 'x' } as NodeJS.ProcessEnv), /PIXELLETTER_EMAIL/);
  assert.throws(() => loadConfig({ PIXELLETTER_EMAIL: 'a@b.de' } as NodeJS.ProcessEnv), /PIXELLETTER_PASSWORD/);
  assert.throws(
    () => loadConfig({ PIXELLETTER_EMAIL: 'a@b.de', PIXELLETTER_PASSWORD: 'x', PIXELLETTER_ACCEPT_TERMS: 'false' } as NodeJS.ProcessEnv),
    /terms and conditions/i,
  );
  assert.throws(
    () => loadConfig({ PIXELLETTER_EMAIL: 'a@b.de', PIXELLETTER_PASSWORD: 'x', PIXELLETTER_DEFAULT_LOCATION: '9' } as NodeJS.ProcessEnv),
    /1 \(Munich\)/,
  );
});
