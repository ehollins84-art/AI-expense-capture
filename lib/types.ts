export type CategoryScheme = 'schedule_e' | 'schedule_c' | 'custom';

export type Project = {
  id: string;
  name: string;
  scheme: CategoryScheme;
  customCategories?: string[];
  additionalCategories?: string[];
  createdAt: string;
  // --- Shared projects ---
  // Present when this project is shared with other people through the backend.
  // For a shared project, `id` equals `shareId` and its expenses sync to the
  // server instead of the local filesystem / personal Drive.
  shareId?: string;
  ownerEmail?: string;
  members?: string[];
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
  // --- Shared projects ---
  // Present when this expense belongs to a shared project. `addedByEmail` is the
  // Google account of whoever captured it — only they can edit or delete it.
  shareId?: string;
  addedByEmail?: string;
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
