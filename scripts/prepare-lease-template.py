#!/usr/bin/env python3
"""Normalize the legacy PEI Form 1 without recreating its existing widgets."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, BooleanObject, ByteStringObject, NameObject, NumberObject, TextStringObject

SOURCE_SHA256 = "decc2bd28e387503822fca1d554a0715a0f31088b4e9b0073fd97fc41f8a98ca"
EXPECTED_PAGES = 7
EXPECTED_WIDGETS = 70

FIELD_MAP = {
    "agreementDateDay": "THIS AGREEMENT MADE this",
    "agreementDateMonth": "day of",
    "agreementDateYear": "20 1",
    "lessorLegalName": "20 2",
    "lessorServiceStreet": "Street Address and Post Office Box where applicable",
    "lessorServiceCommunity": "Community",
    "lessorServicePostalCode": "Postal Code",
    "lessorPhone": "Telephone Numbers",
    "tenantNamesLine1": "AND 1",
    "tenantNamesLine2": "AND 2",
    "premisesTypeApartment": "Apartment",
    "premisesTypeSingleFamilyHome": "Single Family Home",
    "premisesTypeRoom": "Room",
    "premisesTypeMobileHome": "Mobile Home",
    "premisesTypeDuplexOrRowHousing": "Portion of Duplex or Row Housing",
    "premisesTypeMobileHomeSite": "Mobile Home Site",
    "premisesStreetAddress": "Street Address and Apartment Number where applicable",
    "premisesCommunity": "Community_2",
    "premisesPostalCode": "Postal Code_2",
    "propertyManagerName": "Name",
    "propertyManagerStreet": "Street Address and Post Office Box where applicable_2",
    "propertyManagerCommunity": "Community_3",
    "propertyManagerPostalCode": "Postal Code_3",
    "propertyManagerPhone": "Telephone Numbers_2",
    "termStartDay": "day of_2",
    "termStartMonth": "undefined",
    "termStartYear": "20",
    "fixedTermStartDay": "day of_3",
    "fixedTermStartMonth": "undefined_2",
    "fixedTermStartYear": "and end on the",
    "fixedTermEndDay": "day of_4",
    "fixedTermEndMonth": "20_2",
    "fixedTermEndYear": "undefined_3",
    "rentalRate": "per",
    "rentPeriod": "WeekMonth",
    "rentDueDay": "day of each",
    "rentDuePeriod": "undefined_4",
    "rentPaymentRecipientAndInstructions": "Name_2",
    "rentPaymentAddress": "Address",
    "includedHeat": "Heat",
    "includedWater": "Water",
    "includedHotWater": "Hot Water",
    "includedElectricity": "Electricity",
    "includedCookingStove": "Cooking Stove",
    "includedRefrigerator": "Refrigerator",
    "includedWasherDryerFree": "Washer  Dryer without charge",
    "includedWasherDryerCoin": "Washer  Dryer coin operated",
    "includedCableHookup": "Cable TV Hookup Apparatus",
    "includedCableService": "Cable TV Service",
    "includedJanitorialCommonAreas": "Janitorial Service for Common Areas",
    "includedParking": "Parking",
    "includedSnowRemoval": "Snow Removal for Parking Lot  Walkways",
    "includedGrassCutting": "Grass Cutting",
    "includedOtherMark": "Other Specify",
    "includedOtherText": "The following services and facilities are the responsibility of the Lessee",
    "tenantResponsibilityNone": "None",
    "tenantResponsibilityOther": "Other Specify_2",
    "tenantResponsibilityLine1": "1",
    "tenantResponsibilityLine2": "2",
    "tenantResponsibilityLine3": "3",
    "depositNotRequired": "A security deposit is not required",
    "depositRequired": "A security deposit in the amount of",
    "depositAmount": "has beenis to be paid by the lessee to the lessor",
    "witnessSignature1": "WITNESS",
    "lessorSignature": "LESSOR",
    "witnessSignature2": "WITNESS_2",
    "lesseeSignature1": "LESSEE",
    "witnessSignature3": "WITNESS_3",
    "lesseeSignature2": "LESSEE_2",
}

FORBIDDEN_LEGACY_VALUE_HASHES = (
    (18, "123e5c20aeb4c14c8d890e0e34fa65831c19401b54efb11be4b8c7cd9058fa40"),
    (20, "639d67ab65c156224fa9557ed0bd7dfb8938d784fbf56b2bfa412473899de34a"),
    (17, "d50a4fad9abe1dc2a217c6d67fb7b3629bb0d48488897c26e5413dc81007aa54"),
    (14, "0e1cd22ee29b2a630e1f3bee619917dada205c5ee9afbad5989e427d0d435b1a"),
    (15, "faeeb18e775090bdc784e5bcfae57d918165b298545413b6e5e42f7f94c55e6e"),
    (14, "6243576fa668deffef3df08be8ef43aba97c1345b665a6b91ad6d845e6dec339"),
    (31, "d7290eaa7628e6855467ab54b921fdcdbca7718f32b075c61e47a8eadb2feb6e"),
)


def contains_forbidden_legacy_value(value: str) -> bool:
    encoded = value.lower().encode("utf-8", errors="ignore")
    for length, forbidden_hash in FORBIDDEN_LEGACY_VALUE_HASHES:
        for index in range(0, len(encoded) - length + 1):
            if hashlib.sha256(encoded[index:index + length]).hexdigest() == forbidden_hash:
                return True
    return False


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dereference(value):
    return value.get_object() if hasattr(value, "get_object") else value


def field_font_size(field) -> tuple[float, float | None]:
    da = str(field.get("/DA", ""))
    match = re.search(r"/Helv\s+([0-9.]+)\s+Tf", da)
    declared = float(match.group(1)) if match else 0.0
    appearance_size = None
    ap = dereference(field.get("/AP", {}))
    normal = dereference(ap.get("/N")) if ap else None
    if normal is not None and hasattr(normal, "get_data"):
        appearance = normal.get_data().decode("latin-1", errors="ignore")
        match = re.search(r"/Helv\s+([0-9.]+)\s+Tf", appearance)
        if match:
            appearance_size = float(match.group(1))
    return declared, appearance_size


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if sha256(args.source) != SOURCE_SHA256:
        raise SystemExit("Source template SHA-256 is incompatible with this normalizer.")

    reader = PdfReader(args.source)
    if len(reader.pages) != EXPECTED_PAGES:
        raise SystemExit(f"Expected {EXPECTED_PAGES} pages; found {len(reader.pages)}.")

    source_widgets = []
    for page_index, page in enumerate(reader.pages):
        for ref in page.get("/Annots", []):
            annotation = dereference(ref)
            if annotation.get("/Subtype") == "/Widget":
                source_widgets.append((page_index, annotation))
    if len(source_widgets) != EXPECTED_WIDGETS:
        raise SystemExit(f"Expected {EXPECTED_WIDGETS} widgets; found {len(source_widgets)}.")

    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    writer.reattach_fields()
    fields = writer.get_fields() or {}
    if set(fields) != set(FIELD_MAP.values()) | {"Clear Form"}:
        missing = sorted((set(FIELD_MAP.values()) | {"Clear Form"}) - set(fields))
        extra = sorted(set(fields) - (set(FIELD_MAP.values()) | {"Clear Form"}))
        raise SystemExit(f"Unexpected source field signature. Missing={missing}; extra={extra}")

    original_to_semantic = {original: semantic for semantic, original in FIELD_MAP.items()}
    manifest_fields = []
    for page_index, page in enumerate(writer.pages):
        retained = ArrayObject()
        for ref in page.get("/Annots", []):
            annotation = dereference(ref)
            subtype = str(annotation.get("/Subtype", ""))
            original_name = str(annotation.get("/T", ""))
            if subtype in {"/StrikeOut", "/Popup"}:
                continue
            if subtype == "/Widget" and original_name == "Clear Form":
                continue
            if subtype == "/Widget" and annotation.get("/FT") == "/Tx":
                semantic_name = original_to_semantic.get(original_name)
                if not semantic_name:
                    raise SystemExit(f"No semantic mapping for widget {original_name!r}.")
                declared_size, appearance_size = field_font_size(annotation)
                normalized_size = declared_size or appearance_size or 10.0
                annotation[NameObject("/T")] = TextStringObject(semantic_name)
                annotation[NameObject("/TU")] = TextStringObject(semantic_name)
                annotation[NameObject("/V")] = TextStringObject("")
                annotation.pop(NameObject("/DV"), None)
                annotation[NameObject("/DA")] = TextStringObject(f"/Helv {normalized_size:.3f} Tf 0 g")
                annotation[NameObject("/Q")] = NumberObject(int(annotation.get("/Q", 0)))
                rect = [float(value) for value in annotation["/Rect"]]
                manifest_fields.append(
                    {
                        "semanticName": semantic_name,
                        "originalName": original_name,
                        "page": page_index + 1,
                        "fieldType": "text",
                        "widgetRectangle": rect,
                        "width": rect[2] - rect[0],
                        "height": rect[3] - rect[1],
                        "sourceDefaultAppearance": str(fields[original_name].get("/DA", annotation.get("/DA", ""))),
                        "sourceAppearanceFontSize": appearance_size,
                        "font": "Helvetica",
                        "fontSize": normalized_size,
                        "alignment": int(annotation.get("/Q", 0)),
                        "multiline": bool(int(annotation.get("/Ff", 0)) & (1 << 12)),
                        "maxLength": annotation.get("/MaxLen"),
                        "flags": int(annotation.get("/Ff", 0)),
                    }
                )
            retained.append(ref)
        page[NameObject("/Annots")] = retained

    acroform = dereference(writer.root_object["/AcroForm"])
    acroform[NameObject("/Fields")] = ArrayObject(
        ref
        for ref in acroform["/Fields"]
        if str(dereference(ref).get("/T", "")) != "Clear Form"
    )
    acroform.pop(NameObject("/XFA"), None)
    acroform[NameObject("/NeedAppearances")] = BooleanObject(False)
    writer.root_object.pop(NameObject("/OpenAction"), None)
    writer.root_object.pop(NameObject("/AA"), None)
    writer.root_object.pop(NameObject("/Names"), None)

    blanks = {semantic: "" for semantic in FIELD_MAP}
    writer.update_page_form_field_values(None, blanks, auto_regenerate=False)
    # pypdf requires a text string while generating appearances. Convert each
    # completed DA to a byte string afterward so PDF operators such as `/Helv`
    # remain literal and pdf-lib can parse them in the browser.
    for page in writer.pages:
        for ref in page.get("/Annots", []):
            annotation = dereference(ref)
            if annotation.get("/Subtype") == "/Widget" and annotation.get("/FT") == "/Tx":
                default_appearance = str(annotation.get("/DA", ""))
                annotation[NameObject("/DA")] = ByteStringObject(default_appearance.encode("ascii"))
    writer.add_metadata(
        {
            "/Title": "PEI Standard Form of Rental Agreement - Blank Lease Template",
            "/Producer": "Lease Generator deterministic template normalizer",
        }
    )
    writer.compress_identical_objects(remove_identicals=True, remove_orphans=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("wb") as stream:
        writer.write(stream)

    normalized = PdfReader(args.output)
    normalized_fields = normalized.get_fields() or {}
    if set(normalized_fields) != set(FIELD_MAP):
        raise SystemExit("Normalized field tree does not contain the expected 69 semantic fields.")
    widget_count = 0
    for page in normalized.pages:
        for ref in page.get("/Annots", []):
            annotation = dereference(ref)
            if annotation.get("/Subtype") == "/Widget":
                widget_count += 1
                if annotation.get("/A") or annotation.get("/AA"):
                    raise SystemExit("Normalized template still contains a widget action.")
    if widget_count != len(FIELD_MAP):
        raise SystemExit(f"Expected {len(FIELD_MAP)} normalized widgets; found {widget_count}.")
    for name, field in normalized_fields.items():
        if str(field.get("/V", "")):
            raise SystemExit(f"Normalized field {name!r} is not blank.")
        ap = dereference(field.indirect_reference).get("/AP")
        if not ap or not dereference(ap).get("/N"):
            raise SystemExit(f"Normalized field {name!r} has no normal appearance stream.")

    raw = args.output.read_bytes().decode("latin-1", errors="ignore")
    text = "\n".join((page.extract_text() or "") for page in normalized.pages)
    if contains_forbidden_legacy_value(raw) or contains_forbidden_legacy_value(text):
        raise SystemExit("A forbidden legacy lease value survived normalization.")

    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest = {
        "manifestVersion": 1,
        "normalizerVersion": 1,
        "sourceSha256": SOURCE_SHA256,
        "templateSha256": sha256(args.output),
        "pageCount": EXPECTED_PAGES,
        "fieldCount": len(FIELD_MAP),
        "selectionMarkGroups": {
            "standard": {
                "value": "     X",
                "font": "Helvetica",
                "fontSize": 10,
            }
        },
        "fields": sorted(manifest_fields, key=lambda item: (item["page"], -item["widgetRectangle"][1], item["semanticName"])),
    }
    args.manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {args.output} ({manifest['templateSha256']}) with {len(FIELD_MAP)} editable fields.")


if __name__ == "__main__":
    main()
