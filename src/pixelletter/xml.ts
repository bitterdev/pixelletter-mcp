/* Author: Fabian Bitter (fabian@bitter.de) */

/**
 * The PixelLetter interface speaks a small, fixed XML dialect, so the payloads are
 * built and read by hand instead of pulling in a parser. The reference PHP class
 * escapes &, < and > only, and the responses are flat enough to match with
 * expressions.
 */

export function escapeXml(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function tag(name: string, value: string | number | undefined | null): string {
  return `<${name}>${escapeXml(value)}</${name}>`;
}

export interface AuthFields {
  email: string;
  password: string;
  acceptTerms: boolean;
  waiveWithdrawalRight: boolean;
  testMode: boolean;
}

/**
 * Builds the full request document. The auth block carries the credentials, the
 * command block carries the order, exactly as documented in the HTTPS handbook.
 */
export function buildRequestXml(auth: AuthFields, command: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<pixelletter version="1.3">
  <auth>
    ${tag('email', auth.email)}
    ${tag('password', auth.password)}
    ${tag('agb', auth.acceptTerms ? 'ja' : 'nein')}
    ${tag('widerrufsverzicht', auth.waiveWithdrawalRight ? 'ja' : 'nein')}
    ${tag('testmodus', auth.testMode ? 'true' : 'false')}
    <ref></ref>
  </auth>
  ${command}
</pixelletter>`;
}

export interface OrderResponse {
  code: string;
  message: string;
  transaction?: string;
  raw: string;
}

function firstMatch(xml: string, expression: RegExp): string | undefined {
  const match = expression.exec(xml);
  return match?.[1] === undefined ? undefined : unescapeXml(match[1].trim());
}

/**
 * Reads the standard response envelope:
 * <response><result code="100"><msg>...</msg></result><transaction>...</transaction></response>
 */
export function parseOrderResponse(xml: string): OrderResponse {
  const code = firstMatch(xml, /<result[^>]*\bcode\s*=\s*"([^"]*)"/i);
  if (code === undefined) {
    throw new Error(`PixelLetter returned an unexpected response: ${xml.slice(0, 500)}`);
  }
  return {
    code,
    message: firstMatch(xml, /<msg>([\s\S]*?)<\/msg>/i) ?? '',
    transaction: firstMatch(xml, /<transaction>([\s\S]*?)<\/transaction>/i) || undefined,
    raw: xml,
  };
}

export interface AccountInfo {
  customerId?: string;
  credit?: number;
  currency?: string;
  customer: Record<string, string>;
  raw: string;
}

/**
 * Reads the account info document. PixelLetter spells the customer tags
 * "costumer:*" and returns the balance as an attributed element.
 */
export function parseAccountInfo(xml: string): AccountInfo {
  const creditMatch = /<costumer:credit(?:\s+currency\s*=\s*"([^"]*)")?\s*>([\s\S]*?)<\/costumer:credit>/i.exec(xml);
  const dataMatch = /<costumer:data>([\s\S]*?)<\/costumer:data>/i.exec(xml);
  const customer: Record<string, string> = {};
  if (dataMatch?.[1]) {
    const body = dataMatch[1];
    const element = /<([A-Za-z0-9:_.-]+)\s*\/>|<([A-Za-z0-9:_.-]+)>([\s\S]*?)<\/\2>/g;
    let entry: RegExpExecArray | null = element.exec(body);
    while (entry !== null) {
      const name = entry[1] ?? entry[2];
      if (name) customer[name] = unescapeXml((entry[3] ?? '').trim());
      entry = element.exec(body);
    }
  }
  const rawCredit = creditMatch?.[2]?.trim();
  const credit = rawCredit ? Number(rawCredit.replace(',', '.')) : undefined;
  return {
    customerId: firstMatch(xml, /<costumer:id>([\s\S]*?)<\/costumer:id>/i),
    credit: credit !== undefined && Number.isFinite(credit) ? credit : undefined,
    currency: creditMatch?.[1],
    customer,
    raw: xml,
  };
}

/**
 * PixelLetter answers with UTF-8 for orders and with ISO-8859-1 for the account
 * info, so the declared encoding decides how the bytes are read.
 */
export function decodeResponseBody(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const head = new TextDecoder('latin1').decode(view.subarray(0, 200)).toLowerCase();
  const declared = /encoding\s*=\s*"([^"]+)"/.exec(head)?.[1];
  const isLatin1 = declared !== undefined && /iso-8859-1|latin1|windows-1252/.test(declared);
  return new TextDecoder(isLatin1 ? 'latin1' : 'utf-8').decode(view);
}
