import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { createInMemoryAdapters } from '../src/adapters';
import type { LeaseDataset } from '../src/domain';
import { generateLeasePdf, loadLeasePdfAssets } from '../src/lib/leasePdf';
import { toLeasePdfInput } from '../src/lib/leaseForm';

const dataset: LeaseDataset = {
  schemaVersion: 1,
  revision: 1,
  entities: [{ id:'entity-example',legalName:'Example Holdings Inc.',addressForService:'1 Main Street',community:'Charlottetown',province:'PE',postalCode:'C1A 1A1',phone:'902-555-0100',rentPaymentRecipient:'Example Holdings Inc.',rentPaymentInstructions:'e-transfer',rentPaymentAddress:'1 Main Street, Charlottetown, PE' }],
  buildings: [{ id:'building-multi',entityId:'entity-example',displayName:'12 Example Street',streetAddress:'12 Example Street',community:'Charlottetown',province:'PE',postalCode:'C1A 1A1' },{ id:'building-single',entityId:'entity-example',displayName:'20 Sample Avenue',streetAddress:'20 Sample Avenue',community:'Charlottetown',province:'PE',postalCode:'C1A 1A2' }],
  units: [
    { id:'unit-example-1',buildingId:'building-multi',entityId:'entity-example',displayName:'1-12 Example',unitNumber:'1',premisesStreetAddress:'1-12 Example Street',premisesCommunity:'Charlottetown',premisesPostalCode:'C1A 1A1',premisesType:'apartment',defaultRentalRate:1930,rentPeriod:'Month',rentDueDay:'1st',includedOptionIds:['option-included-heat','option-included-water','option-included-washer-dryer-no-charge'],tenantResponsibilityOptionIds:['option-waste'],inclusionConfigurationState:'known_populated',responsibilityConfigurationState:'known_populated',recordRevision:1 },
    { id:'unit-example-2',buildingId:'building-multi',entityId:'entity-example',displayName:'2-12 Example',unitNumber:'2',premisesStreetAddress:'2-12 Example Street',premisesCommunity:'Charlottetown',premisesPostalCode:'C1A 1A1',premisesType:'apartment',defaultRentalRate:1960,rentPeriod:'Month',rentDueDay:'1st',includedOptionIds:[],tenantResponsibilityOptionIds:[],inclusionConfigurationState:'unknown',responsibilityConfigurationState:'unknown',recordRevision:1 },
    { id:'unit-sample',buildingId:'building-single',entityId:'entity-example',displayName:'20 Sample Avenue',unitNumber:'',premisesStreetAddress:'20 Sample Avenue',premisesCommunity:'Charlottetown',premisesPostalCode:'C1A 1A2',premisesType:'single_family_home',defaultRentalRate:1500,rentPeriod:'Month',rentDueDay:'1st',includedOptionIds:[],tenantResponsibilityOptionIds:[],inclusionConfigurationState:'known_empty',responsibilityConfigurationState:'known_empty',recordRevision:1 },
  ],
  standardOptions: [
    { id:'option-included-heat',category:'included_standard',label:'Heat',pdfText:'Heat',active:true,systemKey:'heat',recordRevision:1 },
    { id:'option-included-water',category:'included_standard',label:'Water',pdfText:'Water',active:true,systemKey:'water',recordRevision:1 },
    { id:'option-included-washer-dryer-no-charge',category:'included_standard',label:'Washer & Dryer (without charge)',pdfText:'Washer & Dryer (without charge)',active:true,systemKey:'washer_dryer_no_charge',recordRevision:1 },
    { id:'option-included-washer-dryer-coin',category:'included_standard',label:'Washer & Dryer (coin operated)',pdfText:'Washer & Dryer (coin operated)',active:true,systemKey:'washer_dryer_coin',recordRevision:1 },
    { id:'option-waste',category:'tenant_responsibility',label:'Waste removal',pdfText:'Waste removal',active:true,recordRevision:1 },
    { id:'option-unused',category:'included_other',label:'Unused custom option',pdfText:'Unused custom option',active:true,recordRevision:1 },
  ],
  globalDefaults: { damageDepositMode:'one_month_rent',rentPeriod:'Month',rentDueDay:'1st' },
};

const adapters = createInMemoryAdapters(dataset, { id:'test-admin',email:'admin@example.test',displayName:'Test Administrator',isAdmin:true,isActive:true });
adapters.pdf.generate = async (draft, currentDataset) => {
  const assets = await loadLeasePdfAssets(undefined, {
    templateUrl: '/lease/templates/generated/lease-template.pdf',
    manifestUrl: '/lease/templates/generated/template-manifest.json',
  });
  const generated = await generateLeasePdf(toLeasePdfInput(currentDataset,draft,'2026-09-19'),assets);
  return { filename:generated.filename,blob:new Blob([generated.bytes as BlobPart],{type:'application/pdf'}) };
};

createRoot(document.getElementById('root')!).render(<StrictMode><App adapters={adapters} /></StrictMode>);
