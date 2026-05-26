import * as FileSystem from 'expo-file-system/legacy';
import type { ExtractedReceipt } from './types';

// Receipt extraction now goes through our own Cloudflare Worker (workers/
// extract/) instead of calling Anthropic directly from the app. The Worker
// holds the Anthropic API key as a server-side secret so it never ships in
// the app bundle. See workers/extract/README.md for deploy instructions.

const EXTRACT_URL = (process.env.EXPO_PUBLIC_EXTRACT_URL ?? '').trim();
const APP_TOKEN = (process.env.EXPO_PUBLIC_APP_TOKEN ?? '').trim();

export class ExtractNotConfiguredError extends Error {
  constructor() {
    super(
      'Receipt-extraction backend is not configured. Set EXPO_PUBLIC_EXTRACT_URL and EXPO_PUBLIC_APP_TOKEN.',
    );
  }
}

function detectMediaType(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'heic':
    case 'heif':
      return 'image/heic';
    default:
      return 'image/jpeg';
  }
}

export async function extractReceipt(
  imageUri: string,
  categories: string[],
): Promise<ExtractedReceipt> {
  if (!EXTRACT_URL || !APP_TOKEN) throw new ExtractNotConfiguredError();

  const imageBase64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const mediaType = detectMediaType(imageUri);

  const resp = await fetch(`${EXTRACT_URL.replace(/\/$/, '')}/extract`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-app-token': APP_TOKEN,
    },
    body: JSON.stringify({ imageBase64, mediaType, categories }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Extract backend ${resp.status}: ${text.slice(0, 200)}`);
  }

  const parsed = (await resp.json()) as ExtractedReceipt;
  if (!parsed.currency) parsed.currency = 'USD';
  return parsed;
}

export function claudeConfigured(): boolean {
  return Boolean(EXTRACT_URL && APP_TOKEN);
}
