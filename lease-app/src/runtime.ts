import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { LeaseAppAdapters } from './adapters';
import type {
  Building,
  DatasetBackup,
  Entity,
  ImportCommitResult,
  ImportPreview,
  LeaseDataset,
  LeaseDraft,
  SessionUser,
  StandardOption,
  Unit,
} from './domain';
import { LeaseRepository } from './data/lease-repository';
import { adaptPortfolioPackage, parsePortfolioPackage } from './data/portfolio-schema';
import type { PortfolioImportPreview, PortfolioPackage } from './data/portfolio-types';
import { generateLeasePdf, loadLeasePdfAssets, type LeasePdfAssets } from './lib/leasePdf';
import { toLeasePdfInput } from './lib/leaseForm';

const BUILT_IN_OPTION_KEYS: Record<string, string> = {
  'option-included-heat': 'heat',
  'option-included-water': 'water',
  'option-included-hot-water': 'hot_water',
  'option-included-electricity': 'electricity',
  'option-included-cooking-stove': 'cooking_stove',
  'option-included-refrigerator': 'refrigerator',
  'option-included-washer-dryer-free': 'washer_dryer_free',
  'option-included-washer-dryer-coin': 'washer_dryer_coin',
  'option-included-cable-hookup': 'cable_hookup',
  'option-included-cable-service': 'cable_service',
  'option-included-janitorial-common-areas': 'janitorial_common_areas',
  'option-included-parking': 'parking',
  'option-included-snow-removal': 'snow_removal',
  'option-included-grass-cutting': 'grass_cutting',
};

export function createProductionAdapters(): LeaseAppAdapters {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error('Lease Generator is missing its secure data-service configuration.');
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return createSupabaseAdapters(supabase);
}

