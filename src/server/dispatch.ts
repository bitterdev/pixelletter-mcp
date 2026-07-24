/* Author: Fabian Bitter (fabian@bitter.de) */

import type { PixelLetterConfig } from '../pixelletter/config.js';
import type { InlineFile } from '../pixelletter/files.js';
import { buildAddOption, validateCashOnDelivery, type CashOnDelivery } from '../pixelletter/options.js';
import {
  buildTextOrderXml,
  buildUploadOrderXml,
  normalizeDestination,
  resolveControl,
  sendsLetter,
  type Action,
  type Location,
  type OrderOptions,
} from '../pixelletter/orders.js';

export interface DispatchInput {
  files?: string[];
  inlineFiles?: InlineFile[];
  address?: string[];
  subject?: string;
  text?: string;
  fax?: string;
  location?: Location;
  destination?: string;
  transaction?: string;
  control?: string;
  returnAddress?: string;
  registered?: boolean;
  returnReceipt?: boolean;
  personalDelivery?: boolean;
  registeredDropIn?: boolean;
  colorPrint?: boolean;
  goGreen?: boolean;
  duplex?: boolean;
  additionalServiceCodes?: number[];
  cashOnDelivery?: CashOnDelivery;
}

export interface OrderPlan {
  kind: 'text' | 'upload';
  command: string;
  options: OrderOptions;
}

/**
 * Turns tool input into one concrete order: file uploads become an upload order,
 * plain text becomes a text order that PixelLetter typesets. Defaults from the
 * environment fill in what the call leaves open.
 */
export function planOrder(input: DispatchInput, action: Action, config: PixelLetterConfig): OrderPlan {
  const hasFiles = (input.files?.length ?? 0) > 0 || (input.inlineFiles?.length ?? 0) > 0;
  const hasText = Boolean(input.text?.trim());

  if (hasFiles && hasText) {
    throw new Error('Send either documents or letter text, not both. One order carries one content type.');
  }
  if (!hasFiles && !hasText) {
    throw new Error('Nothing to send. Pass files, inlineFiles or text.');
  }

  if (input.cashOnDelivery) validateCashOnDelivery(input.cashOnDelivery);
  const addOption = buildAddOption(
    {
      registered: input.registered,
      returnReceipt: input.returnReceipt,
      personalDelivery: input.personalDelivery,
      registeredDropIn: input.registeredDropIn,
      colorPrint: input.colorPrint,
      goGreen: input.goGreen,
      extraCodes: input.additionalServiceCodes,
    },
    input.cashOnDelivery,
  );
  if (input.duplex !== undefined && !sendsLetter(action)) {
    throw new Error('Duplex printing only applies to letters, a fax has no print sides.');
  }

  const destination = normalizeDestination(input.destination) ?? (sendsLetter(action) ? config.defaultDestination : undefined);
  const options: OrderOptions = {
    action,
    transaction: input.transaction,
    control: resolveControl(input.duplex, input.control),
    fax: input.fax,
    location: input.location ?? config.defaultLocation,
    destination,
    addOption: addOption || undefined,
    returnAddress: input.returnAddress,
    cashOnDelivery: input.cashOnDelivery,
  };

  if (hasFiles) return { kind: 'upload', command: buildUploadOrderXml(options), options };

  const address = (input.address ?? []).map((line) => line.trim()).filter((line) => line.length > 0);
  if (address.length === 0) {
    throw new Error('A recipient address is required for text orders, one line per array entry, country included.');
  }
  return {
    kind: 'text',
    command: buildTextOrderXml({
      ...options,
      address: address.join('\n'),
      subject: input.subject,
      message: input.text ?? '',
    }),
    options,
  };
}
