/* Author: Fabian Bitter (fabian@bitter.de) */

import { escapeXml } from './xml.js';

/**
 * Additional services are passed as a comma separated list of numbers in the
 * addoption field.
 *
 * Codes 27 to 30 are named in the HTTPS handbook and the e-mail handbook.
 * Code 31 comes from the reference PHP class, where it switches on the cash on
 * delivery block. Codes 33 and 44 are not printed in the handbooks: they come
 * from the hudora/pyPostal client, which has been sending real orders with them
 * for years. Error code 038 confirms that colour printing exists as a per order
 * service. Both are marked as such below and in the README.
 */
export const ADDITIONAL_SERVICE_CODES = {
  registered: 27,
  returnReceipt: 28,
  personalDelivery: 29,
  registeredDropIn: 30,
  cashOnDelivery: 31,
  colorPrint: 33,
  goGreen: 44,
} as const;

export const ADDITIONAL_SERVICES = [
  { code: 27, key: 'registered', label: 'Einschreiben, registered mail', source: 'HTTPS handbook' },
  { code: 28, key: 'returnReceipt', label: 'Rückschein, return receipt, only together with 27', source: 'HTTPS handbook' },
  { code: 29, key: 'personalDelivery', label: 'Eigenhändig, personal delivery, only together with 27', source: 'HTTPS handbook' },
  {
    code: 30,
    key: 'registeredDropIn',
    label: 'Einschreiben Einwurf, drop-in registered mail, not combinable with 27, 28, 29',
    source: 'HTTPS handbook',
  },
  {
    code: 31,
    key: 'cashOnDelivery',
    label: 'Nachnahme, cash on delivery, needs the cashOnDelivery block',
    source: 'reference PHP class 2.01',
  },
  { code: 33, key: 'colorPrint', label: 'Farbdruck, colour printing instead of black and white', source: 'hudora/pyPostal, error 038' },
  { code: 44, key: 'goGreen', label: 'GoGreen, CO2 neutral postage', source: 'hudora/pyPostal' },
] as const;

export interface AdditionalServiceInput {
  registered?: boolean;
  returnReceipt?: boolean;
  personalDelivery?: boolean;
  registeredDropIn?: boolean;
  colorPrint?: boolean;
  goGreen?: boolean;
  extraCodes?: number[];
}

export interface CashOnDelivery {
  name: string;
  bankAccountId: string;
  bankCode: string;
  bankName: string;
  amount: string;
  reasonForPayment1?: string;
  reasonForPayment2?: string;
}

/**
 * Turns the named services into the addoption string and enforces the
 * combination rules from the handbook: 28 and 29 need 27, and 30 stands alone.
 */
export function buildAddOption(input: AdditionalServiceInput, cashOnDelivery?: CashOnDelivery): string {
  const codes = new Set<number>();
  if (input.registered) codes.add(ADDITIONAL_SERVICE_CODES.registered);
  if (input.returnReceipt) codes.add(ADDITIONAL_SERVICE_CODES.returnReceipt);
  if (input.personalDelivery) codes.add(ADDITIONAL_SERVICE_CODES.personalDelivery);
  if (input.registeredDropIn) codes.add(ADDITIONAL_SERVICE_CODES.registeredDropIn);
  if (input.colorPrint) codes.add(ADDITIONAL_SERVICE_CODES.colorPrint);
  if (input.goGreen) codes.add(ADDITIONAL_SERVICE_CODES.goGreen);
  if (cashOnDelivery) codes.add(ADDITIONAL_SERVICE_CODES.cashOnDelivery);
  for (const code of input.extraCodes ?? []) {
    if (!Number.isInteger(code) || code <= 0) throw new Error(`Invalid additional service code: ${code}`);
    codes.add(code);
  }

  const has = (code: number) => codes.has(code);
  if ((has(28) || has(29)) && !has(27)) {
    throw new Error('Return receipt (28) and personal delivery (29) are only allowed together with registered mail (27).');
  }
  if (has(30) && (has(27) || has(28) || has(29))) {
    throw new Error('Drop-in registered mail (30) cannot be combined with the other registered mail variants.');
  }
  if (has(31) && !cashOnDelivery) {
    throw new Error('Cash on delivery (31) needs the cashOnDelivery block with the payee bank details.');
  }

  return [...codes].sort((a, b) => a - b).join(',');
}

