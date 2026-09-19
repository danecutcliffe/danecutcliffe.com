import {
  PDFDocument,
  PDFTextField,
  StandardFonts,
  type PDFFont,
} from 'pdf-lib';

export const LEASE_TEMPLATE_FIELD_COUNT = 69;
export const DEFAULT_TEMPLATE_URL = '/templates/generated/lease-template.pdf';
export const DEFAULT_MANIFEST_URL = '/templates/generated/template-manifest.json';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const REQUIRED_FIELD_NAMES = [
  'agreementDateDay',
  'agreementDateMonth',
  'agreementDateYear',
  'lessorLegalName',
  'lessorServiceStreet',
  'lessorServiceCommunity',
  'lessorServicePostalCode',
  'lessorPhone',
  'tenantNamesLine1',
  'tenantNamesLine2',
  'premisesTypeApartment',
  'premisesTypeSingleFamilyHome',
  'premisesTypeMobileHome',
  'premisesTypeRoom',
  'premisesTypeDuplexOrRowHousing',
  'premisesTypeMobileHomeSite',
  'premisesStreetAddress',
  'premisesCommunity',
  'premisesPostalCode',
  'propertyManagerName',
  'propertyManagerStreet',
  'propertyManagerCommunity',
  'propertyManagerPostalCode',
  'propertyManagerPhone',
  'termStartDay',
  'termStartMonth',
  'termStartYear',
  'fixedTermStartDay',
  'fixedTermStartMonth',
  'fixedTermStartYear',
  'fixedTermEndDay',
  'fixedTermEndMonth',
  'fixedTermEndYear',
  'rentPeriod',
  'rentalRate',
  'rentDueDay',
  'rentDuePeriod',
  'rentPaymentRecipientAndInstructions',
  'rentPaymentAddress',
  'includedElectricity',
  'includedHeat',
  'includedHotWater',
  'includedWater',
  'includedCookingStove',
  'includedRefrigerator',
  'includedWasherDryerFree',
  'includedWasherDryerCoin',
  'includedCableHookup',
  'includedCableService',
  'includedJanitorialCommonAreas',
  'includedParking',
  'includedSnowRemoval',
  'includedGrassCutting',
  'includedOtherMark',
  'includedOtherText',
  'tenantResponsibilityNone',
  'tenantResponsibilityOther',
  'tenantResponsibilityLine1',
  'tenantResponsibilityLine2',
  'tenantResponsibilityLine3',
  'depositNotRequired',
  'depositRequired',
  'depositAmount',
  'lessorSignature',
  'witnessSignature1',
  'lesseeSignature1',
  'witnessSignature2',
  'lesseeSignature2',
  'witnessSignature3',
] as const;

const PREMISES_TYPE_FIELDS = {
  apartment: 'premisesTypeApartment',
  single_family_home: 'premisesTypeSingleFamilyHome',
  mobile_home: 'premisesTypeMobileHome',
  room: 'premisesTypeRoom',
  duplex_or_row_housing: 'premisesTypeDuplexOrRowHousing',
  mobile_home_site: 'premisesTypeMobileHomeSite',
} as const;

const INCLUSION_FIELDS = {
  electricity: 'includedElectricity',
  heat: 'includedHeat',
  hot_water: 'includedHotWater',
  water: 'includedWater',
  cooking_stove: 'includedCookingStove',
  refrigerator: 'includedRefrigerator',
  washer_dryer_free: 'includedWasherDryerFree',
  washer_dryer_coin: 'includedWasherDryerCoin',
  cable_hookup: 'includedCableHookup',
  cable_service: 'includedCableService',
  janitorial_common_areas: 'includedJanitorialCommonAreas',
  parking: 'includedParking',
  snow_removal: 'includedSnowRemoval',
  grass_cutting: 'includedGrassCutting',
} as const;

export type PremisesType = keyof typeof PREMISES_TYPE_FIELDS;
export type InclusionKey = keyof typeof INCLUSION_FIELDS;
export type RentPeriod = 'Week' | 'Month';

