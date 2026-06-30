// Shared-projects API for the Manila Worker, backed by Cloudflare D1.
//
// A shared project lets two (or more) people add expenses to the same project
// and see the combined running total. Identity is the caller's Google account
// email, verified server-side from a Google access token — a client can never
// claim to be someone else. The static x-app-token (checked in index.ts before
// we get here) proves the request comes from the app; the Google token proves
// *who* is making it.

export interface ShareEnv {
  DB: D1Database;
}

// --- Shapes returned to the client (mirror lib/share.ts) ----------------------

type SharedExpense = {
  id: string;
  title: string;
  date: string;
  category: string;
  amount: number;
  currency: string;
  notes?: string;
  addedByEmail: string;
  createdAt: string;
  updatedAt: string;
};

type SharedProject = {
  id: string;
  name: string;
  scheme: string;
  categories: string[];
  ownerEmail: string;
  members: string[];
  createdAt: string;
  expenses: SharedExpense[];
};

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-app-token, x-google-token',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function fail(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain', ...CORS_HEADERS },
  });
}

// --- Identity -----------------------------------------------------------------

// Verify the caller's Google access token and return their (lower-cased) email.
// Returns null if the token is missing/invalid. We hit Google's userinfo
// endpoint so we never trust a client-supplied email.
async function verifyEmail(req: Request): Promise<string | null> {
  const token = req.headers.get('x-google-token');
  if (!token) return null;
  try {
    const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { email?: string; email_verified?: boolean };
    if (!data.email) return null;
    return data.email.trim().toLowerCase();
  } catch {
    return null;
  }
}

