import type {
  Entity,
  LeaseDataset,
  LeaseDraft,
  LeaseValidationIssue,
  Unit,
} from '../domain';
import type { InclusionKey, LeasePdfInput, PremisesType } from './leasePdf';
import { calculateFixedTermEndDate } from './leasePdf';

const STREET_TYPE_ABBREV: Array<[RegExp, string]> = [
  [/\bStreet\b/iu, 'St'],
  [/\bAvenue\b/iu, 'Ave'],
  [/\bDrive\b/iu, 'Dr'],
  [/\bRoad\b/iu, 'Rd'],
  [/\bBoulevard\b/iu, 'Blvd'],
  [/\bCrescent\b/iu, 'Cres'],
  [/\bCourt\b/iu, 'Ct'],
  [/\bPlace\b/iu, 'Pl'],
  [/\bLane\b/iu, 'Ln'],
];

export function abbreviateStreetAddress(address: string): string {
  let result = address;
  for (const [pattern, replacement] of STREET_TYPE_ABBREV) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function generateUnitDisplayName(unitNumber: string, premisesStreetAddress: string): string {
  const abbreviated = abbreviateStreetAddress(premisesStreetAddress);
  if (!unitNumber) return abbreviated;
  if (/^\d+$/u.test(unitNumber)) return `${unitNumber}-${abbreviated}`;
  const match = abbreviated.match(/^(\d+)\s*(.*)$/u);
  if (match) return `${match[1]}${unitNumber} ${match[2]}`;
  return `${unitNumber}-${abbreviated}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const PREMISES_TYPES = new Set<PremisesType>([
  'apartment',
  'single_family_home',
  'room',
  'mobile_home',
  'duplex_or_row_housing',
  'mobile_home_site',
]);

export function todayLocal(date = new Date()): string {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function unitsForBuilding(dataset: LeaseDataset, buildingId: string): Unit[] {
  return dataset.units
    .filter((unit) => unit.buildingId === buildingId)
    .sort((left, right) => left.displayName.localeCompare(right.displayName, undefined, { numeric: true }));
}

export function selectUnitForBuilding(
  dataset: LeaseDataset,
  buildingId: string,
  currentUnitId = '',
): string {
  const units = unitsForBuilding(dataset, buildingId);
  if (units.some((unit) => unit.id === currentUnitId)) return currentUnitId;
  return units.length === 1 ? units[0].id : '';
}

export function effectiveDepositAmount(draft: LeaseDraft): number | null {
  return draft.depositMode === 'one_month_rent' ? draft.rentalRate : draft.otherDepositAmount;
}

export function initialLeaseDraft(dataset: LeaseDataset): LeaseDraft {
  return {
    buildingId: '',
    unitId: '',
    tenants: [''],
    termType: 'start_only',
    startDate: '',
    fixedTermMonths: 12,
    endDate: '',
    rentalRate: null,
    depositMode: dataset.globalDefaults.damageDepositMode,
    otherDepositAmount: null,
    includedOptionIds: [],
    tenantResponsibilityOptionIds: [],
    additionalIncludedTexts: [],
    additionalResponsibilityTexts: [],
    inclusionConfigurationState: 'unknown',
    responsibilityConfigurationState: 'unknown',
  };
}

export function draftForSelectedUnit(draft: LeaseDraft, unit: Unit): LeaseDraft {
  return {
    ...draft,
    buildingId: unit.buildingId,
    unitId: unit.id,
    rentalRate: unit.defaultRentalRate,
    includedOptionIds: [...unit.includedOptionIds],
    tenantResponsibilityOptionIds: [...unit.tenantResponsibilityOptionIds],
    additionalIncludedTexts: [],
    additionalResponsibilityTexts: [],
    inclusionConfigurationState: unit.inclusionConfigurationState,
    responsibilityConfigurationState: unit.responsibilityConfigurationState,
  };
}

function requiredIssue(
  value: unknown,
  fieldId: string,
  message: string,
  manageTarget?: LeaseValidationIssue['manageTarget'],
): LeaseValidationIssue | undefined {
  if (typeof value === 'string' ? value.trim() : value !== null && value !== undefined) return undefined;
  return { id: `required-${fieldId}`, fieldId, message, manageTarget };
}

export function validateLeaseDraft(dataset: LeaseDataset, draft: LeaseDraft): LeaseValidationIssue[] {
  const issues: Array<LeaseValidationIssue | undefined> = [];
  const building = dataset.buildings.find((record) => record.id === draft.buildingId);
  const unit = dataset.units.find((record) => record.id === draft.unitId);
  const entity = building ? dataset.entities.find((record) => record.id === building.entityId) : undefined;

  issues.push(requiredIssue(building?.id, 'building', 'Choose a building.'));
  issues.push(requiredIssue(unit?.id, 'unit', 'Choose a unit.'));
  if (unit && unit.buildingId !== draft.buildingId) {
    issues.push({ id: 'unit-building', fieldId: 'unit', message: 'The selected unit does not belong to this building.' });
  }
  if (building && !entity) {
    issues.push({ id: 'building-entity', fieldId: 'building', message: 'This building does not have a leasing entity assigned. Set one in Manage → Buildings.', manageTarget: { section: 'buildings', recordId: building.id } });
  }
  if (!draft.tenants.some((value) => value.trim())) {
    issues.push({ id: 'tenant', fieldId: 'tenant-0', message: 'Enter at least one tenant name.' });
  }
  draft.tenants.forEach((value, index) => {
    if (!value.trim()) issues.push({ id: `tenant-${index}`, fieldId: `tenant-${index}`, message: `Tenant ${index + 1} cannot be blank.` });
  });
  if (!ISO_DATE.test(draft.startDate)) {
    issues.push({ id: 'start-date', fieldId: 'start-date', message: 'Choose a valid start date.' });
  }
  if (draft.termType === 'fixed') {
    if (!Number.isInteger(draft.fixedTermMonths) || draft.fixedTermMonths < 1) {
      issues.push({ id: 'term-months', fieldId: 'term-months', message: 'Enter a fixed term of at least one month.' });
    }
    if (!ISO_DATE.test(draft.endDate)) {
      issues.push({ id: 'end-date', fieldId: 'end-date', message: 'Choose a valid end date.' });
    } else if (ISO_DATE.test(draft.startDate) && draft.endDate < draft.startDate) {
      issues.push({ id: 'end-before-start', fieldId: 'end-date', message: 'End Date cannot precede Start Date.' });
    }
  }
  if (draft.rentalRate === null || !Number.isFinite(draft.rentalRate) || draft.rentalRate <= 0) {
    issues.push({ id: 'rent', fieldId: 'rental-rate', message: 'Enter a rental rate greater than zero.' });
  }
  const deposit = effectiveDepositAmount(draft);
  if (deposit === null || !Number.isFinite(deposit) || deposit < 0) {
    issues.push({ id: 'deposit', fieldId: 'deposit-other', message: 'Enter a valid damage deposit.' });
  }
  if (draft.inclusionConfigurationState === 'unknown' || draft.responsibilityConfigurationState === 'unknown') {
    issues.push({
      id: 'terms-unknown',
      fieldId: 'lease-terms',
      message: 'Configure rent inclusions and tenant responsibilities before generating this lease.',
      manageTarget: unit ? { section: 'units', recordId: unit.id } : undefined,
    });
  }
  const responsibilityCount = draft.tenantResponsibilityOptionIds.length + draft.additionalResponsibilityTexts.length;
  if (responsibilityCount > 3) {
    issues.push({ id: 'responsibility-overflow', fieldId: 'lease-terms', message: 'The Form 1 has room for at most three tenant-responsibility lines.' });
  }

  if (unit) {
    const manageTarget = { section: 'units' as const, recordId: unit.id };
    issues.push(requiredIssue(unit.premisesStreetAddress, 'unit', 'Add the premises street address in Manage.', manageTarget));
    if (!PREMISES_TYPES.has(unit.premisesType as PremisesType)) {
      issues.push({ id: 'premises-type', fieldId: 'unit', message: 'Choose a premises type in Manage.', manageTarget });
    }
  }
  if (building) {
    const manageTarget = { section: 'buildings' as const, recordId: building.id };
    issues.push(requiredIssue(building.community, 'building', 'Add the building community in Manage.', manageTarget));
    issues.push(requiredIssue(building.postalCode, 'building', 'Add the building postal code in Manage.', manageTarget));
  }
  if (entity) {
    const manageTarget = { section: 'entities' as const, recordId: entity.id };
    issues.push(requiredIssue(entity.legalName, 'entity', 'Add the entity legal name in Manage.', manageTarget));
    issues.push(requiredIssue(entity.addressForService, 'entity', 'Add the entity service address in Manage.', manageTarget));
    issues.push(requiredIssue(entity.community, 'entity', 'Add the entity community in Manage.', manageTarget));
    issues.push(requiredIssue(entity.postalCode, 'entity', 'Add the entity postal code in Manage.', manageTarget));
    issues.push(requiredIssue(entity.phone, 'entity', 'Add the entity phone number in Manage.', manageTarget));
    issues.push(requiredIssue(entity.rentPaymentRecipient, 'entity', 'Add the rent-payment recipient in Manage.', manageTarget));
    issues.push(requiredIssue(entity.rentPaymentAddress, 'entity', 'Add the rent-payment address in Manage.', manageTarget));
  }
  return issues.filter((issue): issue is LeaseValidationIssue => Boolean(issue));
}

export function toLeasePdfInput(
  dataset: LeaseDataset,
  draft: LeaseDraft,
  agreementDate = todayLocal(),
): LeasePdfInput {
  const issues = validateLeaseDraft(dataset, draft);
  if (issues.length) throw new Error(issues[0].message);
  const unit = dataset.units.find((record) => record.id === draft.unitId) as Unit;
  const building = dataset.buildings.find((record) => record.id === unit.buildingId)!;
  const entity = dataset.entities.find((record) => record.id === building.entityId) as Entity;
  const selectedIncluded = draft.includedOptionIds
    .map((id) => dataset.standardOptions.find((option) => option.id === id))
    .filter((option) => option?.active);
  const selectedResponsibilities = draft.tenantResponsibilityOptionIds
    .map((id) => dataset.standardOptions.find((option) => option.id === id))
    .filter((option) => option?.active);
  const builtIn = selectedIncluded
    .filter((option) => option?.category === 'included_standard' && option.systemKey)
    .map((option) => option?.systemKey as InclusionKey);
  const otherIncluded = [
    ...selectedIncluded.filter((option) => option?.category === 'included_other').map((option) => option?.pdfText ?? ''),
    ...draft.additionalIncludedTexts,
  ].filter(Boolean);
  const responsibilities = [
    ...selectedResponsibilities.map((option) => option?.pdfText ?? ''),
    ...draft.additionalResponsibilityTexts,
  ].filter(Boolean);
  const depositAmount = effectiveDepositAmount(draft) as number;

  return {
    agreementDate,
    tenantNames: draft.tenants.map((value) => value.trim().replace(/\s{2,}/gu, ' ')),
    lessor: {
      legalName: entity.legalName,
      street: entity.addressForService,
      community: entity.community,
      province: entity.province,
      postalCode: entity.postalCode,
      phone: entity.phone,
    },
    premises: {
      displayName: unit.displayName,
      street: unit.premisesStreetAddress,
      community: building?.community ?? unit.premisesCommunity,
      province: building?.province ?? 'PE',
      postalCode: building?.postalCode ?? unit.premisesPostalCode,
      type: unit.premisesType as PremisesType,
    },
    term: draft.termType === 'fixed'
      ? { type: 'fixed', startDate: draft.startDate, durationMonths: draft.fixedTermMonths, endDate: draft.endDate }
      : { type: 'start_only', startDate: draft.startDate },
    rent: {
      amount: draft.rentalRate as number,
      period: unit.rentPeriod === 'Week' ? 'Week' : 'Month',
      dueDay: unit.rentDueDay,
      paymentRecipient: entity.rentPaymentRecipient,
      paymentInstructions: entity.rentPaymentInstructions,
      paymentAddress: entity.rentPaymentAddress,
    },
    included: builtIn,
    includedOtherText: otherIncluded.join('; '),
    tenantResponsibilities: responsibilities,
    deposit: { required: true, amount: depositAmount },
  };
}

export function recalculateEndDate(startDate: string, months: number): string {
  if (!ISO_DATE.test(startDate) || !Number.isInteger(months) || months < 1) return '';
  return calculateFixedTermEndDate(startDate, months);
}
