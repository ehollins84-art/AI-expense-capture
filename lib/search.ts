import type { Expense, Project } from './types';

export type SearchField =
  | 'title'
  | 'notes'
  | 'category'
  | 'amount'
  | 'date'
  | 'project';

export type SearchMatch = {
  expense: Expense;
  score: number;
  field: SearchField;
  snippet?: string;
};

export type SearchFilters = {
  projectId: string | null;
  year: number | null;
  category: string | null;
};

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

function parseQueryNumber(q: string): number | null {
  const cleaned = q.replace(/[$,\s]/g, '');
  if (!/^\d{2,}(\.\d+)?$/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

type DateProbe = {
  year?: number;
  month?: number;
};

function parseQueryDate(q: string): DateProbe | null {
  const trimmed = q.trim();

  if (/^\d{4}$/.test(trimmed)) {
    return { year: parseInt(trimmed, 10) };
  }

  const ym = trimmed.match(/^(\d{4})-(\d{1,2})$/);
  if (ym) {
    return { year: parseInt(ym[1], 10), month: parseInt(ym[2], 10) - 1 };
  }

  const monthYear = trimmed.match(/^([a-z]+)\s+(\d{4})$/i);
  if (monthYear) {
    const monthIdx = MONTHS.findIndex((m) =>
      m.startsWith(monthYear[1].toLowerCase()),
    );
    if (monthIdx >= 0) {
      return { year: parseInt(monthYear[2], 10), month: monthIdx };
    }
  }

  const monthAlone = MONTHS.findIndex(
    (m) => m === trimmed.toLowerCase() || m.slice(0, 3) === trimmed.toLowerCase(),
  );
  if (monthAlone >= 0) {
    return { month: monthAlone };
  }

  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slash) {
    const probe: DateProbe = { month: parseInt(slash[1], 10) - 1 };
    if (slash[3]) {
      let y = parseInt(slash[3], 10);
      if (y < 100) y += 2000;
      probe.year = y;
    }
    return probe;
  }

  return null;
}

function dateMatches(expenseDate: string, probe: DateProbe): boolean {
  const d = new Date(expenseDate);
  if (probe.year !== undefined && d.getFullYear() !== probe.year) return false;
  if (probe.month !== undefined && d.getMonth() !== probe.month) return false;
  return true;
}

function snippetAround(text: string, q: string): string | undefined {
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return undefined;
  const start = Math.max(0, idx - 24);
  const end = Math.min(text.length, idx + q.length + 24);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end) + suffix;
}

export function searchExpenses(
  expenses: Expense[],
  projects: Project[],
  query: string,
  filters: SearchFilters,
): SearchMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const projectById = new Map(projects.map((p) => [p.id, p]));

  const filtered = expenses.filter((e) => {
    if (filters.projectId && e.projectId !== filters.projectId) return false;
    if (filters.year && new Date(e.date).getFullYear() !== filters.year)
      return false;
    if (filters.category && e.category !== filters.category) return false;
    return true;
  });

  const queryNum = parseQueryNumber(q);
  const dateProbe = parseQueryDate(q);

  const matches: SearchMatch[] = [];

  for (const e of filtered) {
    const title = e.title.toLowerCase();
    const notes = (e.notes ?? '').toLowerCase();
    const category = e.category.toLowerCase();
    const projectName = (projectById.get(e.projectId)?.name ?? '').toLowerCase();

    let score = 0;
    let field: SearchField = 'title';
    let snippet: string | undefined;

    if (title.startsWith(q)) {
      score = 100;
      field = 'title';
    } else if (title.includes(q)) {
      score = 70;
      field = 'title';
    }

    if (projectName.includes(q) && 50 > score) {
      score = 50;
      field = 'project';
    }

    if (category === q && 45 > score) {
      score = 45;
      field = 'category';
    } else if (category.includes(q) && 40 > score) {
      score = 40;
      field = 'category';
    }

    if (queryNum !== null) {
      const delta = Math.abs(e.amount - queryNum);
      if (delta < 0.01 && 40 > score) {
        score = 40;
        field = 'amount';
      } else if (queryNum > 0 && delta / queryNum <= 0.05 && 25 > score) {
        score = 25;
        field = 'amount';
      }
    }

    if (dateProbe && dateMatches(e.date, dateProbe) && 35 > score) {
      score = 35;
      field = 'date';
    }

    if (notes.includes(q) && 20 > score) {
      score = 20;
      field = 'notes';
      snippet = snippetAround(e.notes ?? '', q);
    }

    if (score > 0) {
      matches.push({ expense: e, score, field, snippet });
    }
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.expense.date < b.expense.date ? 1 : -1;
  });

  return matches.slice(0, 200);
}

export function highlightSubstring(
  text: string,
  query: string,
): Array<{ text: string; matched: boolean }> {
  const q = query.trim().toLowerCase();
  if (!q) return [{ text, matched: false }];

  const lower = text.toLowerCase();
  const parts: Array<{ text: string; matched: boolean }> = [];
  let cursor = 0;
  while (cursor < text.length) {
    const idx = lower.indexOf(q, cursor);
    if (idx === -1) {
      parts.push({ text: text.slice(cursor), matched: false });
      break;
    }
    if (idx > cursor) {
      parts.push({ text: text.slice(cursor, idx), matched: false });
    }
    parts.push({ text: text.slice(idx, idx + q.length), matched: true });
    cursor = idx + q.length;
  }
  return parts;
}
