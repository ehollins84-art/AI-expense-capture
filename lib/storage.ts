import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import type { Expense, Iteration, Project } from './types';

const ROOT = FileSystem.documentDirectory + 'schedule-e-ai/';

export async function ensureDir(path: string) {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

function iterationDir(letter: string) {
  return `${ROOT}${letter}/`;
}

export function iterationRootPath(letter: string): string {
  return iterationDir(letter);
}

function projectDir(letter: string, projectId: string) {
  return `${iterationDir(letter)}${projectId}/`;
}

function projectsFile(letter: string) {
  return `${iterationDir(letter)}projects.json`;
}

function indexFile(letter: string) {
  return `${iterationDir(letter)}index.json`;
}

function yearDir(letter: string, projectId: string, year: number) {
  return `${projectDir(letter, projectId)}${year}/`;
}

function expenseFolderName(expense: Expense): string {
  const dateStr = expense.date.replaceAll('-', '.');
  const safeTitle = expense.title.replace(/[/\\:*?"<>|]/g, '').trim();
  return `${dateStr} ${safeTitle}`;
}

export function expenseFolderPath(letter: string, expense: Expense): string {
  const year = new Date(expense.date).getFullYear();
  return `${yearDir(letter, expense.projectId, year)}${expenseFolderName(expense)}/`;
}

export function newId(): string {
  return Crypto.randomUUID();
}

export async function listIterations(): Promise<string[]> {
  await ensureDir(ROOT);
  const entries = await FileSystem.readDirectoryAsync(ROOT);
  return entries.filter((e) => /^[A-Z]$/.test(e)).sort();
}

export async function nextIterationLetter(): Promise<string> {
  const existing = await listIterations();
  if (existing.length === 0) return 'A';
  const last = existing[existing.length - 1];
  return String.fromCharCode(last.charCodeAt(0) + 1);
}

export async function ensureIteration(letter: string): Promise<void> {
  await ensureDir(iterationDir(letter));
  const pf = projectsFile(letter);
  const pfInfo = await FileSystem.getInfoAsync(pf);
  if (!pfInfo.exists) {
    await FileSystem.writeAsStringAsync(pf, JSON.stringify([], null, 2));
  }
  const xf = indexFile(letter);
  const xfInfo = await FileSystem.getInfoAsync(xf);
  if (!xfInfo.exists) {
    await FileSystem.writeAsStringAsync(xf, JSON.stringify([], null, 2));
  }
}

export async function readProjects(letter: string): Promise<Project[]> {
  await ensureIteration(letter);
  const txt = await FileSystem.readAsStringAsync(projectsFile(letter));
  try {
    return JSON.parse(txt) as Project[];
  } catch {
    return [];
  }
}

export async function writeProjects(
  letter: string,
  projects: Project[],
): Promise<void> {
  await ensureIteration(letter);
  await FileSystem.writeAsStringAsync(
    projectsFile(letter),
    JSON.stringify(projects, null, 2),
  );
}

export async function readExpenses(letter: string): Promise<Expense[]> {
  await ensureIteration(letter);
  const txt = await FileSystem.readAsStringAsync(indexFile(letter));
  try {
    return JSON.parse(txt) as Expense[];
  } catch {
    return [];
  }
}

export async function writeExpenses(
  letter: string,
  expenses: Expense[],
): Promise<void> {
  await ensureIteration(letter);
  await FileSystem.writeAsStringAsync(
    indexFile(letter),
    JSON.stringify(expenses, null, 2),
  );
}

export async function saveExpense(
  letter: string,
  expense: Expense,
  sourceImageUri: string,
): Promise<Expense> {
  const year = new Date(expense.date).getFullYear();
  const folderPath = `${yearDir(letter, expense.projectId, year)}${expenseFolderName(expense)}/`;
  await ensureDir(folderPath);

  const ext = sourceImageUri.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(ext)
    ? ext
    : 'jpg';
  const imageFilename = `receipt.${safeExt}`;
  const destImage = `${folderPath}${imageFilename}`;
  await FileSystem.copyAsync({ from: sourceImageUri, to: destImage });

  const stored: Expense = { ...expense, imageFilename };
  const metaText = [
    `Title: ${stored.title}`,
    `Date: ${stored.date}`,
    `Category: ${stored.category}`,
    `Amount: ${stored.currency} ${stored.amount.toFixed(2)}`,
    stored.notes ? `Notes: ${stored.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  await FileSystem.writeAsStringAsync(`${folderPath}metadata.txt`, metaText);
  await FileSystem.writeAsStringAsync(
    `${folderPath}metadata.json`,
    JSON.stringify(stored, null, 2),
  );

  const all = await readExpenses(letter);
  await writeExpenses(letter, [...all, stored]);
  return stored;
}

export async function imagePathForExpense(
  letter: string,
  expense: Expense,
): Promise<string> {
  const year = new Date(expense.date).getFullYear();
  const folder = `${yearDir(letter, expense.projectId, year)}${expenseFolderName(expense)}/`;
  return `${folder}${expense.imageFilename}`;
}

export async function deleteExpense(
  letter: string,
  expense: Expense,
): Promise<void> {
  const year = new Date(expense.date).getFullYear();
  const folder = `${yearDir(letter, expense.projectId, year)}${expenseFolderName(expense)}/`;
  try {
    await FileSystem.deleteAsync(folder, { idempotent: true });
  } catch {
    /* ignore */
  }
  const all = await readExpenses(letter);
  await writeExpenses(
    letter,
    all.filter((e) => e.id !== expense.id),
  );
}

export async function updateExpense(
  letter: string,
  oldExpense: Expense,
  newExpense: Expense,
): Promise<Expense> {
  const oldYear = new Date(oldExpense.date).getFullYear();
  const newYear = new Date(newExpense.date).getFullYear();
  const oldFolder = `${yearDir(letter, oldExpense.projectId, oldYear)}${expenseFolderName(oldExpense)}/`;
  const newFolder = `${yearDir(letter, newExpense.projectId, newYear)}${expenseFolderName(newExpense)}/`;

  if (oldFolder !== newFolder) {
    await ensureDir(yearDir(letter, newExpense.projectId, newYear));
    const conflict = await FileSystem.getInfoAsync(newFolder);
    if (conflict.exists) {
      await FileSystem.deleteAsync(newFolder, { idempotent: true });
    }
    await FileSystem.moveAsync({ from: oldFolder, to: newFolder });
  }

  const metaText = [
    `Title: ${newExpense.title}`,
    `Date: ${newExpense.date}`,
    `Category: ${newExpense.category}`,
    `Amount: ${newExpense.currency} ${newExpense.amount.toFixed(2)}`,
    newExpense.notes ? `Notes: ${newExpense.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  await FileSystem.writeAsStringAsync(`${newFolder}metadata.txt`, metaText);
  await FileSystem.writeAsStringAsync(
    `${newFolder}metadata.json`,
    JSON.stringify(newExpense, null, 2),
  );

  const all = await readExpenses(letter);
  await writeExpenses(
    letter,
    all.map((e) => (e.id === newExpense.id ? newExpense : e)),
  );
  return newExpense;
}

/**
 * Idempotent project insert keyed by project.id. Used during Drive import.
 * Existing projects with the same id are left untouched (we trust the local
 * copy on conflict). The function returns whether a new row was added.
 */
export async function upsertImportedProject(
  letter: string,
  project: Project,
): Promise<boolean> {
  const all = await readProjects(letter);
  if (all.some((p) => p.id === project.id)) return false;
  await writeProjects(letter, [...all, project]);
  return true;
}

/**
 * Idempotent expense insert keyed by expense.id. Writes the metadata files
 * for the expense (the image is expected to already be on disk at the
 * canonical path). Append-only on the index; existing ids are skipped.
 */
export async function importExpenseFromMetadata(
  letter: string,
  expense: Expense,
): Promise<boolean> {
  const folder = expenseFolderPath(letter, expense);
  await ensureDir(folder);
  const metaText = [
    `Title: ${expense.title}`,
    `Date: ${expense.date}`,
    `Category: ${expense.category}`,
    `Amount: ${expense.currency} ${expense.amount.toFixed(2)}`,
    expense.notes ? `Notes: ${expense.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  await FileSystem.writeAsStringAsync(`${folder}metadata.txt`, metaText);
  await FileSystem.writeAsStringAsync(
    `${folder}metadata.json`,
    JSON.stringify(expense, null, 2),
  );

  const all = await readExpenses(letter);
  if (all.some((e) => e.id === expense.id)) return false;
  await writeExpenses(letter, [...all, expense]);
  return true;
}
