import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BackupResult,
  ConflictResolutions,
  PortfolioImportPreview,
  PortfolioImportResult,
  PortfolioPackage,
  RestoreResult,
  SaveRecordResult,
  StandardOptionCategory,
  StoredPortfolioData,
} from "./portfolio-types";

export class LeaseDataError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LeaseDataError";
  }
}

const rpcData = <T>(result: { data: unknown; error: { message: string; code?: string } | null }): T => {
  if (result.error) {
    const message = result.error.message;
    const code = message.includes("STALE_") ? "STALE_DATA" : result.error.code;
    throw new LeaseDataError(message, code, result.error);
  }
  return result.data as T;
};

export class LeaseRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async loadPortfolioData(): Promise<StoredPortfolioData> {
    const [revision, entitiesResult, buildingsResult, optionsResult, unitsResult, includedResult, responsibilityResult, defaultsResult] =
      await Promise.all([
        this.getDatasetRevision(),
        this.supabase.from("lease_entities").select("*").order("legal_name"),
        this.supabase.from("lease_buildings").select("*").order("display_name"),
        this.supabase.from("lease_standard_options").select("*").order("category").order("label"),
        this.supabase.from("lease_units").select("*").order("display_name"),
        this.supabase.from("lease_unit_included_options").select("*").order("sort_order"),
        this.supabase.from("lease_unit_responsibility_options").select("*").order("sort_order"),
        this.supabase.from("lease_global_defaults").select("*").single(),
      ]);

    const rows = <T>(result: { data: unknown; error: { message: string; code?: string } | null }) =>
      rpcData<T>(result);
    const includedByUnit = new Map<string, string[]>();
    for (const row of rows<Array<Record<string, unknown>>>(includedResult)) {
      const ids = includedByUnit.get(String(row.unit_id)) ?? [];
      ids.push(String(row.option_id));
      includedByUnit.set(String(row.unit_id), ids);
    }
    const responsibilitiesByUnit = new Map<string, string[]>();
    for (const row of rows<Array<Record<string, unknown>>>(responsibilityResult)) {
      const ids = responsibilitiesByUnit.get(String(row.unit_id)) ?? [];
      ids.push(String(row.option_id));
      responsibilitiesByUnit.set(String(row.unit_id), ids);
    }

    const metadata = (row: Record<string, unknown>) => ({
      recordRevision: Number(row.record_revision),
      manualFields: (row.manual_fields as string[]) ?? [],
      createdAt: row.created_at ? String(row.created_at) : undefined,
      updatedAt: String(row.updated_at),
    });

