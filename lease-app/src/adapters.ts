import type {
  Building,
  DatasetBackup,
  Entity,
  GeneratedLease,
  ImportCommitResult,
  ImportPreview,
  LeaseDataset,
  LeaseDraft,
  SessionUser,
  StandardOption,
  Unit,
} from './domain';

export interface AuthAdapter {
  getSession(): Promise<SessionUser | null>;
  signIn(email: string, password: string): Promise<SessionUser>;
  signOut(): Promise<void>;
  subscribe(listener: (session: SessionUser | null) => void): () => void;
}

export interface LeaseDataAdapter {
  loadDataset(): Promise<LeaseDataset>;
  saveEntity(entity: Entity): Promise<Entity>;
  saveBuilding(building: Building): Promise<Building>;
  saveUnit(unit: Unit): Promise<Unit>;
  saveStandardOption(option: StandardOption): Promise<StandardOption>;
  previewPortfolioImport(source: File): Promise<ImportPreview>;
  commitPortfolioImport(preview: ImportPreview): Promise<ImportCommitResult>;
  exportDataset(): Promise<{ filename: string; json: string }>;
  createBackup(label?: string): Promise<DatasetBackup>;
  listBackups(): Promise<DatasetBackup[]>;
  restoreBackup(backupId: string, expectedRevision: number): Promise<ImportCommitResult>;
}

export interface LeasePdfAdapter {
  generate(draft: LeaseDraft, dataset: LeaseDataset): Promise<GeneratedLease>;
}

export interface LeaseAppAdapters {
  auth: AuthAdapter;
  data: LeaseDataAdapter;
  pdf: LeasePdfAdapter;
}

export class AdapterUnavailableError extends Error {
  constructor(message = 'The secure lease data service is not configured yet.') {
    super(message);
    this.name = 'AdapterUnavailableError';
  }
}

const emptyDataset: LeaseDataset = {
  schemaVersion: 1,
  revision: 0,
  entities: [],
  buildings: [],
  units: [],
  standardOptions: [],
  globalDefaults: {
    damageDepositMode: 'one_month_rent',
    rentPeriod: 'Month',
    rentDueDay: '1st',
  },
};

export function createUnavailableAdapters(): LeaseAppAdapters {
  let listener: ((session: SessionUser | null) => void) | undefined;
  const unavailable = () => Promise.reject(new AdapterUnavailableError());

  return {
    auth: {
      getSession: async () => null,
      signIn: unavailable,
      signOut: async () => listener?.(null),
      subscribe: (nextListener) => {
        listener = nextListener;
        return () => {
          if (listener === nextListener) listener = undefined;
        };
      },
    },
    data: {
      loadDataset: async () => structuredClone(emptyDataset),
      saveEntity: unavailable,
      saveBuilding: unavailable,
      saveUnit: unavailable,
      saveStandardOption: unavailable,
      previewPortfolioImport: unavailable,
      commitPortfolioImport: unavailable,
      exportDataset: unavailable,
      createBackup: unavailable,
      listBackups: async () => [],
      restoreBackup: unavailable,
    },
    pdf: { generate: unavailable },
  };
}

export function createInMemoryAdapters(initialDataset: LeaseDataset, initialSession?: SessionUser): LeaseAppAdapters {
  let dataset = structuredClone(initialDataset);
  let session = initialSession ?? null;
  const listeners = new Set<(value: SessionUser | null) => void>();
  const notify = () => listeners.forEach((listener) => listener(session));

  return {
    auth: {
      getSession: async () => session,
      signIn: async (email) => {
        session = { id: 'test-admin', email, displayName: 'Administrator', isAdmin: true, isActive: true };
        notify();
        return session;
      },
      signOut: async () => {
        session = null;
        notify();
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    data: {
      loadDataset: async () => structuredClone(dataset),
      saveEntity: async (value) => {
        dataset.entities = replaceById(dataset.entities, value);
        return structuredClone(value);
      },
      saveBuilding: async (value) => {
        dataset.buildings = replaceById(dataset.buildings, value);
        return structuredClone(value);
      },
      saveUnit: async (value) => {
        dataset.units = replaceById(dataset.units, value);
        return structuredClone(value);
      },
      saveStandardOption: async (value) => {
        dataset.standardOptions = replaceById(dataset.standardOptions, value);
        return structuredClone(value);
      },
      previewPortfolioImport: async () => ({
        token: 'mock-preview', schemaVersion: 1, expectedRevision: dataset.revision,
        counts: emptyCounts(), conflicts: [], invalidReferences: [], validationErrors: [], warnings: [],
      }),
      commitPortfolioImport: unavailableMethod('Portfolio import'),
      exportDataset: async () => ({ filename: 'lease-portfolio.json', json: JSON.stringify(dataset, null, 2) }),
      createBackup: unavailableMethod('Backup creation'),
      listBackups: async () => [],
      restoreBackup: unavailableMethod('Backup restore'),
    },
    pdf: { generate: unavailableMethod('PDF generation') },
  };
}

function replaceById<T extends { id: string }>(records: T[], value: T): T[] {
  return [...records.filter((record) => record.id !== value.id), structuredClone(value)];
}

function unavailableMethod<T>(label: string): () => Promise<T> {
  return () => Promise.reject(new AdapterUnavailableError(`${label} is not available in the in-memory adapter.`));
}

function emptyCounts(): ImportPreview['counts'] {
  const empty = () => ({ added: 0, updated: 0, unchanged: 0 });
  return { entities: empty(), buildings: empty(), units: empty(), standardOptions: empty() };
}
