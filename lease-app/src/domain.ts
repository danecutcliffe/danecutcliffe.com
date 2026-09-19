export type ConfigurationState = 'unknown' | 'known_empty' | 'known_populated';
export type StandardOptionCategory = 'included_standard' | 'included_other' | 'tenant_responsibility';
export type TermType = 'start_only' | 'fixed';
export type DepositMode = 'one_month_rent' | 'other';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  isActive: boolean;
}

export interface Entity {
  id: string;
  legalName: string;
  addressForService: string;
  community: string;
  province: string;
  postalCode: string;
  phone: string;
  rentPaymentRecipient: string;
  rentPaymentInstructions: string;
  rentPaymentAddress: string;
  provenance?: Record<string, unknown>;
  recordRevision?: number;
}

export interface Building {
  id: string;
  entityId: string;
  displayName: string;
  streetAddress: string;
  community: string;
  province: string;
  postalCode: string;
  provenance?: Record<string, unknown>;
  recordRevision?: number;
}

export interface Unit {
  id: string;
  buildingId: string;
  displayName: string;
  unitNumber: string;
  premisesStreetAddress: string;
  premisesCommunity: string;
  premisesPostalCode: string;
  premisesType: string;
  entityId: string;
  defaultRentalRate: number | null;
  rentPeriod: string;
  rentDueDay: string;
  includedOptionIds: string[];
  tenantResponsibilityOptionIds: string[];
  inclusionConfigurationState: ConfigurationState;
  responsibilityConfigurationState: ConfigurationState;
  provenance?: Record<string, unknown>;
  recordRevision?: number;
}

export interface StandardOption {
  id: string;
  category: StandardOptionCategory;
  label: string;
  pdfText: string;
  active: boolean;
  systemKey?: string;
  recordRevision?: number;
}

export interface GlobalDefaults {
  damageDepositMode: DepositMode;
  rentPeriod: string;
  rentDueDay: string;
}

export interface LeaseDataset {
  schemaVersion: number;
  revision: number;
  entities: Entity[];
  buildings: Building[];
  units: Unit[];
  standardOptions: StandardOption[];
  globalDefaults: GlobalDefaults;
  generatedFrom?: Record<string, unknown>;
}

export interface LeaseDraft {
  buildingId: string;
  unitId: string;
  tenants: string[];
  termType: TermType;
  startDate: string;
  fixedTermMonths: number;
  endDate: string;
  rentalRate: number | null;
  depositMode: DepositMode;
  otherDepositAmount: number | null;
  includedOptionIds: string[];
  tenantResponsibilityOptionIds: string[];
  additionalIncludedTexts: string[];
  additionalResponsibilityTexts: string[];
  inclusionConfigurationState: ConfigurationState;
  responsibilityConfigurationState: ConfigurationState;
}

export interface ImportCounts {
  entities: { added: number; updated: number; unchanged: number };
  buildings: { added: number; updated: number; unchanged: number };
  units: { added: number; updated: number; unchanged: number };
  standardOptions: { added: number; updated: number; unchanged: number };
}

export interface ImportConflict {
  recordType: 'entity' | 'building' | 'unit' | 'standardOption';
  recordId: string;
  label: string;
  fields: string[];
  field: string;
  current: unknown;
  incoming: unknown;
  acceptIncoming: boolean;
  message: string;
}

export interface ImportPreview {
  token: string;
  schemaVersion: number;
  expectedRevision: number;
  counts: ImportCounts;
  conflicts: ImportConflict[];
  invalidReferences: string[];
  validationErrors: string[];
  warnings: string[];
}

export interface ImportCommitResult {
  added: number;
  updated: number;
  unchanged: number;
  conflicts: number;
  errors: string[];
  backupId: string;
  revision: number;
}

export interface DatasetBackup {
  id: string;
  createdAt: string;
  createdBy: string;
  reason: 'manual' | 'pre_import' | 'pre_restore';
  sourceRevision: number;
  label: string;
}

export interface GeneratedLease {
  filename: string;
  blob: Blob;
}

export interface LeaseValidationIssue {
  id: string;
  fieldId: string;
  message: string;
  manageTarget?: { section: ManageSection; recordId?: string };
}

export type ManageSection = 'entities' | 'buildings' | 'units' | 'options' | 'data';
