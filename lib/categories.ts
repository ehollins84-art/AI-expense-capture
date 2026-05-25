import type { CategoryScheme, Project } from './types';

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
  return merged;
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
