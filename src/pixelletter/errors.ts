/* Author: Fabian Bitter (fabian@bitter.de) */

/** Code 100 means the order was accepted, everything else is an error. */
export const SUCCESS_CODE = '100';

/**
 * English hints for the codes published at
 * https://www.pixelletter.de/docs/error_messages.php. PixelLetter extends the
 * list over time, so the German message from the response is always reported as
 * well and an unknown code simply has no hint.
 */
export const ERROR_HINTS: Record<string, string> = {
  '001': 'The file could not be generated. Try again.',
  '002': 'Unknown error. Try again.',
  '003': 'Unknown error. Try again.',
  '004': 'E-mail address or password is wrong.',
  '005': 'Unauthorised call.',
  '006': 'This order has already been placed.',
  '007': 'The account is blocked. Contact PixelLetter.',
  '008': 'No valid XML data was submitted.',
  '009': 'No order type was given. Use text or upload.',
  '010': 'Wrong file type. Uploads need one of the supported file extensions.',
  '011': 'Converting the document failed. Try another file format.',
  '012': 'The file could not be transferred.',
  '013': 'The terms and conditions have to be accepted with "ja".',
  '014': 'State whether you waive the right of withdrawal.',
  '015': 'No recipient address was given, or no file was attached.',
  '016': 'No letter text was given.',
  '017': 'Making use of the right of withdrawal delays the order by two weeks. Confirm the choice.',
  '018': 'Fax delivery was requested without a valid fax number.',
  '019': 'No action was given. Use 1 (letter), 2 (fax) or 3 (letter and fax).',
  '020': 'The file may not be larger than 50 MB.',
  '021': 'The account balance is too low. Top it up in the customer area.',
  '022': 'Invalid combination of additional services.',
  '023': 'The chosen additional service is currently not available.',
  '024': 'The chosen dispatch centre is currently not available.',
  '025': 'No or wrong destination country. The two letter ISO code is mandatory for letters.',
  '026': 'The chosen additional service is not available for that destination country.',
  '027': 'The chosen additional service needs Munich as the dispatch centre.',
  '028': 'The chosen additional service needs Hausleiten near Vienna as the dispatch centre.',
  '029': 'The chosen additional service is only available inside Europe.',
  '030': 'Invalid payee name for cash on delivery. 1 to 27 characters.',
  '031': 'Invalid bank name for cash on delivery. 1 to 27 characters.',
  '032': 'Invalid first line of the payment reference. Up to 27 characters.',
  '033': 'Invalid second line of the payment reference. 1 to 27 characters.',
  '034': 'Invalid cash on delivery amount. Use the format XXXX,XX without a thousands separator.',
  '035': 'Cash on delivery amount out of range. It has to be between 3,00 and 1600,00 EUR.',
  '036': 'Invalid account number for cash on delivery. 6 to 10 digits.',
  '037': 'Invalid bank code (BLZ) for cash on delivery. Exactly 8 digits.',
  '038': 'Colour printing is not available through the chosen dispatch centre. Pick another one.',
  '039': 'No sender e-mail address for the signature notification was given.',
  '040': 'The sender e-mail address for the signature notification is too long, 255 characters maximum.',
  '041': 'No recipient e-mail address for the signature notification was given.',
  '042': 'The recipient e-mail address for the signature notification is too long, 255 characters maximum.',
  '043': 'No e-mail subject for the signature notification was given.',
  '044': 'The e-mail subject for the signature notification is too long, 255 characters maximum.',
  '045': 'No e-mail body for the signature notification was given.',
  '046': 'Electronic signatures have to be enabled once, free of charge, in the customer area.',
  '047': 'The PDF file is encrypted. Upload an unencrypted PDF without editing restrictions.',
  '048': 'The transaction id has already been used.',
  '049': 'No file was submitted for the signature order.',
  '050': 'The PDF file has no pointer to its xref table.',
  '051': 'No upload template with that number exists.',
  '052': 'Type template was used without a template number.',
  '053': 'For technical reasons only PDF uploads are accepted at the moment.',
  '054': 'PGP decryption failed.',
  '055': 'The order could not be found.',
  '056': 'The numbering of the bulk orders is not consecutive.',
  '057': 'Bulk orders need the type value template.',
  '058': 'Invalid action for a bulk order, it has to be 5.',
  '059': 'The control tag is not allowed for bulk orders.',
  '060': 'The addoption tag is not allowed for bulk orders.',
  '061': 'Bulk orders always need location 1.',
  '062': 'Invalid destination country code.',
  '063': 'Invalid sender line number.',
  '064': 'Invalid gender.',
  '071': 'The order could not be written to the database.',
  '072': 'The photo has to be a JPG file.',
  '073': 'A postcard address may have six lines at most.',
  '074': 'The postcard text is too long.',
  '075': 'The photo may not be larger than 6 MB.',
  '076': 'No photo was submitted.',
  '089': 'General error while processing the PDF.',
  '091': 'The e-mail address of the account was unreachable and has been deactivated.',
  '092': 'The transaction limit set on the account has been reached.',
  '093': 'The PDF file is corrupt.',
  '095': 'The e-mail address of the account has not been confirmed yet.',
};

export class PixelLetterError extends Error {
  readonly code: string;
  readonly serverMessage: string;
  readonly transaction?: string;
  readonly raw: string;

  constructor(code: string, serverMessage: string, raw: string, transaction?: string) {
    const hint = ERROR_HINTS[code];
    super(`PixelLetter error ${code}: ${hint ?? (serverMessage || 'unknown error')}`);
    this.name = 'PixelLetterError';
    this.code = code;
    this.serverMessage = serverMessage;
    this.transaction = transaction;
    this.raw = raw;
  }
}
