import { describe, expect, it } from 'vitest';
import manifestJson from '../../public/templates/generated/template-manifest.json';
import {
  LeasePdfOverflowError,
  buildLeaseFieldValues,
  buildLeaseDownloadFilename,
  calculateFixedTermEndDate,
  formatMoneyForLease,
  formatOrdinalDay,
  splitTenantNames,
  type LeasePdfInput,
  type LeaseTemplateManifest,
} from './leasePdf';

const manifest = manifestJson as unknown as LeaseTemplateManifest;
const baseInput: LeasePdfInput = {
  agreementDate: '2026-09-19',
  tenantNames: ['John Smith'],
  lessor: { legalName: 'Example Holdings Inc.', street: '1 Main Street', community: 'Charlottetown', province: 'PE', postalCode: 'C1A 1A1', phone: '902-555-0100' },
  premises: { displayName: '1-12 Orlebar', street: '1-12 Orlebar Street', community: 'Charlottetown', province: 'PE', postalCode: 'C1A 1A1', type: 'apartment' },
  term: { type: 'start_only', startDate: '2026-10-01' },
  rent: { amount: 1930, period: 'Month', dueDay: '1st', paymentRecipient: 'Example Holdings Inc.', paymentInstructions: 'e-transfer', paymentAddress: '1 Main Street' },
  included: ['heat', 'water'],
  tenantResponsibilities: ['Waste removal'],
  deposit: { required: true },
};

describe('calendar and display formatting', () => {
  it('calculates inclusive fixed-term ends without timezone conversion', () => {
    expect(calculateFixedTermEndDate('2026-10-01', 12)).toBe('2027-09-30');
    expect(calculateFixedTermEndDate('2026-01-31', 1)).toBe('2026-02-27');
    expect(calculateFixedTermEndDate('2024-02-29', 12)).toBe('2025-02-27');
  });

  it.each([[11,'11th'],[12,'12th'],[13,'13th'],[21,'21st'],[22,'22nd'],[23,'23rd'],[31,'31st']])('formats %s as %s', (value, expected) => {
    expect(formatOrdinalDay(value)).toBe(expected);
  });

  it('formats whole-dollar and cent amounts without currency symbols', () => {
    expect(formatMoneyForLease(1930)).toBe('1,930');
    expect(formatMoneyForLease(1930.5)).toBe('1,930.50');
  });
});

describe('whole-entry tenant fitting', () => {
  const width = (value: string) => value.length;

  it('joins complete entries with comma-space while they fit', () => {
    expect(splitTenantNames(['John Smith', 'Jane MacDonald'], width, 40, 40)).toEqual(['John Smith, Jane MacDonald', '']);
  });

  it('moves the complete overflowing entry to line two', () => {
    expect(splitTenantNames(['John Smith', 'Jane MacDonald', 'Robert Thompson'], width, 28, 40)).toEqual(['John Smith, Jane MacDonald,', 'Robert Thompson']);
  });

  it('never splits a single tenant entry', () => {
    expect(() => splitTenantNames(['An intentionally very long legal tenant entry'], width, 20, 50)).toThrow(LeasePdfOverflowError);
  });

  it('blocks when the combined second line overflows', () => {
    expect(() => splitTenantNames(['One Tenant', 'Second Tenant', 'Third Tenant'], width, 12, 20)).toThrow(LeasePdfOverflowError);
  });
});

describe('total PDF field mapping', () => {
  it('populates only Start-Only term fields and clears the fixed alternative', () => {
    const values = buildLeaseFieldValues(baseInput, manifest, ['John Smith', '']);
    expect(values.termStartDay).toBe('1st');
    expect(values.termStartMonth).toBe('October');
    expect(values.fixedTermStartDay).toBe('');
    expect(values.fixedTermEndDay).toBe('');
  });

  it('honours a directly edited fixed end date', () => {
    const values = buildLeaseFieldValues({ ...baseInput, term: { type: 'fixed', startDate: '2026-10-01', durationMonths: 12, endDate: '2028-03-15' } }, manifest, ['John Smith', '']);
    expect(values.termStartDay).toBe('');
    expect(values.fixedTermStartDay).toBe('1st');
    expect(values.fixedTermEndDay).toBe('15th');
    expect(values.fixedTermEndMonth).toBe('March');
    expect(values.fixedTermEndYear).toBe('28');
  });

  it('uses one calibrated selection mark for compatible groups', () => {
    const values = buildLeaseFieldValues(baseInput, manifest, ['John Smith', '']);
    const mark = manifest.selectionMarkGroups.standard.value;
    expect(values.premisesTypeApartment).toBe(mark);
    expect(values.includedHeat).toBe(mark);
    expect(values.includedWater).toBe(mark);
    expect(values.depositRequired).toBe(mark);
  });

  it('explicitly maps every field and cannot leak a prior lease', () => {
    const first = buildLeaseFieldValues(baseInput, manifest, ['First Tenant', '']);
    const second = buildLeaseFieldValues({ ...baseInput, tenantNames: ['Second Tenant'], included: [] }, manifest, ['Second Tenant', '']);
    expect(Object.keys(first)).toHaveLength(69);
    expect(Object.keys(second)).toHaveLength(69);
    expect(second.tenantNamesLine1).toBe('Second Tenant');
    expect(second.includedHeat).toBe('');
    expect(second.includedWater).toBe('');
  });

  it('keeps one-month deposit linked to current rent input', () => {
    const values = buildLeaseFieldValues({ ...baseInput, rent: { ...baseInput.rent, amount: 1975 }, deposit: { required: true } }, manifest, ['John Smith', '']);
    expect(values.depositAmount).toBe('1,975');
  });

  it('rejects mutually exclusive laundry options', () => {
    expect(() => buildLeaseFieldValues({ ...baseInput, included: ['washer_dryer_free','washer_dryer_coin'] }, manifest, ['John Smith',''])).toThrow(/only one washer/i);
  });

  it('creates a deterministic sanitized filename', () => {
    expect(buildLeaseDownloadFilename(baseInput)).toBe('Lease_1-12_Orlebar_John_Smith_20261001.pdf');
  });
});
