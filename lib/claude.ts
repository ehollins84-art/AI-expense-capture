import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import type { ExtractedReceipt } from './types';

const API_KEY =
  process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ??
  (Constants.expoConfig?.extra?.anthropicApiKey as string | undefined);

const MODEL =
  process.env.EXPO_PUBLIC_ANTHROPIC_MODEL ?? 'claude-opus-4-7';

const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description:
        'Concise title in the form "Merchant - Content summary", e.g. "Home Depot - Painting Supplies".',
    },
    date: {
      type: 'string',
      description: 'Transaction date as YYYY-MM-DD. If unclear, use today.',
    },
    category: {
      type: 'string',
      description: 'One of the provided categories — match exactly.',
    },
    amount: {
      type: 'number',
      description: 'Total amount paid as a decimal number, no currency symbol.',
    },
    currency: {
      type: 'string',
      description: 'ISO currency code, e.g. USD. Default to USD if unclear.',
    },
    merchant: {
      type: 'string',
      description: 'Merchant name as printed on the receipt.',
    },
  },
  required: ['title', 'date', 'category', 'amount', 'currency'],
  additionalProperties: false,
} as const;

export class ClaudeNotConfiguredError extends Error {
  constructor() {
    super(
      'EXPO_PUBLIC_ANTHROPIC_API_KEY is not set. Add it to your .env and restart the dev server.',
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
  if (!API_KEY) throw new ClaudeNotConfiguredError();

  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const mediaType = detectMediaType(imageUri);
  const today = new Date().toISOString().slice(0, 10);

  const systemPrompt = [
    'You extract structured expense data from receipt photos for tax tracking.',
    'Be precise. Use the receipt date when visible; otherwise use today.',
    'Pick the single best category from the provided list — match the exact string.',
    `Today's date is ${today}.`,
    `Allowed categories: ${categories.join(', ')}.`,
  ].join(' ');

  const body = {
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    output_config: {
      format: {
        type: 'json_schema',
        schema: RECEIPT_SCHEMA,
      },
    },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64,
            },
          },
          {
            type: 'text',
            text: 'Extract the receipt details. Return JSON matching the schema.',
          },
        ],
      },
    ],
  };

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Claude API error ${resp.status}: ${text}`);
  }

  const data = (await resp.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  const textBlock = data.content.find((b) => b.type === 'text');
  if (!textBlock?.text) {
    throw new Error('Claude returned no text content.');
  }
  let parsed: ExtractedReceipt;
  try {
    parsed = JSON.parse(textBlock.text) as ExtractedReceipt;
  } catch {
    throw new Error(`Claude returned non-JSON: ${textBlock.text.slice(0, 200)}`);
  }
  if (!parsed.currency) parsed.currency = 'USD';
  return parsed;
}

export function claudeConfigured(): boolean {
  return Boolean(API_KEY);
}
