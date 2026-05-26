// Cloudflare Worker that proxies receipt-extraction calls to Anthropic.
//
// The mobile app sends image bytes + a list of allowed categories. The Worker
// holds the Anthropic API key as a Cloudflare secret (never shipped in the
// app bundle) and forwards the request to the Anthropic Messages API. A
// shared secret token guards the endpoint so casual reverse-engineering of
// the IPA can't drain the API balance.

export interface Env {
  ANTHROPIC_API_KEY: string;
  APP_SHARED_SECRET: string;
  ANTHROPIC_MODEL?: string;
}

type ExtractRequest = {
  imageBase64: string;
  mediaType: string;
  categories: string[];
};

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

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-app-token',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...(init.headers ?? {}),
    },
  });
}

function plain(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain', ...CORS_HEADERS },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(req.url);
    if (url.pathname === '/health') {
      return plain('ok', 200);
    }

    if (req.method !== 'POST' || url.pathname !== '/extract') {
      return plain('Not found', 404);
    }

    const token = req.headers.get('x-app-token');
    if (!token || token !== env.APP_SHARED_SECRET) {
      return plain('Unauthorized', 401);
    }

    let body: ExtractRequest;
    try {
      body = (await req.json()) as ExtractRequest;
    } catch {
      return plain('Invalid JSON body', 400);
    }

    if (
      typeof body.imageBase64 !== 'string' ||
      typeof body.mediaType !== 'string' ||
      !Array.isArray(body.categories)
    ) {
      return plain('Missing or invalid fields', 400);
    }

    if (body.imageBase64.length > 10 * 1024 * 1024) {
      return plain('Image too large', 413);
    }

    const today = new Date().toISOString().slice(0, 10);
    const systemPrompt = [
      'You extract structured expense data from receipt photos for tax tracking.',
      'Be precise. Use the receipt date when visible; otherwise use today.',
      'Pick the single best category from the provided list — match the exact string.',
      `Today's date is ${today}.`,
      `Allowed categories: ${body.categories.join(', ')}.`,
    ].join(' ');

    const anthropicBody = {
      model: env.ANTHROPIC_MODEL ?? 'claude-opus-4-7',
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
                media_type: body.mediaType,
                data: body.imageBase64,
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

    let upstream: Response;
    try {
      upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(anthropicBody),
      });
    } catch (err) {
      return plain(`Upstream fetch failed: ${(err as Error).message}`, 502);
    }

    if (!upstream.ok) {
      const text = await upstream.text();
      return plain(`Anthropic ${upstream.status}: ${text}`, 502);
    }

    const data = (await upstream.json()) as {
      content: Array<{ type: string; text?: string }>;
    };
    const textBlock = data.content.find((b) => b.type === 'text');
    if (!textBlock?.text) {
      return plain('Empty Anthropic response', 502);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      return plain('Anthropic returned non-JSON', 502);
    }

    return json(parsed);
  },
};
