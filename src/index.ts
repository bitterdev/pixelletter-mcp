#!/usr/bin/env node
/* Author: Fabian Bitter (fabian@bitter.de) */

import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { PixelLetterClient } from './pixelletter/client.js';
import { loadConfig, MAX_UPLOAD_BYTES, type PixelLetterConfig } from './pixelletter/config.js';
import { ERROR_HINTS, PixelLetterError } from './pixelletter/errors.js';
import { resolveUploads, SUPPORTED_UPLOAD_EXTENSIONS, type UploadFile } from './pixelletter/files.js';
import { ADDITIONAL_SERVICES } from './pixelletter/options.js';
import {
  ACTIONS,
  buildCancelOrderXml,
  buildUploadOrderXml,
  CONTROL_NO_DUPLEX,
  LOCATIONS,
} from './pixelletter/orders.js';
import { planOrder, type DispatchInput } from './server/dispatch.js';
import {
  additionalServicesShape,
  dispatchShape,
  fileShape,
  printShape,
  testModeField,
  textLetterShape,
} from './server/schema.js';

const packageVersion = ((): string => {
  try {
    const require = createRequire(import.meta.url);
    return (require('../../package.json') as { version: string }).version;
  } catch {
    return '0.0.0';
  }
})();

const server = new McpServer(
  { name: 'pixelletter-mcp', version: packageVersion },
  {
    instructions:
      'Sends physical letters and faxes through the PixelLetter HTTPS interface. Hand send_letter an absolute PDF path, for example the file written by pdf-letter-mcp, or plain text plus a recipient address, and PixelLetter prints, folds, franks and posts it. The recipient address has to be visible in the address window area of the PDF. Every sending tool needs an explicit testMode flag: true submits the order without printing, sending or charging, false really posts it. Credentials come from PIXELLETTER_EMAIL and PIXELLETTER_PASSWORD.',
  },
);

const toJson = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});

