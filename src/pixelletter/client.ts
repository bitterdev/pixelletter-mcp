/* Author: Fabian Bitter (fabian@bitter.de) */

import type { PixelLetterConfig } from './config.js';
import { PixelLetterError, SUCCESS_CODE } from './errors.js';
import type { UploadFile } from './files.js';
import { buildAccountInfoXml } from './orders.js';
import {
  buildRequestXml,
  decodeResponseBody,
  parseAccountInfo,
  parseOrderResponse,
  type AccountInfo,
  type OrderResponse,
} from './xml.js';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface SubmitOptions {
  /** Test mode runs the order for real but never prints and never charges. */
  testMode: boolean;
  files?: UploadFile[];
}

export interface SubmitResult extends OrderResponse {
  testMode: boolean;
  endpoint: string;
}

/**
 * Talks to the PixelLetter HTTPS interface. Every call is a multipart POST to a
 * single endpoint: the field "xml" carries the order, the fields "uploadfile0",
 * "uploadfile1" and so on carry the documents.
 */
export class PixelLetterClient {
  private readonly config: PixelLetterConfig;
  private readonly fetchImpl: FetchLike;

  constructor(config: PixelLetterConfig, fetchImpl: FetchLike = globalThis.fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  private async post(command: string, options: SubmitOptions): Promise<string> {
    const testMode = this.config.forceTestMode || options.testMode;
    const xml = buildRequestXml(
      {
        email: this.config.email,
        password: this.config.password,
        acceptTerms: this.config.acceptTerms,
        waiveWithdrawalRight: this.config.waiveWithdrawalRight,
        testMode,
      },
      command,
    );

    const form = new FormData();
    form.append('xml', xml);
    (options.files ?? []).forEach((file, index) => {
      const blob = new Blob([file.bytes], { type: file.contentType });
      form.append(`uploadfile${index}`, blob, file.filename);
    });

    const response = await this.fetchImpl(this.config.endpoint, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`PixelLetter replied with HTTP ${response.status} ${response.statusText}.`);
    }
    return decodeResponseBody(await response.arrayBuffer());
  }

  /** Submits an order and turns every code other than 100 into an error. */
  async submitOrder(command: string, options: SubmitOptions): Promise<SubmitResult> {
    const body = await this.post(command, options);
    const parsed = parseOrderResponse(body);
    if (parsed.code !== SUCCESS_CODE) {
      throw new PixelLetterError(parsed.code, parsed.message, parsed.raw, parsed.transaction);
    }
    return { ...parsed, testMode: this.config.forceTestMode || options.testMode, endpoint: this.config.endpoint };
  }

  /** Reads the stored customer data and the current credit. */
  async getAccountInfo(): Promise<AccountInfo> {
    const body = await this.post(buildAccountInfoXml(), { testMode: false });
    if (/<result[^>]*\bcode\s*=/i.test(body)) {
      const parsed = parseOrderResponse(body);
      if (parsed.code !== SUCCESS_CODE) {
        throw new PixelLetterError(parsed.code, parsed.message, parsed.raw, parsed.transaction);
      }
    }
    return parseAccountInfo(body);
  }
}