export function createSupabaseAdapters(supabase: SupabaseClient): LeaseAppAdapters {
  const repository = new LeaseRepository(supabase);
  const pendingImports = new Map<string, { payload: PortfolioPackage; preview: PortfolioImportPreview; packageVersion?: string }>();
  let pdfAssets: Promise<LeasePdfAssets> | undefined;

  const sessionForUser = async (user: User | null): Promise<SessionUser | null> => {
    if (!user) return null;
    const { data, error } = await supabase.from('profiles').select('id,email,first_name,last_name,role,is_active').eq('id', user.id).single();
    if (error) throw new Error(error.message);
    return {
      id: user.id,
      email: String(data.email ?? user.email ?? ''),
      displayName: [data.first_name, data.last_name].filter(Boolean).join(' ') || String(user.email ?? ''),
      isAdmin: data.role === 'admin',
      isActive: Boolean(data.is_active),
    };
  };

  const loadDataset = async (): Promise<LeaseDataset> => {
    const [state, entities, buildings, units, options, included, responsibilities, defaults] = await Promise.all([
      supabase.from('lease_dataset_state').select('revision,schema_version').eq('singleton', true).single(),
      supabase.from('lease_entities').select('*').eq('is_active', true).order('legal_name'),
      supabase.from('lease_buildings').select('*').eq('is_active', true).order('display_name'),
      supabase.from('lease_units').select('*').eq('is_active', true).order('display_name'),
      supabase.from('lease_standard_options').select('*').order('category').order('label'),
      supabase.from('lease_unit_included_options').select('unit_id,option_id,sort_order').order('sort_order'),
      supabase.from('lease_unit_responsibility_options').select('unit_id,option_id,sort_order').order('sort_order'),
      supabase.from('lease_global_defaults').select('*').eq('singleton', true).single(),
    ]);
    for (const result of [state, entities, buildings, units, options, included, responsibilities, defaults]) {
      if (result.error) throw new Error(result.error.message);
    }
    const includedByUnit = relationMap(included.data as Array<{unit_id:string;option_id:string}>);
    const responsibilitiesByUnit = relationMap(responsibilities.data as Array<{unit_id:string;option_id:string}>);
    return {
      schemaVersion: Number(state.data!.schema_version),
      revision: Number(state.data!.revision),
      entities: (entities.data ?? []).map(mapEntity),
      buildings: (buildings.data ?? []).map(mapBuilding),
      units: (units.data ?? []).map((row) => mapUnit(row, includedByUnit, responsibilitiesByUnit)),
      standardOptions: (options.data ?? []).map(mapOption),
      globalDefaults: {
        damageDepositMode: defaults.data.damage_deposit_mode === 'other' ? 'other' : 'one_month_rent',
        rentPeriod: String(defaults.data.rent_period),
        rentDueDay: String(defaults.data.rent_due_day),
      },
    };
  };

  const save = async <T extends Entity | Building | Unit | StandardOption>(collection: 'entities'|'buildings'|'units'|'standardOptions', value: T): Promise<T> => {
    const datasetRevision = await repository.getDatasetRevision();
    await repository.saveRecord(collection, value.id, recordPatch(collection, value), value.recordRevision ?? 0, datasetRevision);
    return value;
  };

  return {
    auth: {
      getSession: async () => sessionForUser((await supabase.auth.getSession()).data.session?.user ?? null),
      signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error(error.message);
        const session = await sessionForUser(data.user);
        if (!session) throw new Error('Sign-in did not return a user session.');
        if (!session.isAdmin || !session.isActive) {
          await supabase.auth.signOut();
          throw new Error('This account does not have active administrator access.');
        }
        return session;
      },
      signOut: async () => { const { error } = await supabase.auth.signOut(); if (error) throw new Error(error.message); },
      subscribe: (listener) => {
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
          sessionForUser(session?.user ?? null).then(listener).catch(() => listener(null));
        });
        return () => data.subscription.unsubscribe();
      },
    },
    data: {
      loadDataset,
      saveEntity: (value) => save('entities', value),
      saveBuilding: (value) => save('buildings', value),
      saveUnit: (value) => save('units', value),
      saveStandardOption: (value) => save('standardOptions', value),
      deleteRecord: async (collection, id, recordRevision) => {
        const datasetRevision = await repository.getDatasetRevision();
        await repository.deleteRecord(collection, id, recordRevision, datasetRevision);
      },
      previewPortfolioImport: async (file) => {
        try {
          const parsed = adaptPortfolioPackage(parsePortfolioPackage(JSON.parse(await file.text()))) as PortfolioPackage;
          const preview = await repository.previewImport(parsed);
          const packageVersion = typeof parsed.packageVersion === 'string'
            ? parsed.packageVersion
            : /v\d+\.\d+\.\d+/iu.exec(file.name)?.[0];
          pendingImports.set(preview.payloadSha256, { payload: parsed, preview, packageVersion });
          return mapPreview(preview);
        } catch (error) {
          return invalidPreview(error);
        }
      },
      commitPortfolioImport: async (value) => {
        const pending = pendingImports.get(value.token);
        if (!pending) throw new Error('This import preview has expired. Choose the file and preview it again.');
        const resolutions: import('./data/portfolio-types').ConflictResolutions = {};
        for (const conflict of value.conflicts.filter((item) => item.acceptIncoming)) {
          const collection = conflict.recordType === 'standardOption' ? 'standardOptions' : `${conflict.recordType}s` as 'entities'|'buildings'|'units';
          resolutions[collection] ??= {};
          resolutions[collection]![conflict.recordId] ??= {};
          resolutions[collection]![conflict.recordId]![conflict.field] = 'accept_incoming';
        }
        const result = await repository.commitImport(pending.payload, pending.preview, resolutions, pending.packageVersion);
        pendingImports.delete(value.token);
        return {
          added: totalCount(result.counts, 'added'),
          updated: totalCount(result.counts, 'updated'),
          unchanged: totalCount(result.counts, 'unchanged'),
          conflicts: result.conflicts.length,
          errors: result.validationErrors,
          backupId: result.backupId,
          revision: result.newDatasetRevision,
        };
      },
      exportDataset: async () => {
        const data = await repository.exportPortfolio();
        const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
        return { filename: `lease_portfolio_export_${stamp}.json`, json: `${JSON.stringify(data, null, 2)}\n` };
      },
      createBackup: async (label = 'Manual backup') => {
        const result = await repository.createBackup(label);
        return { id: result.backupId, createdAt: new Date().toISOString(), createdBy: '', reason: 'manual', sourceRevision: result.datasetRevision, label };
      },
      listBackups: async () => {
        const { data, error } = await supabase.from('lease_backups').select('id,created_at,created_by,reason,dataset_revision').order('created_at', { ascending: false }).limit(30);
        if (error) throw new Error(error.message);
        return (data ?? []).map((row): DatasetBackup => ({ id: row.id, createdAt: row.created_at, createdBy: row.created_by, reason: backupReason(row.reason), sourceRevision: Number(row.dataset_revision), label: row.reason }));
      },
      restoreBackup: async (backupId, expectedRevision) => {
        const result = await repository.restoreBackup(backupId, expectedRevision);
        return { added: 0, updated: 0, unchanged: 0, conflicts: 0, errors: [], backupId: result.preRestoreBackupId, revision: result.newDatasetRevision };
      },
    },
    pdf: {
      generate: async (draft: LeaseDraft, dataset: LeaseDataset) => {
        pdfAssets ??= loadLeasePdfAssets(undefined, {
          templateUrl: `${import.meta.env.BASE_URL}templates/generated/lease-template.pdf`,
          manifestUrl: `${import.meta.env.BASE_URL}templates/generated/template-manifest.json`,
        });
        const generated = await generateLeasePdf(toLeasePdfInput(dataset, draft), await pdfAssets);
        return { filename: generated.filename, blob: new Blob([generated.bytes as BlobPart], { type: 'application/pdf' }) };
      },
    },
  };
}

