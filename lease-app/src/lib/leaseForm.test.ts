import { describe, expect, it } from 'vitest';
import type { LeaseDataset } from '../domain';
import {
  draftForSelectedUnit,
  effectiveDepositAmount,
  initialLeaseDraft,
  selectUnitForBuilding,
  toLeasePdfInput,
  unitsForBuilding,
  validateLeaseDraft,
} from './leaseForm';

const dataset: LeaseDataset = {
  schemaVersion: 1,
  revision: 4,
  entities: [{ id:'entity-a',legalName:'Entity A',addressForService:'1 Main',community:'Charlottetown',province:'PE',postalCode:'C1A 1A1',phone:'902-555-0100',rentPaymentRecipient:'Entity A',rentPaymentInstructions:'e-transfer',rentPaymentAddress:'1 Main' }],
  buildings: [{ id:'building-a',displayName:'Building A',streetAddress:'1 Main',community:'Charlottetown',province:'PE',postalCode:'C1A 1A1' },{ id:'building-b',displayName:'Building B',streetAddress:'2 Main',community:'Charlottetown',province:'PE',postalCode:'C1A 1A2' }],
  units: [
    { id:'unit-a1',buildingId:'building-a',displayName:'Unit 1',unitNumber:'1',premisesStreetAddress:'1-1 Main',premisesCommunity:'Charlottetown',premisesPostalCode:'C1A 1A1',premisesType:'apartment',entityId:'entity-a',defaultRentalRate:1930,rentPeriod:'Month',rentDueDay:'1st',includedOptionIds:['option-included-heat'],tenantResponsibilityOptionIds:[],inclusionConfigurationState:'known_populated',responsibilityConfigurationState:'known_empty' },
    { id:'unit-a2',buildingId:'building-a',displayName:'Unit 2',unitNumber:'2',premisesStreetAddress:'2-1 Main',premisesCommunity:'Charlottetown',premisesPostalCode:'C1A 1A1',premisesType:'apartment',entityId:'entity-a',defaultRentalRate:1960,rentPeriod:'Month',rentDueDay:'1st',includedOptionIds:[],tenantResponsibilityOptionIds:[],inclusionConfigurationState:'unknown',responsibilityConfigurationState:'unknown' },
    { id:'unit-b1',buildingId:'building-b',displayName:'Only Unit',unitNumber:'',premisesStreetAddress:'2 Main',premisesCommunity:'Charlottetown',premisesPostalCode:'C1A 1A2',premisesType:'single_family_home',entityId:'entity-a',defaultRentalRate:1500,rentPeriod:'Month',rentDueDay:'1st',includedOptionIds:[],tenantResponsibilityOptionIds:[],inclusionConfigurationState:'known_empty',responsibilityConfigurationState:'known_empty' },
  ],
  standardOptions: [{ id:'option-included-heat',category:'included_standard',label:'Heat',pdfText:'Heat',active:true,systemKey:'heat' }],
  globalDefaults: { damageDepositMode:'one_month_rent',rentPeriod:'Month',rentDueDay:'1st' },
};

describe('Building to Unit behavior', () => {
  it('filters units by Building', () => {
    expect(unitsForBuilding(dataset,'building-a').map((unit) => unit.id)).toEqual(['unit-a1','unit-a2']);
  });
  it('auto-selects a single-Unit Building but not a multi-unit Building', () => {
    expect(selectUnitForBuilding(dataset,'building-b')).toBe('unit-b1');
    expect(selectUnitForBuilding(dataset,'building-a')).toBe('');
  });
  it('preserves an existing valid selection', () => {
    expect(selectUnitForBuilding(dataset,'building-a','unit-a2')).toBe('unit-a2');
  });
});

describe('lease defaults and validation', () => {
  it('prefills rent and terms without mutating the Unit', () => {
    const draft = draftForSelectedUnit(initialLeaseDraft(dataset),dataset.units[0]);
    const changed = { ...draft,rentalRate:1975 };
    expect(draft.rentalRate).toBe(1930);
    expect(changed.rentalRate).toBe(1975);
    expect(dataset.units[0].defaultRentalRate).toBe(1930);
  });
  it('links one-month deposit to current rent and lets Other break the link', () => {
    const draft = { ...draftForSelectedUnit(initialLeaseDraft(dataset),dataset.units[0]),rentalRate:1975 };
    expect(effectiveDepositAmount(draft)).toBe(1975);
    expect(effectiveDepositAmount({ ...draft,depositMode:'other',otherDepositAmount:500 })).toBe(500);
    expect(effectiveDepositAmount({ ...draft,depositMode:'one_month_rent',otherDepositAmount:500 })).toBe(1975);
  });
  it('keeps unknown terms distinct and blocks generation', () => {
    const draft = { ...draftForSelectedUnit(initialLeaseDraft(dataset),dataset.units[1]),tenants:['Tenant'],startDate:'2026-10-01' };
    expect(draft.inclusionConfigurationState).toBe('unknown');
    expect(validateLeaseDraft(dataset,draft).some((issue) => issue.id === 'terms-unknown')).toBe(true);
  });
  it('resolves the Unit Entity and canonical address for PDF input', () => {
    const draft = { ...draftForSelectedUnit(initialLeaseDraft(dataset),dataset.units[0]),tenants:['Tenant'],startDate:'2026-10-01' };
    const input = toLeasePdfInput(dataset,draft,'2026-09-19');
    expect(input.lessor.legalName).toBe('Entity A');
    expect(input.lessor.street).toBe('1 Main');
    expect(input.rent.amount).toBe(1930);
    expect(input.included).toEqual(['heat']);
  });
});