const CASH_ON_DELIVERY_TEXT = /^[0-9A-ZÄÖÜß.,&\-/+*$% ]{1,27}$/i;

/**
 * Validates the cash on delivery block against the field rules behind the error
 * codes 030 to 037, so obvious mistakes never reach the API.
 */
export function validateCashOnDelivery(input: CashOnDelivery): void {
  if (!CASH_ON_DELIVERY_TEXT.test(input.name)) {
    throw new Error('cashOnDelivery.name: 1 to 27 characters, only 0-9 A-Z ÄÖÜß .,&-/+*$% and spaces (error 030).');
  }
  if (!CASH_ON_DELIVERY_TEXT.test(input.bankName)) {
    throw new Error('cashOnDelivery.bankName: 1 to 27 characters, only 0-9 A-Z ÄÖÜß .,&-/+*$% and spaces (error 031).');
  }
  if (input.reasonForPayment1 && !CASH_ON_DELIVERY_TEXT.test(input.reasonForPayment1)) {
    throw new Error('cashOnDelivery.reasonForPayment1: up to 27 allowed characters (error 032).');
  }
  if (input.reasonForPayment2 && !CASH_ON_DELIVERY_TEXT.test(input.reasonForPayment2)) {
    throw new Error('cashOnDelivery.reasonForPayment2: up to 27 allowed characters (error 033).');
  }
  if (!/^[0-9]{6,10}$/.test(input.bankAccountId)) {
    throw new Error('cashOnDelivery.bankAccountId: 6 to 10 digits (error 036).');
  }
  if (!/^[0-9]{8}$/.test(input.bankCode)) {
    throw new Error('cashOnDelivery.bankCode: exactly 8 digits (error 037).');
  }
  if (!/^[0-9]+,[0-9]{2}$/.test(input.amount)) {
    throw new Error('cashOnDelivery.amount: format XXXX,XX without a thousands separator (error 034).');
  }
  const amount = Number(input.amount.replace(',', '.'));
  if (amount < 3 || amount > 1600) {
    throw new Error('cashOnDelivery.amount: between 3,00 and 1600,00 EUR (error 035).');
  }
}

export function buildCashOnDeliveryXml(input: CashOnDelivery): string {
  validateCashOnDelivery(input);
  return `
      <wiretransfer>
        <recipient>
          <name>${escapeXml(input.name)}</name>
          <bankaccountid>${escapeXml(input.bankAccountId)}</bankaccountid>
          <blz>${escapeXml(input.bankCode)}</blz>
          <bankname>${escapeXml(input.bankName)}</bankname>
        </recipient>
        <reasonforpayment1>${escapeXml(input.reasonForPayment1 ?? '')}</reasonforpayment1>
        <reasonforpayment2>${escapeXml(input.reasonForPayment2 ?? '')}</reasonforpayment2>
        <amount>${escapeXml(input.amount)}</amount>
      </wiretransfer>`;
}

export interface SignatureNotification {
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  filename?: string;
}

export function buildSignatureNotificationXml(input: SignatureNotification): string {
  return `
      <sender>${escapeXml(input.sender)}</sender>
      <recipient>${escapeXml(input.recipient)}</recipient>
      <cc>${escapeXml(input.cc ?? '')}</cc>
      <bcc>${escapeXml(input.bcc ?? '')}</bcc>
      <subject>${escapeXml(input.subject)}</subject>
      <body>${escapeXml(input.body)}</body>
      <filename>${escapeXml(input.filename ?? '')}</filename>`;
}
