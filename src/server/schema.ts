/* Author: Fabian Bitter (fabian@bitter.de) */

import { z } from 'zod';

export const testModeField = z
  .boolean()
  .describe(
    'Test mode. true runs the order exactly like a real one but PixelLetter never prints, never sends and never charges. false really sends the letter. Always required, so nothing goes out by accident.',
  );

export const inlineFileSchema = z.object({
  filename: z.string().describe('File name including the extension, for example "invoice.pdf". The extension decides the file type.'),
  base64: z.string().describe('File content as base64, with or without a data URL prefix.'),
});

export const fileShape = {
  files: z
    .array(z.string())
    .optional()
    .describe(
      'Absolute paths of the documents to send, for example the PDF written by pdf-letter-mcp. Several files are converted and merged into one letter, in this order. Allowed: .pdf, .doc, .xls, .ppt, .rtf, .wpd, .psd, and PDF is the only type that always works.',
    ),
  inlineFiles: z.array(inlineFileSchema).optional().describe('Documents passed as base64 instead of a path.'),
};

export const cashOnDeliverySchema = z
  .object({
    name: z.string().describe('Payee, 1 to 27 characters.'),
    bankAccountId: z.string().describe('Account number of the payee, 6 to 10 digits.'),
    bankCode: z.string().describe('German bank code (BLZ) of the payee, exactly 8 digits.'),
    bankName: z.string().describe('Bank of the payee, 1 to 27 characters.'),
    amount: z.string().describe('Amount in the format XXXX,XX, between 3,00 and 1600,00 EUR.'),
    reasonForPayment1: z.string().optional().describe('First line of the payment reference, up to 27 characters.'),
    reasonForPayment2: z.string().optional().describe('Second line of the payment reference, up to 27 characters.'),
  })
  .describe('Bank details for cash on delivery. Setting this block adds additional service 31.');

/** Print options, letters only. A fax has neither print sides nor colour. */
export const printShape = {
  duplex: z
    .boolean()
    .optional()
    .describe(
      'Print on both sides (true, the default of PixelLetter) or on one side only (false, sent as control NODUPLEX). Letters only.',
    ),
  colorPrint: z
    .boolean()
    .optional()
    .describe(
      'Colour print instead of black and white (addoption 33). Letters only, and not available through every dispatch centre, see error 038.',
    ),
  goGreen: z.boolean().optional().describe('GoGreen, CO2 neutral postage (addoption 44). Letters only.'),
};

export const additionalServicesShape = {
  registered: z.boolean().optional().describe('Einschreiben, registered mail (code 27). Germany only.'),
  returnReceipt: z.boolean().optional().describe('Rückschein, return receipt (code 28). Only together with registered.'),
  personalDelivery: z
    .boolean()
    .optional()
    .describe('Eigenhändig, personal delivery (code 29). Only together with registered.'),
  registeredDropIn: z
    .boolean()
    .optional()
    .describe('Einschreiben Einwurf, drop-in registered mail (code 30). Cannot be combined with the other registered variants.'),
  additionalServiceCodes: z
    .array(z.number().int().positive())
    .optional()
    .describe(
      'Raw addoption codes for services PixelLetter documents elsewhere or agrees per account. Only use numbers PixelLetter gave you.',
    ),
  cashOnDelivery: cashOnDeliverySchema.optional(),
};

export const dispatchShape = {
  location: z
    .enum(['1', '2', '3'])
    .optional()
    .describe('Dispatch centre: 1 = Munich (DE), 2 = Hausleiten near Vienna (AT), 3 = Hamburg (DE). Default of the API is 1.'),
  destination: z
    .string()
    .optional()
    .describe('Destination country as a two letter ISO code, for example DE, AT, CH. Mandatory for letters, a wrong code leads to wrong postage.'),
  transaction: z
    .string()
    .optional()
    .describe('Your own transaction id or short note. PixelLetter returns it with the response.'),
  control: z
    .string()
    .optional()
    .describe(
      'Raw value for the control field of the interface. The only value in public use is NODUPLEX, which the duplex parameter sets for you, so only reach for this when PixelLetter gave you another token.',
    ),
  returnAddress: z
    .string()
    .optional()
    .describe('Raw value for the returnaddress field of the interface. Undocumented in the public handbooks.'),
};

export const textLetterShape = {
  address: z
    .array(z.string())
    .optional()
    .describe('Recipient address, one line per array entry, country included. PixelLetter typesets it. Required when no file is sent.'),
  subject: z.string().optional().describe('Subject of the letter.'),
  text: z
    .string()
    .optional()
    .describe(
      'Letter text as plain text, no HTML. Long texts run onto more pages automatically, your sender address is added by PixelLetter. "%Unterschrift%" on its own line inserts the signature stored in your PixelLetter account.',
    ),
};
