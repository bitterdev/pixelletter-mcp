/* Author: Fabian Bitter (fabian@bitter.de) */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MAX_UPLOAD_BYTES } from './config.js';

/**
 * File types the handbook accepts for uploads. Error 053 shows that PixelLetter
 * can restrict this to PDF at any time, so PDF is the safe choice.
 */
export const SUPPORTED_UPLOAD_EXTENSIONS = ['pdf', 'doc', 'xls', 'ppt', 'rtf', 'wpd', 'psd'] as const;

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint',
  rtf: 'application/rtf',
  wpd: 'application/wordperfect',
  psd: 'image/vnd.adobe.photoshop',
};

export interface UploadFile {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
  source?: string;
}

export interface InlineFile {
  filename: string;
  base64: string;
}

export interface ResolveUploadsInput {
  paths?: string[];
  inline?: InlineFile[];
}

export type ReadFileFn = (filePath: string) => Promise<Uint8Array>;

function contentTypeFor(filename: string): string {
  const extension = path.extname(filename).replace('.', '').toLowerCase();
  if (!(SUPPORTED_UPLOAD_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new Error(
      `Unsupported file type ".${extension}" for "${filename}". Allowed: ${SUPPORTED_UPLOAD_EXTENSIONS.join(', ')} (error 010).`,
    );
  }
  return CONTENT_TYPES[extension] ?? 'application/octet-stream';
}

const defaultReadFile: ReadFileFn = async (filePath) => new Uint8Array(await readFile(filePath));

/**
 * Loads the documents that go with an upload order. Several files are merged into
 * one letter by PixelLetter, in the order they are submitted.
 */
export async function resolveUploads(
  input: ResolveUploadsInput,
  read: ReadFileFn = defaultReadFile,
): Promise<UploadFile[]> {
  const files: UploadFile[] = [];

  for (const filePath of input.paths ?? []) {
    const absolute = path.resolve(filePath);
    const filename = path.basename(absolute);
    const contentType = contentTypeFor(filename);
    let bytes: Uint8Array;
    try {
      bytes = await read(absolute);
    } catch {
      throw new Error(`File not found or not readable: ${absolute}`);
    }
    files.push({ filename, contentType, bytes, source: absolute });
  }

  for (const entry of input.inline ?? []) {
    const filename = path.basename(entry.filename);
    const contentType = contentTypeFor(filename);
    const cleaned = entry.base64.includes(',') ? entry.base64.slice(entry.base64.indexOf(',') + 1) : entry.base64;
    const bytes = new Uint8Array(Buffer.from(cleaned, 'base64'));
    if (bytes.byteLength === 0) throw new Error(`Inline file "${filename}" is empty or not valid base64.`);
    files.push({ filename, contentType, bytes });
  }

  for (const file of files) {
    if (file.bytes.byteLength > MAX_UPLOAD_BYTES) {
      throw new Error(`"${file.filename}" is larger than the 50 MB limit of the interface (error 020).`);
    }
  }
  return files;
}