export interface LeaseTemplateFieldSpec {
  semanticName: string;
  originalName: string;
  page: number;
  fieldType: 'text';
  widgetRectangle: [number, number, number, number];
  width: number;
  height: number;
  font: 'Helvetica';
  fontSize: number;
  alignment: number;
  multiline: boolean;
  maxLength: number | null;
  flags: number;
  sourceDefaultAppearance?: string;
  sourceAppearanceFontSize?: number | null;
}

export interface LeaseTemplateManifest {
  manifestVersion: number;
  normalizerVersion: number;
  sourceSha256: string;
  templateSha256: string;
  pageCount: number;
  fieldCount: number;
  selectionMarkGroups: {
    standard: {
      value: string;
      font: 'Helvetica';
      fontSize: number;
    };
  };
  fields: LeaseTemplateFieldSpec[];
}

export interface LeaseAddress {
  street: string;
  community: string;
  province?: string;
  postalCode: string;
}

export interface LeasePdfInput {
  agreementDate: string;
  tenantNames: string[];
  lessor: LeaseAddress & {
    legalName: string;
    phone: string;
  };
  premises: LeaseAddress & {
    displayName: string;
    type: PremisesType;
  };
  propertyManager?: LeaseAddress & {
    name: string;
    phone: string;
  };
  term:
    | {
        type: 'start_only';
        startDate: string;
      }
    | {
        type: 'fixed';
        startDate: string;
        durationMonths: number;
        endDate?: string;
      };
  rent: {
    amount: number;
    period: RentPeriod;
    dueDay: number | string;
    paymentRecipient: string;
    paymentInstructions?: string;
    paymentAddress: string;
  };
  included: InclusionKey[];
  includedOtherText?: string;
  tenantResponsibilities: string[];
  deposit:
    | { required: false }
    | { required: true; amount?: number };
  signatures?: Partial<{
    lessor: string;
    witness1: string;
    lessee1: string;
    witness2: string;
    lessee2: string;
    witness3: string;
  }>;
}

export interface LeasePdfAssets {
  templateBytes: Uint8Array;
  manifest: LeaseTemplateManifest;
}

export interface GeneratedLeasePdf {
  bytes: Uint8Array;
  filename: string;
  fieldValues: Record<string, string>;
}

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class LeasePdfError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class LeasePdfValidationError extends LeasePdfError {
  constructor(message: string, options?: ErrorOptions) {
    super('LEASE_PDF_VALIDATION', message, options);
  }
}

export class LeasePdfEncodingError extends LeasePdfError {
  readonly fieldName: string;

  constructor(fieldName: string, value: string, cause: unknown) {
    super(
      'LEASE_PDF_ENCODING',
      `The value for "${fieldName}" contains a character that native Helvetica cannot encode: ${JSON.stringify(value)}.`,
      cause instanceof Error ? { cause } : undefined,
    );
    this.fieldName = fieldName;
  }
}

export class LeasePdfOverflowError extends LeasePdfError {
  readonly fieldName: string;
  readonly measuredWidth: number;
  readonly availableWidth: number;

  constructor(fieldName: string, measuredWidth: number, availableWidth: number) {
    super(
      'LEASE_PDF_OVERFLOW',
      `The value for "${fieldName}" is ${measuredWidth.toFixed(2)} pt wide, exceeding the available ${availableWidth.toFixed(2)} pt.`,
    );
    this.fieldName = fieldName;
    this.measuredWidth = measuredWidth;
    this.availableWidth = availableWidth;
  }
}

export class LeasePdfTemplateError extends LeasePdfError {
  constructor(message: string, options?: ErrorOptions) {
    super('LEASE_PDF_TEMPLATE', message, options);
  }
}

function normalizeSingleLine(value: string, label: string): string {
  const normalized = value.trim();
  if (/[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new LeasePdfValidationError(`${label} must be a single line without control characters.`);
  }
  return normalized;
}

function parseIsoDate(isoDate: string, label = 'Date'): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(isoDate);
  if (!match) {
    throw new LeasePdfValidationError(`${label} must use YYYY-MM-DD format.`);
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, monthIndex, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day
  ) {
    throw new LeasePdfValidationError(`${label} is not a valid calendar date.`);
  }
  return date;
}

