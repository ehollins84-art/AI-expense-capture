export type CategoryScheme = 'schedule_e' | 'schedule_c' | 'custom';

export type Project = {
  id: string;
  name: string;
  scheme: CategoryScheme;
  customCategories?: string[];
  additionalCategories?: string[];
  createdAt: string;
};

export type Expense = {
  id: string;
  projectId: string;
  title: string;
  date: string;
  category: string;
  amount: number;
  currency: string;
  imageFilename?: string;
  notes?: string;
  createdAt: string;
};

export type Iteration = {
  letter: string;
  expenses: Expense[];
  projects: Project[];
};

export type ExtractedReceipt = {
  title: string;
  date: string;
  category: string;
  amount: number;
  currency: string;
  merchant?: string;
};

export type CloudStatus =
  | { kind: 'disconnected' }
  | { kind: 'connected'; email?: string; iteration: string };
