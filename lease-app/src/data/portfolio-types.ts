export type ConfigurationState =
  | "unknown"
  | "known_empty"
  | "known_populated";

export type StandardOptionCategory =
  | "included_standard"
  | "included_other"
  | "tenant_responsibility";

export interface ImportProvenance {
  confidence?: string;
  sourceFiles?: string[];
  [key: string]: unknown;
}

export interface PortfolioEntity extends ImportProvenance {
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
  active?: boolean;
}

export interface PortfolioBuilding extends ImportProvenance {
  id: string;
  displayName: string;
  streetAddress: string;
  community: string;
  province: string;
  postalCode: string;
  sourceDirectory?: string;
  active?: boolean;
}

export interface PortfolioStandardOption extends ImportProvenance {
  id: string;
  systemKey?: string;
  category: StandardOptionCategory;
  label: string;
  pdfText: string;
  active?: boolean;
}

export interface PortfolioUnit extends ImportProvenance {
  id: string;
  buildingId: string;
  entityId: string;
  displayName: string;
  unitNumber: string;
  premisesStreetAddress: string;
  premisesCommunity: string;
  premisesPostalCode: string;
  premisesType: string;
  defaultRentalRate: number;
  rentPeriod: string;
  rentDueDay: string;
  includedOptionIds: string[];
  tenantResponsibilityOptionIds: string[];
  inclusionsState?: ConfigurationState;
  responsibilitiesState?: ConfigurationState;
  active?: boolean;
}

export interface PortfolioPackage {
  schemaVersion: 1 | 2;
  packageVersion?: string;
  generatedFrom?: {
    rootDirectory?: string;
    cutoffDate?: string;
    generatedAt?: string;
    [key: string]: unknown;
  };
  entities: PortfolioEntity[];
  buildings: PortfolioBuilding[];
  units: PortfolioUnit[];
  standardOptions: PortfolioStandardOption[];
  globalDefaults: {
    damageDepositMode: string;
    rentPeriod: string;
    rentDueDay: string;
    [key: string]: unknown;
  };
}

export interface AdaptedPortfolioUnit extends PortfolioUnit {
  inclusionsState: ConfigurationState;
  responsibilitiesState: ConfigurationState;
}

export interface AdaptedPortfolioPackage extends Omit<PortfolioPackage, "units"> {
  units: AdaptedPortfolioUnit[];
}

export interface ImportCount {
  added: number;
  updated: number;
  unchanged: number;
}

export interface ImportConflict {
  collection: "entities" | "buildings" | "units" | "standardOptions";
  id: string;
  field: string;
  current: unknown;
  incoming: unknown;
  defaultResolution: "keep_current";
}

export interface PortfolioImportPreview {
  datasetRevision: number;
  payloadSha256: string;
  validationErrors: string[];
  conflicts: ImportConflict[];
  counts: Partial<
    Record<"entities" | "buildings" | "units" | "standardOptions", ImportCount>
  >;
}

export interface PortfolioImportResult extends PortfolioImportPreview {
  backupId: string;
  newDatasetRevision: number;
}

export type ConflictResolutions = Partial<
  Record<
    "entities" | "buildings" | "units" | "standardOptions",
    Record<string, Record<string, "accept_incoming" | "keep_current">>
  >
>;

export interface SaveRecordResult<T = Record<string, unknown>> {
  record: T;
  newDatasetRevision: number;
}

export interface RestoreResult {
  restoredBackupId: string;
  preRestoreBackupId: string;
  newDatasetRevision: number;
}

export interface BackupResult {
  backupId: string;
  datasetRevision: number;
}

export interface StoredRecordMetadata {
  recordRevision: number;
  manualFields: string[];
  createdAt?: string;
  updatedAt: string;
}

export type StoredPortfolioEntity = PortfolioEntity & StoredRecordMetadata;
export type StoredPortfolioBuilding = PortfolioBuilding & StoredRecordMetadata;
export type StoredPortfolioStandardOption = PortfolioStandardOption & StoredRecordMetadata;
export type StoredPortfolioUnit = AdaptedPortfolioUnit & StoredRecordMetadata;

export interface StoredPortfolioData {
  datasetRevision: number;
  entities: StoredPortfolioEntity[];
  buildings: StoredPortfolioBuilding[];
  standardOptions: StoredPortfolioStandardOption[];
  units: StoredPortfolioUnit[];
  globalDefaults: PortfolioPackage["globalDefaults"] & StoredRecordMetadata;
}