function toIsoDate(date: Date): string {
  return [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Returns the inclusive end date for a fixed term. The exclusive anniversary is
 * calculated by adding calendar months with end-of-month clamping, then one day
 * is subtracted. This avoids JavaScript's native date rollover ambiguity.
 */
export function calculateFixedTermEndDate(
  startDate: string,
  durationMonths: number,
): string {
  if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 1_200) {
    throw new LeasePdfValidationError('Fixed-term duration must be an integer from 1 to 1200 months.');
  }
  const start = parseIsoDate(startDate, 'Fixed-term start date');
  const rawMonth = start.getUTCMonth() + durationMonths;
  const targetYear = start.getUTCFullYear() + Math.floor(rawMonth / 12);
  const targetMonth = ((rawMonth % 12) + 12) % 12;
  const anniversaryDay = Math.min(
    start.getUTCDate(),
    daysInMonth(targetYear, targetMonth),
  );
  const exclusiveEnd = new Date(Date.UTC(targetYear, targetMonth, anniversaryDay));
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() - 1);
  return toIsoDate(exclusiveEnd);
}

export function formatOrdinalDay(day: number | string): string {
  const raw = typeof day === 'number' ? String(day) : day.trim();
  const match = /^(\d{1,2})(?:st|nd|rd|th)?$/iu.exec(raw);
  if (!match) {
    throw new LeasePdfValidationError(`Rent due day must be a day from 1 to 31, received ${JSON.stringify(day)}.`);
  }
  const value = Number(match[1]);
  if (value < 1 || value > 31) {
    throw new LeasePdfValidationError(`Rent due day must be a day from 1 to 31, received ${JSON.stringify(day)}.`);
  }
  const remainder100 = value % 100;
  const suffix = remainder100 >= 11 && remainder100 <= 13
    ? 'th'
    : value % 10 === 1
      ? 'st'
      : value % 10 === 2
        ? 'nd'
        : value % 10 === 3
          ? 'rd'
          : 'th';
  return `${value}${suffix}`;
}

export function formatMoneyForLease(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new LeasePdfValidationError('Money amounts must be finite and non-negative.');
  }
  const cents = Math.round(amount * 100);
  if (Math.abs(amount * 100 - cents) > 1e-7) {
    throw new LeasePdfValidationError('Money amounts may have at most two decimal places.');
  }
  const dollars = Math.floor(cents / 100);
  const centsPart = cents % 100;
  const whole = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
  return centsPart === 0 ? whole : `${whole}.${String(centsPart).padStart(2, '0')}`;
}

function formatDateParts(isoDate: string, label: string): {
  day: string;
  month: string;
  year: string;
} {
  const date = parseIsoDate(isoDate, label);
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2099) {
    throw new LeasePdfValidationError(`${label} must fall between 2000 and 2099 because the form prints the century as 20.`);
  }
  return {
    day: formatOrdinalDay(date.getUTCDate()),
    month: MONTH_NAMES[date.getUTCMonth()],
    year: String(year).slice(-2),
  };
}

function formatCommunityProvince(community: string, province?: string): string {
  const parts = [community.trim(), province?.trim()].filter(Boolean);
  return parts.join(', ');
}

function combinePaymentRecipientAndInstructions(
  recipient: string,
  instructions?: string,
): string {
  return [recipient.trim(), instructions?.trim()].filter(Boolean).join(' - ');
}

