/* Author: Fabian Bitter (fabian@bitter.de) */

import assert from 'node:assert/strict';
import test from 'node:test';
import { PixelLetterClient, type FetchLike } from '../src/pixelletter/client.js';
import { DEFAULT_ENDPOINT, type PixelLetterConfig } from '../src/pixelletter/config.js';
import { PixelLetterError } from '../src/pixelletter/errors.js';
import { resolveUploads } from '../src/pixelletter/files.js';
import { buildUploadOrderXml } from '../src/pixelletter/orders.js';

const config: PixelLetterConfig = {
  email: 'user@example.com',
  password: 'secret',
  endpoint: DEFAULT_ENDPOINT,
  acceptTerms: true,
  waiveWithdrawalRight: true,
  forceTestMode: false,
  timeoutMs: 5000,
};

const successBody = `<?xml version="1.0" encoding="UTF-8"?>
<pixelletter version="1.3"><response><result code="100"><msg>Auftrag erfolgreich übermittelt</msg></result><transaction>T-1</transaction></response></pixelletter>`;

interface Call {
  url: string;
  form: FormData;
}

/** Captures the request instead of hitting the live interface. */
function stubFetch(body: string, status = 200): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, form: init.body as FormData });
    return new Response(body, { status, statusText: status === 200 ? 'OK' : 'Error' });
  };
  return { fetch: fetchImpl, calls };
}

const readStub = async (filePath: string) => new Uint8Array(Buffer.from(`content of ${filePath}`));

test('an order posts the xml field to the documented endpoint', async () => {
  const { fetch, calls } = stubFetch(successBody);
  const client = new PixelLetterClient(config, fetch);
  const result = await client.submitOrder(buildUploadOrderXml({ action: '1', destination: 'DE' }), { testMode: true });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'https://www.pixelletter.de/xml/index.php');
  const xml = calls[0]?.form.get('xml');
  assert.equal(typeof xml, 'string');
  assert.match(xml as string, /<email>user@example\.com<\/email>/);
  assert.match(xml as string, /<testmodus>true<\/testmodus>/);
  assert.match(xml as string, /<order type="upload">/);
  assert.equal(result.code, '100');
  assert.equal(result.transaction, 'T-1');
  assert.equal(result.testMode, true);
});

test('documents travel as uploadfile0, uploadfile1 and keep their file names', async () => {
  const { fetch, calls } = stubFetch(successBody);
  const client = new PixelLetterClient(config, fetch);
  const files = await resolveUploads({ paths: ['/tmp/letter.pdf', '/tmp/appendix.pdf'] }, readStub);
  await client.submitOrder(buildUploadOrderXml({ action: '1', destination: 'DE' }), { testMode: true, files });

  const form = calls[0]?.form as FormData;
  const first = form.get('uploadfile0');
  const second = form.get('uploadfile1');
  assert.ok(first instanceof File, 'first document is sent as a file part');
  assert.equal((first as File).name, 'letter.pdf');
  assert.equal((first as File).type, 'application/pdf');
  assert.equal((second as File).name, 'appendix.pdf');
  assert.equal(form.get('uploadfile2'), null);
});

test('a non-100 code becomes a PixelLetterError with the hint of the code', async () => {
  const { fetch } = stubFetch(
    '<pixelletter><response><result code="021"><msg>Ihr Guthaben reicht nicht aus.</msg></result></response></pixelletter>',
  );
  const client = new PixelLetterClient(config, fetch);
  await assert.rejects(
    () => client.submitOrder(buildUploadOrderXml({ action: '1', destination: 'DE' }), { testMode: true }),
    (error: unknown) => {
      assert.ok(error instanceof PixelLetterError);
      assert.equal(error.code, '021');
      assert.match(error.message, /balance is too low/i);
      assert.match(error.serverMessage, /Guthaben/);
      return true;
    },
  );
});

test('an HTTP error is reported instead of being parsed', async () => {
  const { fetch } = stubFetch('<html>error</html>', 500);
  const client = new PixelLetterClient(config, fetch);
  await assert.rejects(
    () => client.submitOrder(buildUploadOrderXml({ action: '1', destination: 'DE' }), { testMode: true }),
    /HTTP 500/,
  );
});

test('forced test mode overrides a live call', async () => {
  const { fetch, calls } = stubFetch(successBody);
  const client = new PixelLetterClient({ ...config, forceTestMode: true }, fetch);
  const result = await client.submitOrder(buildUploadOrderXml({ action: '1', destination: 'DE' }), { testMode: false });
  assert.match(calls[0]?.form.get('xml') as string, /<testmodus>true<\/testmodus>/);
  assert.equal(result.testMode, true);
});

test('a live order is sent as a live order', async () => {
  const { fetch, calls } = stubFetch(successBody);
  const client = new PixelLetterClient(config, fetch);
  await client.submitOrder(buildUploadOrderXml({ action: '1', destination: 'DE' }), { testMode: false });
  assert.match(calls[0]?.form.get('xml') as string, /<testmodus>false<\/testmodus>/);
});

test('the account info request asks for the account block and reads latin1', async () => {
  const latin1 = Buffer.concat([
    Buffer.from('<?xml version="1.0" encoding="iso-8859-1"?><pixelletter><costumer:id>1</costumer:id><costumer:data><lastname>M', 'latin1'),
    Buffer.from([0xfc]),
    Buffer.from('ller</lastname></costumer:data><costumer:credit currency="EUR">27.20</costumer:credit></pixelletter>', 'latin1'),
  ]);
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, form: init.body as FormData });
    return new Response(latin1, { status: 200 });
  };
  const info = await new PixelLetterClient(config, fetchImpl).getAccountInfo();
  assert.match(calls[0]?.form.get('xml') as string, /<account:info type="all" \/>/);
  assert.equal(info.credit, 27.2);
  assert.equal(info.currency, 'EUR');
  assert.equal(info.customer.lastname, 'Müller');
});

test('uploads are checked against the documented file types and limits', async () => {
  await assert.rejects(() => resolveUploads({ paths: ['/tmp/letter.txt'] }, readStub), /Unsupported file type/i);
  await assert.rejects(
    () => resolveUploads({ inline: [{ filename: 'empty.pdf', base64: '' }] }),
    /empty or not valid base64/i,
  );
  const inline = await resolveUploads({ inline: [{ filename: 'x.pdf', base64: Buffer.from('%PDF-1.4').toString('base64') }] });
  assert.equal(inline[0]?.filename, 'x.pdf');
  assert.equal(inline[0]?.contentType, 'application/pdf');
});