function isEmail(s: unknown): s is string {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function newId(): string {
  return crypto.randomUUID();
}

// --- DB assembly --------------------------------------------------------------

// Load a full SharedProject (meta + members + live expenses) for the client.
async function loadShare(
  db: D1Database,
  shareId: string,
): Promise<SharedProject | null> {
  const meta = await db
    .prepare('SELECT * FROM shares WHERE id = ?')
    .bind(shareId)
    .first<{
      id: string;
      name: string;
      scheme: string;
      categories: string;
      owner_email: string;
      created_at: string;
    }>();
  if (!meta) return null;

  const memberRows = await db
    .prepare('SELECT email FROM share_members WHERE share_id = ? ORDER BY added_at')
    .bind(shareId)
    .all<{ email: string }>();

  const expenseRows = await db
    .prepare(
      'SELECT * FROM share_expenses WHERE share_id = ? AND deleted = 0 ORDER BY created_at',
    )
    .bind(shareId)
    .all<{
      id: string;
      title: string;
      date: string;
      category: string;
      amount: number;
      currency: string;
      notes: string | null;
      added_by_email: string;
      created_at: string;
      updated_at: string;
    }>();

  let categories: string[] = [];
  try {
    categories = JSON.parse(meta.categories);
    if (!Array.isArray(categories)) categories = [];
  } catch {
    categories = [];
  }

  return {
    id: meta.id,
    name: meta.name,
    scheme: meta.scheme,
    categories,
    ownerEmail: meta.owner_email,
    members: (memberRows.results ?? []).map((r) => r.email),
    createdAt: meta.created_at,
    expenses: (expenseRows.results ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      date: r.date,
      category: r.category,
      amount: r.amount,
      currency: r.currency,
      notes: r.notes ?? undefined,
      addedByEmail: r.added_by_email,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  };
}

async function isMember(
  db: D1Database,
  shareId: string,
  email: string,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM share_members WHERE share_id = ? AND email = ?')
    .bind(shareId, email)
    .first();
  return !!row;
}

// --- Route handlers -----------------------------------------------------------

async function handleCreate(
  db: D1Database,
  email: string,
  body: any,
): Promise<Response> {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const scheme = typeof body?.scheme === 'string' ? body.scheme : 'custom';
  const categories: string[] = Array.isArray(body?.categories)
    ? body.categories.filter((c: unknown) => typeof c === 'string')
    : [];
  if (!name) return fail('A project name is required.', 400);

  // The client may supply the id so a project keeps its identity when it
  // becomes shared. Reject collisions so we never adopt someone else's share.
  let id: string;
  if (typeof body?.id === 'string' && body.id) {
    const clash = await db.prepare('SELECT 1 FROM shares WHERE id = ?').bind(body.id).first();
    if (clash) return fail('That project is already shared.', 409);
    id = body.id;
  } else {
    id = newId();
  }
  const now = new Date().toISOString();
  await db
    .prepare(
      'INSERT INTO shares (id, name, scheme, categories, owner_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(id, name, scheme, JSON.stringify(categories), email, now, now)
    .run();
  await db
    .prepare(
      'INSERT INTO share_members (share_id, email, role, added_at) VALUES (?, ?, ?, ?)',
    )
    .bind(id, email, 'owner', now)
    .run();

  const share = await loadShare(db, id);
  return json({ share });
}

async function handleInvite(
  db: D1Database,
  email: string,
  body: any,
): Promise<Response> {
  const shareId = typeof body?.shareId === 'string' ? body.shareId : '';
  const inviteeRaw = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!shareId) return fail('Missing shareId.', 400);
  if (!isEmail(inviteeRaw)) return fail('That doesn\'t look like an email address.', 400);
  const invitee = inviteeRaw.toLowerCase();

  const meta = await db
    .prepare('SELECT owner_email FROM shares WHERE id = ?')
    .bind(shareId)
    .first<{ owner_email: string }>();
  if (!meta) return fail('That shared project no longer exists.', 404);
  // Only the owner can invite, to keep the member list under one person's control.
  if (meta.owner_email !== email) {
    return fail('Only the project owner can invite people.', 403);
  }

  const now = new Date().toISOString();
  // Idempotent: re-inviting an existing member is a no-op.
  await db
    .prepare(
      'INSERT OR IGNORE INTO share_members (share_id, email, role, added_at) VALUES (?, ?, ?, ?)',
    )
    .bind(shareId, invitee, 'member', now)
    .run();

  const share = await loadShare(db, shareId);
  return json({ share });
}

async function handlePull(db: D1Database, email: string): Promise<Response> {
  const idRows = await db
    .prepare('SELECT share_id FROM share_members WHERE email = ?')
    .bind(email)
    .all<{ share_id: string }>();
  const ids = (idRows.results ?? []).map((r) => r.share_id);
  const shares: SharedProject[] = [];
  for (const id of ids) {
    const share = await loadShare(db, id);
    if (share) shares.push(share);
  }
  return json({ shares });
}

async function handlePush(
  db: D1Database,
  email: string,
  body: any,
): Promise<Response> {
  const shareId = typeof body?.shareId === 'string' ? body.shareId : '';
  const e = body?.expense;
  if (!shareId || !e || typeof e !== 'object') {
    return fail('Missing shareId or expense.', 400);
  }
  if (!(await isMember(db, shareId, email))) {
    return fail('You\'re not a member of that shared project.', 403);
  }

  const id = typeof e.id === 'string' && e.id ? e.id : newId();
  const now = new Date().toISOString();
  const deleted = e.deleted === true;

  const existing = await db
    .prepare('SELECT added_by_email FROM share_expenses WHERE id = ?')
    .bind(id)
    .first<{ added_by_email: string }>();

  if (existing) {
    // Author-only edits/deletes: you can change your own expenses, not others'.
    if (existing.added_by_email !== email) {
      return fail('Only the person who added an expense can change it.', 403);
    }
    if (deleted) {
      await db
        .prepare('UPDATE share_expenses SET deleted = 1, updated_at = ? WHERE id = ?')
        .bind(now, id)
        .run();
    } else {
      await db
        .prepare(
          'UPDATE share_expenses SET title = ?, date = ?, category = ?, amount = ?, currency = ?, notes = ?, updated_at = ? WHERE id = ?',
        )
        .bind(
          String(e.title ?? ''),
          String(e.date ?? ''),
          String(e.category ?? ''),
          Number(e.amount ?? 0),
          String(e.currency ?? 'USD'),
          e.notes ? String(e.notes) : null,
          now,
          id,
        )
        .run();
    }
  } else {
    if (deleted) return json({ expense: null });
    await db
      .prepare(
        'INSERT INTO share_expenses (id, share_id, title, date, category, amount, currency, notes, added_by_email, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
      )
      .bind(
        id,
        shareId,
        String(e.title ?? ''),
        String(e.date ?? ''),
        String(e.category ?? ''),
        Number(e.amount ?? 0),
        String(e.currency ?? 'USD'),
        e.notes ? String(e.notes) : null,
        email,
        typeof e.createdAt === 'string' ? e.createdAt : now,
        now,
      )
      .run();
  }
  await db.prepare('UPDATE shares SET updated_at = ? WHERE id = ?').bind(now, shareId).run();

  const row = await db
    .prepare('SELECT * FROM share_expenses WHERE id = ?')
    .bind(id)
    .first<any>();
  const expense: SharedExpense | null = row
    ? {
        id: row.id,
        title: row.title,
        date: row.date,
        category: row.category,
        amount: row.amount,
        currency: row.currency,
        notes: row.notes ?? undefined,
        addedByEmail: row.added_by_email,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;
  return json({ expense, deleted });
}

async function handleLeave(
  db: D1Database,
  email: string,
  body: any,
): Promise<Response> {
  const shareId = typeof body?.shareId === 'string' ? body.shareId : '';
  if (!shareId) return fail('Missing shareId.', 400);
  const meta = await db
    .prepare('SELECT owner_email FROM shares WHERE id = ?')
    .bind(shareId)
    .first<{ owner_email: string }>();
  if (!meta) return json({ ok: true }); // already gone

  if (meta.owner_email === email) {
    // The owner leaving tears the whole share down for everyone.
    await db.prepare('DELETE FROM share_expenses WHERE share_id = ?').bind(shareId).run();
    await db.prepare('DELETE FROM share_members WHERE share_id = ?').bind(shareId).run();
    await db.prepare('DELETE FROM shares WHERE id = ?').bind(shareId).run();
  } else {
    await db
      .prepare('DELETE FROM share_members WHERE share_id = ? AND email = ?')
      .bind(shareId, email)
      .run();
  }
  return json({ ok: true });
}

// --- Entry point --------------------------------------------------------------

// Called from index.ts for any POST under /shares/. Returns null if the path
// isn't a share route so the caller can fall through to its own 404.
export async function handleShareRequest(
  req: Request,
  env: ShareEnv,
  action: string,
): Promise<Response> {
  if (!env.DB) {
    return fail('Shared projects are not set up on this server (no database).', 503);
  }
  const email = await verifyEmail(req);
  if (!email) {
    return fail('Sign in with Google to use shared projects.', 401);
  }

  let body: any = {};
  if (req.headers.get('content-type')?.includes('application/json')) {
    try {
      body = await req.json();
    } catch {
      return fail('Invalid JSON body', 400);
    }
  }

  switch (action) {
    case 'create':
      return handleCreate(env.DB, email, body);
    case 'invite':
      return handleInvite(env.DB, email, body);
    case 'pull':
      return handlePull(env.DB, email);
    case 'push':
      return handlePush(env.DB, email, body);
    case 'leave':
      return handleLeave(env.DB, email, body);
    default:
      return fail('Not found', 404);
  }
}