function validateManifest(manifest: LeaseTemplateManifest): Map<string, LeaseTemplateFieldSpec> {
  if (manifest.manifestVersion !== 1 || manifest.normalizerVersion !== 1) {
    throw new LeasePdfTemplateError(
      `Unsupported lease template manifest ${manifest.manifestVersion}/${manifest.normalizerVersion}.`,
    );
  }
  if (manifest.pageCount !== 7 || manifest.fieldCount !== LEASE_TEMPLATE_FIELD_COUNT) {
    throw new LeasePdfTemplateError(
      `Expected a 7-page, ${LEASE_TEMPLATE_FIELD_COUNT}-field lease template manifest.`,
    );
  }
  if (!/^[a-f0-9]{64}$/u.test(manifest.templateSha256)) {
    throw new LeasePdfTemplateError('Template manifest has an invalid SHA-256 fingerprint.');
  }
  if (manifest.fields.length !== manifest.fieldCount) {
    throw new LeasePdfTemplateError('Template manifest field count does not match its field list.');
  }
  const specs = new Map<string, LeaseTemplateFieldSpec>();
  for (const spec of manifest.fields) {
    if (spec.fieldType !== 'text' || spec.font !== 'Helvetica') {
      throw new LeasePdfTemplateError(`Unsupported field type or font for ${spec.semanticName}.`);
    }
    if (!Number.isFinite(spec.fontSize) || spec.fontSize <= 0) {
      throw new LeasePdfTemplateError(`Field ${spec.semanticName} must have an explicit positive font size.`);
    }
    if (specs.has(spec.semanticName)) {
      throw new LeasePdfTemplateError(`Duplicate field ${spec.semanticName} in template manifest.`);
    }
    specs.set(spec.semanticName, spec);
  }
  for (const fieldName of REQUIRED_FIELD_NAMES) {
    if (!specs.has(fieldName)) {
      throw new LeasePdfTemplateError(`Template manifest is missing required field ${fieldName}.`);
    }
  }
  return specs;
}

function initializeAllFieldValues(manifest: LeaseTemplateManifest): Record<string, string> {
  return Object.fromEntries(manifest.fields.map(({ semanticName }) => [semanticName, '']));
}

export function splitTenantNames(
  tenantNames: string[],
  measureWidth?: (value: string) => number,
  firstLineMaximumWidth?: number,
  secondLineMaximumWidth = firstLineMaximumWidth,
): [string, string] {
  const names = tenantNames.map((name, index) => normalizeSingleLine(name, `Tenant ${index + 1} name`));
  if (names.some((name) => !name)) {
    throw new LeasePdfValidationError('Tenant names cannot be blank.');
  }
  if (names.length < 1) {
    throw new LeasePdfValidationError('At least one tenant name is required.');
  }
  if (!measureWidth || firstLineMaximumWidth === undefined || secondLineMaximumWidth === undefined) {
    return [names.join(', '), ''];
  }

  const fitsFirst = (value: string) => measureWidth(value) <= firstLineMaximumWidth;
  const fitsSecond = (value: string) => measureWidth(value) <= secondLineMaximumWidth;
  let firstLine = '';
  let secondLine = '';
  let onSecondLine = false;

  for (const name of names) {
    if (!onSecondLine) {
      const candidate = firstLine ? `${firstLine}, ${name}` : name;
      if (fitsFirst(candidate)) {
        firstLine = candidate;
        continue;
      }
      if (!firstLine) {
        throw new LeasePdfOverflowError('tenantNamesLine1', measureWidth(name), firstLineMaximumWidth);
      }
      const punctuated = `${firstLine},`;
      if (fitsFirst(punctuated)) firstLine = punctuated;
      onSecondLine = true;
    }

    const candidate = secondLine ? `${secondLine}, ${name}` : name;
    if (!fitsSecond(candidate)) {
      throw new LeasePdfOverflowError('tenantNamesLine2', measureWidth(candidate), secondLineMaximumWidth);
    }
    secondLine = candidate;
  }
  return [firstLine, secondLine];
}