function relationMap(rows: Array<{unit_id:string;option_id:string}>): Map<string,string[]> {
  const result = new Map<string,string[]>();
  for (const row of rows ?? []) result.set(row.unit_id, [...(result.get(row.unit_id) ?? []), row.option_id]);
  return result;
}
function provenance(row: Record<string, unknown>) { return { confidence: row.confidence, sourceFiles: row.source_files }; }
function mapEntity(row: any): Entity { return { id:row.id,legalName:row.legal_name,addressForService:row.address_for_service,community:row.community,province:row.province,postalCode:row.postal_code,phone:row.phone,rentPaymentRecipient:row.rent_payment_recipient,rentPaymentInstructions:row.rent_payment_instructions,rentPaymentAddress:row.rent_payment_address,provenance:provenance(row),recordRevision:Number(row.record_revision) }; }
function mapBuilding(row: any): Building { return { id:row.id,entityId:row.entity_id??'',displayName:row.display_name,streetAddress:row.street_address,community:row.community,province:row.province,postalCode:row.postal_code,provenance:provenance(row),recordRevision:Number(row.record_revision) }; }
function mapUnit(row:any,included:Map<string,string[]>,responsibilities:Map<string,string[]>):Unit { return { id:row.id,buildingId:row.building_id,entityId:row.entity_id,displayName:row.display_name,unitNumber:row.unit_number,premisesStreetAddress:row.premises_street_address,premisesCommunity:row.premises_community,premisesPostalCode:row.premises_postal_code,premisesType:row.premises_type,defaultRentalRate:Number(row.default_rental_rate),rentPeriod:row.rent_period,rentDueDay:row.rent_due_day,includedOptionIds:included.get(row.id)??[],tenantResponsibilityOptionIds:responsibilities.get(row.id)??[],inclusionConfigurationState:row.inclusions_state,responsibilityConfigurationState:row.responsibilities_state,provenance:provenance(row),recordRevision:Number(row.record_revision) }; }
function mapOption(row:any):StandardOption { return { id:row.id,category:row.category,label:row.label,pdfText:row.pdf_text,active:Boolean(row.is_active),systemKey:row.system_key ?? BUILT_IN_OPTION_KEYS[row.id],recordRevision:Number(row.record_revision) }; }
function recordPatch(collection:string,value:any):Record<string,unknown> { const common = Object.fromEntries(Object.entries(value).filter(([key]) => !['id','recordRevision','provenance','systemKey'].includes(key))); if (collection === 'units') { common.inclusionsState=common.inclusionConfigurationState; common.responsibilitiesState=common.responsibilityConfigurationState; delete common.inclusionConfigurationState; delete common.responsibilityConfigurationState; delete common.additionalIncludedTexts; delete common.additionalResponsibilityTexts; } return common; }
function mapPreview(preview:PortfolioImportPreview):ImportPreview { const count=(key:keyof ImportPreview['counts'])=>preview.counts[key]??{added:0,updated:0,unchanged:0}; return { token:preview.payloadSha256,schemaVersion:1,expectedRevision:preview.datasetRevision,counts:{entities:count('entities'),buildings:count('buildings'),units:count('units'),standardOptions:count('standardOptions')},conflicts:preview.conflicts.map((item)=>({recordType:item.collection==='standardOptions'?'standardOption':item.collection.slice(0,-1) as 'entity'|'building'|'unit',recordId:item.id,label:item.id,fields:[item.field],field:item.field,current:item.current,incoming:item.incoming,acceptIncoming:false,message:`${item.field} differs; the current value will be kept unless explicitly accepted.`})),invalidReferences:[],validationErrors:preview.validationErrors,warnings:[] }; }
function invalidPreview(error:unknown):ImportPreview { const empty=()=>({added:0,updated:0,unchanged:0}); return { token:'',schemaVersion:0,expectedRevision:0,counts:{entities:empty(),buildings:empty(),units:empty(),standardOptions:empty()},conflicts:[],invalidReferences:[],validationErrors:[error instanceof Error?error.message:String(error)],warnings:[] }; }
function totalCount(counts:PortfolioImportPreview['counts'],field:'added'|'updated'|'unchanged') { return Object.values(counts).reduce((sum,item)=>sum+(item?.[field]??0),0); }
function backupReason(reason:string):DatasetBackup['reason'] { if (reason.toLowerCase().includes('pre-import')) return 'pre_import'; if (reason.toLowerCase().includes('pre-restore')) return 'pre_restore'; return 'manual'; }
