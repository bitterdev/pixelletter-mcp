/* Author: Fabian Bitter (fabian@bitter.de) */

export const DEFAULT_ENDPOINT = 'https://www.pixelletter.de/xml/index.php';
export const DEFAULT_TIMEOUT_MS = 120_000;

/** Error 020 of the interface: a single upload may not exceed 50 MB. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export interface PixelLetterConfig {
  email: string;
  password: string;
  endpoint: string;
  acceptTerms: boolean;
  waiveWithdrawalRight: boolean;
  forceTestMode: boolean;
  defaultLocation?: '1' | '2' | '3';
  defaultDestination?: string;
  timeoutMs: number;
}

function readFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'ja', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'nein', 'off'].includes(normalized)) return false;
  throw new Error(`Expected a boolean value, got "${value}".`);
}

function readLocation(value: string | undefined): '1' | '2' | '3' | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed !== '1' && trimmed !== '2' && trimmed !== '3') {
    throw new Error('PIXELLETTER_DEFAULT_LOCATION must be 1 (Munich), 2 (Hausleiten) or 3 (Hamburg).');
  }
  return trimmed;
}

function readDestination(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!/^[A-Za-z]{2}$/.test(trimmed)) {
    throw new Error('PIXELLETTER_DEFAULT_DESTINATION must be a two letter ISO country code, for example DE.');
  }
  return trimmed.toUpperCase();
}

function readTimeout(value: string | undefined): number {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('PIXELLETTER_TIMEOUT_MS must be a positive number of milliseconds.');
  }
  return parsed;
}

/**
 * Reads the whole configuration from the environment. Nothing is ever read from
 * disk or from a credential store, so the server stays portable.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): PixelLetterConfig {
  const email = env.PIXELLETTER_EMAIL?.trim();
  const password = env.PIXELLETTER_PASSWORD ?? '';
  if (!email) throw new Error('PIXELLETTER_EMAIL is not set.');
  if (!password) throw new Error('PIXELLETTER_PASSWORD is not set.');

  const acceptTerms = readFlag(env.PIXELLETTER_ACCEPT_TERMS, true);
  if (!acceptTerms) {
    throw new Error(
      'PIXELLETTER_ACCEPT_TERMS is false. PixelLetter rejects every order that does not accept the terms and conditions (error 013).',
    );
  }

  return {
    email,
    password,
    endpoint: env.PIXELLETTER_ENDPOINT?.trim() || DEFAULT_ENDPOINT,
    acceptTerms,
    waiveWithdrawalRight: readFlag(env.PIXELLETTER_WAIVE_WITHDRAWAL_RIGHT, true),
    forceTestMode: readFlag(env.PIXELLETTER_FORCE_TEST_MODE, false),
    defaultLocation: readLocation(env.PIXELLETTER_DEFAULT_LOCATION),
    defaultDestination: readDestination(env.PIXELLETTER_DEFAULT_DESTINATION),
    timeoutMs: readTimeout(env.PIXELLETTER_TIMEOUT_MS),
  };
}