export function buildLeaseFieldValues(
  input: LeasePdfInput,
  manifest: LeaseTemplateManifest,
  tenantLines?: [string, string],
): Record<string, string> {
  validateManifest(manifest);
  const values = initializeAllFieldValues(manifest);
  const mark = manifest.selectionMarkGroups.standard.value;
  const agreement = formatDateParts(input.agreementDate, 'Agreement date');
  const start = formatDateParts(input.term.startDate, 'Term start date');
  const names = tenantLines ?? splitTenantNames(input.tenantNames);

  Object.assign(values, {
    agreementDateDay: agreement.day,
    agreementDateMonth: agreement.month,
    agreementDateYear: agreement.year,
    lessorLegalName: normalizeSingleLine(input.lessor.legalName, 'Lessor legal name'),
    lessorServiceStreet: normalizeSingleLine(input.lessor.street, 'Lessor service address'),
    lessorServiceCommunity: formatCommunityProvince(input.lessor.community, input.lessor.province),
    lessorServicePostalCode: normalizeSingleLine(input.lessor.postalCode, 'Lessor postal code'),
    lessorPhone: normalizeSingleLine(input.lessor.phone, 'Lessor phone'),
    tenantNamesLine1: names[0],
    tenantNamesLine2: names[1],
    premisesStreetAddress: normalizeSingleLine(input.premises.street, 'Premises address'),
    premisesCommunity: formatCommunityProvince(input.premises.community, input.premises.province),
    premisesPostalCode: normalizeSingleLine(input.premises.postalCode, 'Premises postal code'),
    rentalRate: formatMoneyForLease(input.rent.amount),
    rentPeriod: input.rent.period,
    rentDueDay: formatOrdinalDay(input.rent.dueDay),
    rentDuePeriod: input.rent.period,
    rentPaymentRecipientAndInstructions: combinePaymentRecipientAndInstructions(
      normalizeSingleLine(input.rent.paymentRecipient, 'Rent payment recipient'),
      input.rent.paymentInstructions
        ? normalizeSingleLine(input.rent.paymentInstructions, 'Rent payment instructions')
        : undefined,
    ),
    rentPaymentAddress: normalizeSingleLine(input.rent.paymentAddress, 'Rent payment address'),
  });

  values[PREMISES_TYPE_FIELDS[input.premises.type]] = mark;

  if (input.propertyManager) {
    Object.assign(values, {
      propertyManagerName: normalizeSingleLine(input.propertyManager.name, 'Property manager name'),
      propertyManagerStreet: normalizeSingleLine(input.propertyManager.street, 'Property manager address'),
      propertyManagerCommunity: formatCommunityProvince(
        input.propertyManager.community,
        input.propertyManager.province,
      ),
      propertyManagerPostalCode: normalizeSingleLine(
        input.propertyManager.postalCode,
        'Property manager postal code',
      ),
      propertyManagerPhone: normalizeSingleLine(input.propertyManager.phone, 'Property manager phone'),
    });
  }

  if (input.term.type === 'start_only') {
    Object.assign(values, {
      termStartDay: start.day,
      termStartMonth: start.month,
      termStartYear: start.year,
    });
  } else {
    const end = formatDateParts(
      input.term.endDate ?? calculateFixedTermEndDate(input.term.startDate, input.term.durationMonths),
      'Fixed-term end date',
    );
    if (parseIsoDate(input.term.endDate ?? calculateFixedTermEndDate(input.term.startDate, input.term.durationMonths), 'Fixed-term end date') < parseIsoDate(input.term.startDate, 'Fixed-term start date')) {
      throw new LeasePdfValidationError('Fixed-term end date cannot precede the start date.');
    }
    Object.assign(values, {
      fixedTermStartDay: start.day,
      fixedTermStartMonth: start.month,
      fixedTermStartYear: start.year,
      fixedTermEndDay: end.day,
      fixedTermEndMonth: end.month,
      fixedTermEndYear: end.year,
    });
  }

  const uniqueInclusions = new Set(input.included);
  if (uniqueInclusions.has('washer_dryer_free') && uniqueInclusions.has('washer_dryer_coin')) {
    throw new LeasePdfValidationError('Choose only one washer and dryer inclusion.');
  }
  for (const inclusion of uniqueInclusions) {
    const fieldName = INCLUSION_FIELDS[inclusion];
    if (!fieldName) {
      throw new LeasePdfValidationError(`Unknown rent inclusion ${JSON.stringify(inclusion)}.`);
    }
    values[fieldName] = mark;
  }
  if (input.includedOtherText?.trim()) {
    values.includedOtherMark = mark;
    values.includedOtherText = normalizeSingleLine(input.includedOtherText, 'Other rent inclusion');
  }

  if (input.tenantResponsibilities.length === 0) {
    values.tenantResponsibilityNone = mark;
  } else {
    if (input.tenantResponsibilities.length > 3) {
      throw new LeasePdfValidationError('The standard lease supports at most three tenant-responsibility lines.');
    }
    values.tenantResponsibilityOther = mark;
    input.tenantResponsibilities.forEach((line, index) => {
      values[`tenantResponsibilityLine${index + 1}`] = normalizeSingleLine(
        line,
        `Tenant responsibility ${index + 1}`,
      );
    });
  }

  if (input.deposit.required) {
    values.depositRequired = mark;
    values.depositAmount = formatMoneyForLease(input.deposit.amount ?? input.rent.amount);
  } else {
    values.depositNotRequired = mark;
  }

  const signatures = input.signatures;
  if (signatures) {
    values.lessorSignature = normalizeSingleLine(signatures.lessor ?? '', 'Lessor signature');
    values.witnessSignature1 = normalizeSingleLine(signatures.witness1 ?? '', 'Witness 1 signature');
    values.lesseeSignature1 = normalizeSingleLine(signatures.lessee1 ?? '', 'Lessee 1 signature');
    values.witnessSignature2 = normalizeSingleLine(signatures.witness2 ?? '', 'Witness 2 signature');
    values.lesseeSignature2 = normalizeSingleLine(signatures.lessee2 ?? '', 'Lessee 2 signature');
    values.witnessSignature3 = normalizeSingleLine(signatures.witness3 ?? '', 'Witness 3 signature');
  }

  if (Object.keys(values).length !== manifest.fieldCount) {
    throw new LeasePdfTemplateError('Generated field map is not total for the template manifest.');
  }
  return values;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new LeasePdfTemplateError('Web Crypto is required to validate the lease template fingerprint.');
  }
  const digest = await subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