function toError(error: unknown) {
  if (error instanceof PixelLetterError) {
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              error: error.message,
              code: error.code,
              serverMessage: error.serverMessage,
              transaction: error.transaction,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  return {
    isError: true,
    content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
  };
}

let cached: { config: PixelLetterConfig; client: PixelLetterClient } | undefined;

/** Configuration is read on first use, so the server starts even without credentials. */
function getClient(): { config: PixelLetterConfig; client: PixelLetterClient } {
  if (!cached) {
    const config = loadConfig();
    cached = { config, client: new PixelLetterClient(config) };
  }
  return cached;
}

async function loadFiles(input: DispatchInput): Promise<UploadFile[]> {
  if (!input.files?.length && !input.inlineFiles?.length) return [];
  return resolveUploads({ paths: input.files, inline: input.inlineFiles });
}

const sendResultNote =
  'PixelLetter confirms the final result by e-mail a few hours later, including whether the recipient address fitted the address window.';

server.registerTool(
  'send_letter',
  {
    title: 'Send letter',
    description:
      'Sends a letter through PixelLetter, either as ready made documents (absolute file paths, PDF preferred) or as plain text plus a recipient address that PixelLetter typesets. Optionally faxes the same document as well. Returns the result code and the transaction id.',
    inputSchema: {
      testMode: testModeField,
      ...fileShape,
      ...textLetterShape,
      ...dispatchShape,
      ...printShape,
      ...additionalServicesShape,
      alsoSendFax: z
        .boolean()
        .optional()
        .describe('Send the same document as a fax too. Needs faxNumber. Additional services stay letter only.'),
      faxNumber: z
        .string()
        .optional()
        .describe('Fax number in international format, for example "+49 89 72448483". Only needed with alsoSendFax.'),
    },
  },
  async (input) => {
    try {
      const { client, config } = getClient();
      const dispatch: DispatchInput = { ...input, fax: input.alsoSendFax ? input.faxNumber : undefined };
      const action = input.alsoSendFax ? ACTIONS.letterAndFax : ACTIONS.letter;
      const plan = planOrder(dispatch, action, config);
      const files = await loadFiles(dispatch);
      const result = await client.submitOrder(plan.command, { testMode: input.testMode, files });
      return toJson({
        status: 'accepted',
        code: result.code,
        message: result.message,
        transaction: result.transaction,
        testMode: result.testMode,
        orderType: plan.kind,
        action,
        destination: plan.options.destination,
        location: plan.options.location ?? '1',
        additionalServices: plan.options.addOption ?? '',
        control: plan.options.control ?? '',
        duplex: input.duplex ?? true,
        files: files.map((file) => ({ filename: file.filename, bytes: file.bytes.byteLength })),
        note: sendResultNote,
      });
    } catch (error) {
      return toError(error);
    }
  },
);

server.registerTool(
  'send_fax',
  {
    title: 'Send fax',
    description:
      'Sends documents or plain text as a fax through PixelLetter, without posting a letter. Additional services such as registered mail do not apply to faxes.',
    inputSchema: {
      testMode: testModeField,
      faxNumber: z.string().describe('Fax number in international format, for example "+49 89 72448483".'),
      ...fileShape,
      ...textLetterShape,
      transaction: dispatchShape.transaction,
      control: dispatchShape.control,
      location: dispatchShape.location,
    },
  },
  async (input) => {
    try {
      const { client, config } = getClient();
      const dispatch: DispatchInput = { ...input, fax: input.faxNumber };
      const plan = planOrder(dispatch, ACTIONS.fax, config);
      const files = await loadFiles(dispatch);
      const result = await client.submitOrder(plan.command, { testMode: input.testMode, files });
      return toJson({
        status: 'accepted',
        code: result.code,
        message: result.message,
        transaction: result.transaction,
        testMode: result.testMode,
        orderType: plan.kind,
        action: ACTIONS.fax,
        faxNumber: input.faxNumber,
        files: files.map((file) => ({ filename: file.filename, bytes: file.bytes.byteLength })),
        note: sendResultNote,
      });
    } catch (error) {
      return toError(error);
    }
  },
);

server.registerTool(
  'get_account_info',
  {
    title: 'Get account info and balance',
    description:
      'Reads the stored customer data and the current credit of the PixelLetter account. Use it before sending to make sure the balance covers the order, error 021 means the credit is too low.',
    inputSchema: {},
  },
  async () => {
    try {
      const { client } = getClient();
      const info = await client.getAccountInfo();
      return toJson({
        customerId: info.customerId,
        credit: info.credit,
        currency: info.currency ?? 'EUR',
        paymentType: info.customer['payment:type'],
        customer: info.customer,
      });
    } catch (error) {
      return toError(error);
    }
  },
);

server.registerTool(
  'cancel_order',
  {
    title: 'Cancel order',
    description:
      'Cancels a submitted order by its PixelLetter order id, which is on the order confirmation e-mail. Only works while the order has not been printed yet, otherwise PixelLetter answers with error 055.',
    inputSchema: {
      orderId: z.string().describe('PixelLetter order id from the confirmation e-mail or the customer area.'),
    },
  },
  async (input) => {
    try {
      const { client } = getClient();
      const result = await client.submitOrder(buildCancelOrderXml(input.orderId), { testMode: false });
      return toJson({
        status: 'cancelled',
        orderId: input.orderId,
        code: result.code,
        message: result.message,
        transaction: result.transaction,
      });
    } catch (error) {
      return toError(error);
    }
  },
);

server.registerTool(
  'sign_invoice',
  {
    title: 'Sign invoice electronically',
    description:
      'Sends documents to the PixelLetter invoice signing service (action 4) and optionally mails the signed PDF to the invoice recipient. The account needs electronic signatures enabled once in the customer area, otherwise PixelLetter answers with error 046.',
    inputSchema: {
      testMode: testModeField.describe(
        'Test mode. true signs with an advanced signature only, which is not legally sufficient, and costs nothing. false creates the qualified signature.',
      ),
      ...fileShape,
      transaction: dispatchShape.transaction,
      notification: z
        .object({
          sender: z.string().describe('Sender address of the notification e-mail.'),
          recipient: z.string().describe('Recipient of the signed invoice.'),
          subject: z.string().describe('Subject of the notification e-mail.'),
          body: z.string().describe('Body of the notification e-mail, plain text or HTML.'),
          cc: z.string().optional(),
          bcc: z.string().optional(),
          filename: z
            .string()
            .optional()
            .describe('File name of the attached PDF. Defaults to the PixelLetter order number.'),
        })
        .optional()
        .describe('Leave this out and nothing is mailed to the invoice recipient, you only get the signed file yourself.'),
    },
  },
  async (input) => {
    try {
      const { client } = getClient();
      const files = await resolveUploads({ paths: input.files, inline: input.inlineFiles });
      if (files.length === 0) throw new Error('At least one document is required for a signature order (error 049).');
      const command = buildUploadOrderXml({
        action: ACTIONS.invoiceSignature,
        transaction: input.transaction,
        signatureNotification: input.notification,
      });
      const result = await client.submitOrder(command, { testMode: input.testMode, files });
      return toJson({
        status: 'accepted',
        code: result.code,
        message: result.message,
        transaction: result.transaction,
        testMode: result.testMode,
        files: files.map((file) => ({ filename: file.filename, bytes: file.bytes.byteLength })),
      });
    } catch (error) {
      return toError(error);
    }
  },
);

server.registerTool(
  'get_interface_reference',
  {
    title: 'Get interface reference',
    description:
      'Returns what the PixelLetter interface documents: action values, dispatch centres, additional service codes, allowed upload types, limits and the published error codes. Offline lookup, no API call.',
    inputSchema: {
      errorCode: z.string().optional().describe('Look up a single error code, for example "021".'),
    },
  },
  async (input) => {
    try {
      if (input.errorCode) {
        const code = input.errorCode.padStart(3, '0');
        return toJson({ code, hint: ERROR_HINTS[code] ?? 'Not in the published list, PixelLetter extends the codes over time.' });
      }
      const { config } = cached ?? { config: undefined };
      return toJson({
        endpoint: config?.endpoint ?? 'https://www.pixelletter.de/xml/index.php',
        transport: 'HTTPS POST, multipart, field "xml" plus uploadfile0, uploadfile1 and so on',
        actions: {
          '1': 'letter only',
          '2': 'fax only',
          '3': 'letter and fax',
          '4': 'invoice signature',
        },
        locations: LOCATIONS,
        additionalServices: ADDITIONAL_SERVICES,
        additionalServiceRules: [
          'Additional services are letter only, on a pure fax order they are rejected.',
          'Registered mail is a German product, error 026 rejects it for other destination countries.',
          'Codes 28 and 29 require 27, code 30 cannot be combined with 27, 28 or 29.',
        ],
        controlValues: {
          [CONTROL_NO_DUPLEX]: 'Print on one side only. Without it PixelLetter prints double sided.',
        },
        uploadExtensions: SUPPORTED_UPLOAD_EXTENSIONS,
        maxUploadBytes: MAX_UPLOAD_BYTES,
        successCode: '100',
        errorCodes: ERROR_HINTS,
        notDocumented: [
          'There is no endpoint that lists submitted orders, only cancel_order by id and get_account_info.',
          'Envelope format, postage class, cover sheets and reply envelopes are no fields of the interface. Letters go into a DIN C6/5 window envelope, the postage follows weight and destination.',
          'Premiumadress address correction (error 088) has to be set up by PixelLetter support for the account, there is no request field for it.',
          'Postcards, upload templates and bulk orders appear in the reference class and in the error codes, but the handbooks document neither their action value nor their fields, so they are left out.',
          'Codes 33 (colour) and 44 (GoGreen) plus the control value NODUPLEX are not printed in the handbooks. They come from the hudora/pyPostal client and are confirmed by error 038 for colour.',
        ],
      });
    } catch (error) {
      return toError(error);
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  process.stderr.write(`pixelletter-mcp failed to start: ${String(error)}\n`);
  process.exit(1);
});
