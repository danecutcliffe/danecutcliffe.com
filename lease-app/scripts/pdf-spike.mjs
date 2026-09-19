import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const repoRoot = path.resolve(appRoot, '..');
const templatePath = path.join(appRoot, 'public/templates/generated/lease-template.pdf');
const manifestPath = path.join(appRoot, 'public/templates/generated/template-manifest.json');
const outputPath = path.join(repoRoot, 'tmp/pdfs/spike/generated-lease.pdf');
const expectedPath = path.join(repoRoot, 'tmp/pdfs/spike/expected-values.json');

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const source = await readFile(templatePath);
const document = await PDFDocument.load(source, { updateMetadata: false });
const form = document.getForm();
const font = await document.embedFont(StandardFonts.Helvetica);
const allNames = new Set(form.getFields().map((field) => field.getName()));
if (allNames.size !== manifest.fieldCount) throw new Error(`Expected ${manifest.fieldCount} fields, found ${allNames.size}.`);

const values = Object.fromEntries(manifest.fields.map(({ semanticName }) => [semanticName, '']));
Object.assign(values, {
  agreementDateDay: '19th',
  agreementDateMonth: 'September',
  agreementDateYear: '26',
  lessorLegalName: 'Red Cedar Properties Inc.',
  lessorServiceStreet: '8-14 Orlebar Street',
  lessorServiceCommunity: 'Charlottetown, PE',
  lessorServicePostalCode: 'C1A 4X5',
  lessorPhone: '(902) 555-0100',
  tenantNamesLine1: 'Ramírez López, Jane MacDonald,',
  tenantNamesLine2: 'Robert Thompson',
  premisesTypeApartment: '     X',
  premisesStreetAddress: '1-12 Orlebar Street',
  premisesCommunity: 'Charlottetown, PE',
  premisesPostalCode: 'C1A 4X5',
  fixedTermStartDay: '1st',
  fixedTermStartMonth: 'October',
  fixedTermStartYear: '26',
  fixedTermEndDay: '30th',
  fixedTermEndMonth: 'September',
  fixedTermEndYear: '27',
  rentalRate: '1,930',
  rentPeriod: 'Month',
  rentDueDay: '1st',
  rentDuePeriod: 'Month',
  rentPaymentRecipientAndInstructions: 'Red Cedar Properties Inc. - e-transfer',
  rentPaymentAddress: '8-14 Orlebar Street, Charlottetown, PE',
  includedHeat: '     X',
  includedWater: '     X',
  includedRefrigerator: '     X',
  tenantResponsibilityOther: '     X',
  tenantResponsibilityLine1: 'Waste removal',
  depositRequired: '     X',
  depositAmount: '1,930',
});

for (const spec of manifest.fields) {
  const field = form.getTextField(spec.semanticName);
  field.setFontSize(spec.fontSize);
  field.setText(values[spec.semanticName]);
}
form.updateFieldAppearances(font);
const bytes = await document.save({ updateFieldAppearances: false, useObjectStreams: true });
await writeFile(outputPath, bytes);
await writeFile(expectedPath, `${JSON.stringify(values, null, 2)}\n`, 'utf8');
console.log(`Generated browser-library spike lease at ${outputPath}.`);