function assertFieldValueFits(
  fieldName: string,
  value: string,
  spec: LeaseTemplateFieldSpec,
  font: PDFFont,
): void {
  if (!value) return;
  try {
    font.encodeText(value);
  } catch (error) {
    throw new LeasePdfEncodingError(fieldName, value, error);
  }
  const availableWidth = Math.max(0, spec.width - 4);
  const measuredWidth = font.widthOfTextAtSize(value, spec.fontSize);
  if (measuredWidth > availableWidth + 0.01) {
    throw new LeasePdfOverflowError(fieldName, measuredWidth, availableWidth);
  }
}

function slugPart(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/['’]/gu, '')
    .replace(/[^A-Za-z0-9-]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .replace(/_{2,}/gu, '_');
}

export function buildLeaseDownloadFilename(input: Pick<LeasePdfInput, 'premises' | 'tenantNames' | 'term'>): string {
  const date = input.term.startDate.replaceAll('-', '');
  parseIsoDate(input.term.startDate, 'Term start date');
  const premises = slugPart(input.premises.displayName || input.premises.street) || 'Premises';
  const tenants = slugPart(input.tenantNames.join('_')) || 'Tenant';
  const basename = `Lease_${premises}_${tenants}_${date}`.slice(0, 180).replace(/_+$/u, '');
  return `${basename}.pdf`;
}

export async function loadLeasePdfAssets(
  fetcher: FetchLike = globalThis.fetch.bind(globalThis),
  urls: { templateUrl?: string; manifestUrl?: string } = {},
): Promise<LeasePdfAssets> {
  const templateUrl = urls.templateUrl ?? DEFAULT_TEMPLATE_URL;
  const manifestUrl = urls.manifestUrl ?? DEFAULT_MANIFEST_URL;
  const [templateResponse, manifestResponse] = await Promise.all([
    fetcher(templateUrl),
    fetcher(manifestUrl),
  ]);
  if (!templateResponse.ok) {
    throw new LeasePdfTemplateError(`Unable to load lease template (${templateResponse.status}).`);
  }
  if (!manifestResponse.ok) {
    throw new LeasePdfTemplateError(`Unable to load lease template manifest (${manifestResponse.status}).`);
  }
  let manifest: LeaseTemplateManifest;
  try {
    manifest = await manifestResponse.json() as LeaseTemplateManifest;
  } catch (error) {
    throw new LeasePdfTemplateError('Lease template manifest is not valid JSON.', { cause: error });
  }
  validateManifest(manifest);
  return {
    templateBytes: new Uint8Array(await templateResponse.arrayBuffer()),
    manifest,
  };
}

export async function generateLeasePdf(
  input: LeasePdfInput,
  assets: LeasePdfAssets,
): Promise<GeneratedLeasePdf> {
  const specs = validateManifest(assets.manifest);
  const actualHash = await sha256Hex(assets.templateBytes);
  if (actualHash !== assets.manifest.templateSha256) {
    throw new LeasePdfTemplateError(
      `Lease template fingerprint mismatch: expected ${assets.manifest.templateSha256}, received ${actualHash}.`,
    );
  }

  let document: PDFDocument;
  try {
    document = await PDFDocument.load(assets.templateBytes, { updateMetadata: false });
  } catch (error) {
    throw new LeasePdfTemplateError('Unable to parse the normalized lease template.', { cause: error });
  }
  if (document.getPageCount() !== assets.manifest.pageCount) {
    throw new LeasePdfTemplateError('Lease template page count does not match the manifest.');
  }

  const form = document.getForm();
  const fields = form.getFields();
  const actualNames = new Set(fields.map((field) => field.getName()));
  const expectedNames = new Set(assets.manifest.fields.map((field) => field.semanticName));
  if (
    fields.length !== assets.manifest.fieldCount ||
    actualNames.size !== expectedNames.size ||
    [...expectedNames].some((name) => !actualNames.has(name))
  ) {
    throw new LeasePdfTemplateError('Lease template fields do not match the normalized manifest.');
  }
  if (fields.some((field) => !(field instanceof PDFTextField))) {
    throw new LeasePdfTemplateError('Normalized lease template must contain text fields only.');
  }

  const font = await document.embedFont(StandardFonts.Helvetica);
  const tenantSpec = specs.get('tenantNamesLine1');
  const tenantSecondSpec = specs.get('tenantNamesLine2');
  if (!tenantSpec || !tenantSecondSpec) throw new LeasePdfTemplateError('Tenant name field specification is missing.');
  for (const tenantName of input.tenantNames) {
    try {
      font.encodeText(tenantName);
    } catch (error) {
      throw new LeasePdfEncodingError('tenantNames', tenantName, error);
    }
  }
  const tenantLines = splitTenantNames(
    input.tenantNames,
    (value) => font.widthOfTextAtSize(value, tenantSpec.fontSize),
    tenantSpec.width - 4,
    tenantSecondSpec.width - 4,
  );
  const values = buildLeaseFieldValues(input, assets.manifest, tenantLines);

  for (const spec of assets.manifest.fields) {
    const value = values[spec.semanticName];
    if (typeof value !== 'string') {
      throw new LeasePdfTemplateError(`No explicit value was provided for field ${spec.semanticName}.`);
    }
    assertFieldValueFits(spec.semanticName, value, spec, font);
    const field = form.getTextField(spec.semanticName);
    field.setFontSize(spec.fontSize);
    field.setText(value);
  }

  form.updateFieldAppearances(font);
  const bytes = await document.save({
    updateFieldAppearances: false,
    useObjectStreams: true,
  });
  return {
    bytes,
    filename: buildLeaseDownloadFilename(input),
    fieldValues: values,
  };
}
