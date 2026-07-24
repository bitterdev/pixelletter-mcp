/* Author: Fabian Bitter (fabian@bitter.de) */

import {
  buildCashOnDeliveryXml,
  buildSignatureNotificationXml,
  type CashOnDelivery,
  type SignatureNotification,
} from './options.js';
import { escapeXml, tag } from './xml.js';

/** Action values of the interface, documented in the HTTPS and e-mail handbooks. */
export const ACTIONS = {
  letter: '1',
  fax: '2',
  letterAndFax: '3',
  invoiceSignature: '4',
} as const;

export type Action = (typeof ACTIONS)[keyof typeof ACTIONS];

/** Dispatch centres, the location field. Munich is the default of the API. */
export const LOCATIONS = {
  '1': 'Munich, Germany',
  '2': 'Hausleiten near Vienna, Austria',
  '3': 'Hamburg, Germany',
} as const;

export type Location = keyof typeof LOCATIONS;

/**
 * PixelLetter prints double sided by default and the control field switches that
 * off. The value is not printed in the handbooks, it comes from the
 * hudora/pyPostal client, which sends it in production.
 */
export const CONTROL_NO_DUPLEX = 'NODUPLEX';

/**
 * Turns the duplex flag into the control value. A raw control value always wins,
 * but the two cannot be combined, because the field carries a single token.
 */
export function resolveControl(duplex: boolean | undefined, control: string | undefined): string | undefined {
  const raw = control?.trim();
  if (raw && duplex !== undefined) {
    throw new Error('Use either duplex or the raw control field, they both write the same field of the interface.');
  }
  if (raw) return raw;
  if (duplex === false) return CONTROL_NO_DUPLEX;
  return undefined;
}

export interface OrderOptions {
  action: Action;
  transaction?: string;
  control?: string;
  fax?: string;
  location?: Location;
  destination?: string;
  addOption?: string;
  returnAddress?: string;
  signatureNotification?: SignatureNotification;
  cashOnDelivery?: CashOnDelivery;
}

export interface TextOrder extends OrderOptions {
  address: string;
  subject?: string;
  message: string;
}

const FAX_NUMBER = /^\+[0-9][0-9\s\-()/.]{4,}$/;

export function normalizeDestination(destination: string | undefined): string | undefined {
  const trimmed = destination?.trim();
  if (!trimmed) return undefined;
  if (!/^[A-Za-z]{2}$/.test(trimmed)) {
    throw new Error(`destination has to be a two letter ISO country code, got "${destination}".`);
  }
  return trimmed.toUpperCase();
}

export function sendsLetter(action: Action): boolean {
  return action === ACTIONS.letter || action === ACTIONS.letterAndFax;
}

export function sendsFax(action: Action): boolean {
  return action === ACTIONS.fax || action === ACTIONS.letterAndFax;
}

/**
 * Checks the rules the handbook states up front, so a wrong order never costs a
 * round trip: the destination country is mandatory for letters, a fax number is
 * mandatory for fax orders, and additional services are letter only.
 */
export function validateOrderOptions(options: OrderOptions): void {
  if (sendsFax(options.action)) {
    if (!options.fax) throw new Error('A fax number is required for fax orders (error 018).');
    if (!FAX_NUMBER.test(options.fax)) {
      throw new Error(`The fax number has to be in international format, for example "+49 89 72448483", got "${options.fax}".`);
    }
  }
  if (sendsLetter(options.action)) {
    if (!options.destination) {
      throw new Error('The destination country is mandatory for letters, use the two letter ISO code (error 025).');
    }
  } else if (options.addOption) {
    throw new Error('Additional services are only allowed for letter orders, they are ignored for pure fax orders.');
  }
  if (options.location && !(options.location in LOCATIONS)) {
    throw new Error('location has to be 1 (Munich), 2 (Hausleiten) or 3 (Hamburg).');
  }
}

/**
 * Emits the options block. The reference PHP class always writes the whole set
 * of tags, empty ones included, so this does the same.
 */
function buildOptionsXml(options: OrderOptions): string {
  const extra = [
    options.signatureNotification ? buildSignatureNotificationXml(options.signatureNotification) : '',
    options.cashOnDelivery ? buildCashOnDeliveryXml(options.cashOnDelivery) : '',
  ].join('');
  return `    <options>
      ${tag('action', options.action)}
      ${tag('transaction', options.transaction ?? '')}
      ${tag('control', options.control ?? '')}
      ${tag('fax', options.fax ?? '')}
      ${tag('location', options.location ?? '')}
      ${tag('destination', options.destination ?? '')}
      ${tag('addoption', options.addOption ?? '')}
      ${tag('returnaddress', options.returnAddress ?? '')}${extra}
    </options>`;
}

/** Order that lets PixelLetter typeset the letter from plain text. */
export function buildTextOrderXml(order: TextOrder): string {
  validateOrderOptions(order);
  if (!order.address.trim()) throw new Error('The recipient address must not be empty (error 015).');
  if (!order.message.trim()) throw new Error('The letter text must not be empty (error 016).');
  return `<command>
  <order type="text">
${buildOptionsXml(order)}
    <text>
      <address>
${escapeXml(order.address)}
      </address>
      ${tag('subject', order.subject ?? '')}
      <message>
${escapeXml(order.message)}
      </message>
    </text>
  </order>
</command>`;
}

/** Order that sends already laid out files. The files travel as uploadfileN. */
export function buildUploadOrderXml(options: OrderOptions): string {
  validateOrderOptions(options);
  return `<command>
  <order type="upload">
${buildOptionsXml(options)}
  </order>
</command>`;
}

/** Cancels a submitted order by its PixelLetter order id. */
export function buildCancelOrderXml(orderId: string): string {
  if (!orderId.trim()) throw new Error('An order id is required.');
  return `<command>
  <order type="cancel">
    ${tag('id', orderId.trim())}
  </order>
</command>`;
}

/** Asks for the stored customer data and the current credit. */
export function buildAccountInfoXml(): string {
  return `<command>
  <info>
    <account:info type="all" />
  </info>
</command>`;
}
