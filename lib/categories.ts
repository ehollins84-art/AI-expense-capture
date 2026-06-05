import type { CategoryScheme, Project } from './types';

/**
 * The universal fallback category. Every project — regardless of type — always
 * offers this bucket so no receipt is ever left without a home. It is computed
 * (never written into a project's stored category arrays), which means existing
 * projects gain it automatically and it can never be deleted.
 */
export const UNCATEGORIZED = 'Uncategorized';

/** True for the protected Uncategorized bucket (case-insensitive). */
export function isProtectedCategory(name: string): boolean {
  return name.trim().toLowerCase() === UNCATEGORIZED.toLowerCase();
}

export const SCHEDULE_E_CATEGORIES = [
  'Advertising',
  'Auto and Travel',
  'Cleaning and Maintenance',
  'Commissions',
  'Insurance',
  'Legal and Professional Fees',
  'Management Fees',
  'Mortgage Interest',
  'Other Interest',
  'Repairs',
  'Supplies',
  'Taxes',
  'Utilities',
  'Depreciation',
  'Other',
];

export const SCHEDULE_C_CATEGORIES = [
  'Advertising',
  'Car and Truck',
  'Contract Labor',
  'Insurance',
  'Legal and Professional',
  'Office',
  'Rent',
  'Repairs',
  'Supplies',
  'Travel',
  'Meals',
  'Utilities',
  'Wages',
  'Other',
];

export function baseCategoriesForProject(project: Project): string[] {
  switch (project.scheme) {
    case 'schedule_e':
      return SCHEDULE_E_CATEGORIES;
    case 'schedule_c':
      return SCHEDULE_C_CATEGORIES;
    case 'custom':
      return project.customCategories?.length
        ? project.customCategories
        : ['Other'];
  }
}

export function categoriesForProject(project: Project): string[] {
  const base = baseCategoriesForProject(project);
  const extras = project.additionalCategories ?? [];
  const seen = new Set(base.map((c) => c.toLowerCase()));
  const merged = [...base];
  for (const extra of extras) {
    const key = extra.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(extra);
    }
  }
  // Always offer Uncategorized as the final, safe fallback bucket.
  if (!seen.has(UNCATEGORIZED.toLowerCase())) {
    merged.push(UNCATEGORIZED);
  }
  return merged;
}

/**
 * The categories the user is allowed to add / rename / remove for this project.
 * Built-in tax categories (Schedule E/C) and the computed Uncategorized bucket
 * are intentionally excluded — they are not user-managed.
 */
export function removableCategories(project: Project): string[] {
  const list =
    project.scheme === 'custom'
      ? project.customCategories ?? []
      : project.additionalCategories ?? [];
  return list.filter((c) => !isProtectedCategory(c));
}

/**
 * Returns a copy of the project with a new user category added. Throws with a
 * friendly message if the name is empty, is the reserved Uncategorized label,
 * or already exists (case-insensitive) anywhere in the project's category set.
 */
export function addCategoryToProject(project: Project, rawName: string): Project {
  const name = rawName.trim();
  if (!name) throw new Error('Give the category a name.');
  if (isProtectedCategory(name)) {
    throw new Error(`"${UNCATEGORIZED}" is always available — no need to add it.`);
  }
  const existing = categoriesForProject(project).map((c) => c.toLowerCase());
  if (existing.includes(name.toLowerCase())) {
    throw new Error(`"${name}" is already a category in this project.`);
  }
  if (project.scheme === 'custom') {
    return {
      ...project,
      customCategories: [...(project.customCategories ?? []), name],
    };
  }
  return {
    ...project,
    additionalCategories: [...(project.additionalCategories ?? []), name],
  };
}

/**
 * Returns a copy of the project with a user category renamed. Only user-managed
 * categories can be renamed (not built-in tax categories or Uncategorized).
 * Callers are responsible for re-labelling the receipts that used the old name.
 */
export function renameCategoryInProject(
  project: Project,
  from: string,
  rawTo: string,
): Project {
  const to = rawTo.trim();
  if (!to) throw new Error('Give the category a name.');
  if (isProtectedCategory(from)) throw new Error(`"${UNCATEGORIZED}" can't be renamed.`);
  if (isProtectedCategory(to)) {
    throw new Error(`You can't rename a category to "${UNCATEGORIZED}".`);
  }
  const editable = removableCategories(project);
  if (!editable.some((c) => c.toLowerCase() === from.toLowerCase())) {
    throw new Error(`"${from}" can't be renamed.`);
  }
  // Block collisions with any other existing category, unless it's only a
  // change of capitalisation of the same word.
  if (to.toLowerCase() !== from.toLowerCase()) {
    const others = categoriesForProject(project).map((c) => c.toLowerCase());
    if (others.includes(to.toLowerCase())) {
      throw new Error(`"${to}" is already a category in this project.`);
    }
  }
  const swap = (list: string[]) =>
    list.map((c) => (c.toLowerCase() === from.toLowerCase() ? to : c));
  if (project.scheme === 'custom') {
    return { ...project, customCategories: swap(project.customCategories ?? []) };
  }
  return { ...project, additionalCategories: swap(project.additionalCategories ?? []) };
}

/**
 * Returns a copy of the project with a user category removed. The Uncategorized
 * bucket is protected and cannot be removed. Callers are responsible for moving
 * the removed category's receipts to Uncategorized.
 */
export function deleteCategoryFromProject(project: Project, name: string): Project {
  if (isProtectedCategory(name)) {
    throw new Error(`"${UNCATEGORIZED}" can't be removed.`);
  }
  const drop = (list: string[]) =>
    list.filter((c) => c.toLowerCase() !== name.toLowerCase());
  if (project.scheme === 'custom') {
    return { ...project, customCategories: drop(project.customCategories ?? []) };
  }
  return { ...project, additionalCategories: drop(project.additionalCategories ?? []) };
}

export function labelForScheme(scheme: CategoryScheme): string {
  switch (scheme) {
    case 'schedule_e':
      return 'Schedule E (Rental)';
    case 'schedule_c':
      return 'Schedule C (Business)';
    case 'custom':
      return 'Custom';
  }
}