    return {
      datasetRevision: revision,
      entities: rows<Array<Record<string, unknown>>>(entitiesResult).map((row) => ({
        id: String(row.id), legalName: String(row.legal_name),
        addressForService: String(row.address_for_service), community: String(row.community),
        province: String(row.province), postalCode: String(row.postal_code), phone: String(row.phone),
        rentPaymentRecipient: String(row.rent_payment_recipient),
        rentPaymentInstructions: String(row.rent_payment_instructions),
        rentPaymentAddress: String(row.rent_payment_address), active: Boolean(row.is_active),
        confidence: row.confidence ? String(row.confidence) : undefined,
        sourceFiles: (row.source_files as string[]) ?? [], ...metadata(row),
      })),
      buildings: rows<Array<Record<string, unknown>>>(buildingsResult).map((row) => ({
        id: String(row.id), displayName: String(row.display_name), streetAddress: String(row.street_address),
        community: String(row.community), province: String(row.province), postalCode: String(row.postal_code),
        sourceDirectory: row.source_directory ? String(row.source_directory) : undefined,
        active: Boolean(row.is_active), confidence: row.confidence ? String(row.confidence) : undefined,
        sourceFiles: (row.source_files as string[]) ?? [], ...metadata(row),
      })),
      standardOptions: rows<Array<Record<string, unknown>>>(optionsResult).map((row) => ({
        id: String(row.id), systemKey: row.system_key ? String(row.system_key) : undefined,
        category: row.category as StandardOptionCategory, label: String(row.label), pdfText: String(row.pdf_text),
        active: Boolean(row.is_active), confidence: row.confidence ? String(row.confidence) : undefined,
        sourceFiles: (row.source_files as string[]) ?? [], ...metadata(row),
      })),
      units: rows<Array<Record<string, unknown>>>(unitsResult).map((row) => ({
        id: String(row.id), buildingId: String(row.building_id), entityId: String(row.entity_id),
        displayName: String(row.display_name), unitNumber: String(row.unit_number),
        premisesStreetAddress: String(row.premises_street_address),
        premisesCommunity: String(row.premises_community), premisesPostalCode: String(row.premises_postal_code),
        premisesType: String(row.premises_type), defaultRentalRate: Number(row.default_rental_rate),
        rentPeriod: String(row.rent_period), rentDueDay: String(row.rent_due_day),
        inclusionsState: row.inclusions_state as StoredPortfolioData["units"][number]["inclusionsState"],
        responsibilitiesState: row.responsibilities_state as StoredPortfolioData["units"][number]["responsibilitiesState"],
        includedOptionIds: includedByUnit.get(String(row.id)) ?? [],
        tenantResponsibilityOptionIds: responsibilitiesByUnit.get(String(row.id)) ?? [],
        active: Boolean(row.is_active), confidence: row.confidence ? String(row.confidence) : undefined,
        sourceFiles: (row.source_files as string[]) ?? [], ...metadata(row),
      })),
      globalDefaults: (() => {
        const row = rows<Record<string, unknown>>(defaultsResult);
        return {
          damageDepositMode: String(row.damage_deposit_mode), rentPeriod: String(row.rent_period),
          rentDueDay: String(row.rent_due_day), ...metadata(row),
        };
      })(),
    };
  }

  async getDatasetRevision(): Promise<number> {
    const result = await this.supabase.rpc("lease_get_dataset_revision");
    return rpcData<number>(result);
  }

  async previewImport(payload: PortfolioPackage): Promise<PortfolioImportPreview> {
    const result = await this.supabase.rpc("lease_preview_portfolio_import", { payload });
    return rpcData<PortfolioImportPreview>(result);
  }

  async commitImport(
    payload: PortfolioPackage,
    preview: Pick<PortfolioImportPreview, "datasetRevision" | "payloadSha256">,
    resolutions: ConflictResolutions = {},
    packageVersion?: string,
  ): Promise<PortfolioImportResult> {
    const result = await this.supabase.rpc("lease_commit_portfolio_import", {
      payload,
      expected_revision: preview.datasetRevision,
      expected_payload_sha256: preview.payloadSha256,
      resolutions,
      package_version: packageVersion ?? null,
    });
    return rpcData<PortfolioImportResult>(result);
  }

  async saveRecord<T extends Record<string, unknown>>(
    collectionName: "entities" | "buildings" | "units" | "standardOptions" | "globalDefaults",
    recordId: string,
    patch: Record<string, unknown>,
    expectedRecordRevision: number,
    expectedDatasetRevision: number,
  ): Promise<SaveRecordResult<T>> {
    const result = await this.supabase.rpc("lease_admin_save_record", {
      collection_name: collectionName,
      record_id: recordId,
      patch,
      expected_record_revision: expectedRecordRevision,
      expected_dataset_revision: expectedDatasetRevision,
    });
    return rpcData<SaveRecordResult<T>>(result);
  }

  async createStandardOption(
    id: string,
    option: { category: StandardOptionCategory; label: string; pdfText: string; active?: boolean },
    expectedDatasetRevision: number,
  ): Promise<SaveRecordResult> {
    return this.saveRecord(
      "standardOptions",
      id,
      { ...option, active: option.active ?? true },
      0,
      expectedDatasetRevision,
    );
  }

  async createBackup(reason = "Manual backup"): Promise<BackupResult> {
    const result = await this.supabase.rpc("lease_create_portfolio_backup", { reason });
    return rpcData<BackupResult>(result);
  }

  async restoreBackup(backupId: string, expectedRevision: number): Promise<RestoreResult> {
    const result = await this.supabase.rpc("lease_restore_portfolio_backup", {
      backup_id: backupId,
      expected_revision: expectedRevision,
    });
    return rpcData<RestoreResult>(result);
  }

  async exportPortfolio(): Promise<PortfolioPackage> {
    const result = await this.supabase.rpc("lease_export_portfolio_data");
    return rpcData<PortfolioPackage>(result);
  }
}
