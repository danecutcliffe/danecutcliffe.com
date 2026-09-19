#!/usr/bin/env python3
"""Independent structural validator for normalized and generated lease PDFs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from pypdf import PdfReader


def dereference(value):
    return value.get_object() if hasattr(value, "get_object") else value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--expect", type=Path)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    expected = json.loads(args.expect.read_text(encoding="utf-8")) if args.expect else {}
    reader = PdfReader(args.pdf)
    fields = reader.get_fields() or {}
    manifest_fields = {item["semanticName"]: item for item in manifest["fields"]}
    if len(reader.pages) != manifest["pageCount"]:
        raise SystemExit("Page count differs from manifest.")
    if set(fields) != set(manifest_fields):
        raise SystemExit("Field names differ from manifest.")

    widgets = {}
    forbidden_subtypes = {"/StrikeOut", "/Popup", "/RichMedia"}
    for page_number, page in enumerate(reader.pages, 1):
        for ref in page.get("/Annots", []):
            annotation = dereference(ref)
            subtype = str(annotation.get("/Subtype", ""))
            if subtype in forbidden_subtypes:
                raise SystemExit(f"Forbidden annotation {subtype} remains on page {page_number}.")
            if subtype != "/Widget":
                continue
            name = str(annotation.get("/T", ""))
            if name in widgets:
                raise SystemExit(f"Duplicate widget name: {name}")
            widgets[name] = (page_number, annotation)
            if annotation.get("/A") or annotation.get("/AA"):
                raise SystemExit(f"Widget {name} contains an action.")
    if set(widgets) != set(fields):
        raise SystemExit("Field tree and page widgets do not match one-to-one.")

    for name, field in fields.items():
        page_number, widget = widgets[name]
        spec = manifest_fields[name]
        rect = [round(float(value), 3) for value in widget["/Rect"]]
        wanted_rect = [round(float(value), 3) for value in spec["widgetRectangle"]]
        if page_number != spec["page"] or rect != wanted_rect:
            raise SystemExit(f"Geometry mismatch for {name}.")
        canonical = str(field.get("/V", ""))
        effective = str(widget.get("/V", canonical))
        wanted = str(expected.get(name, ""))
        if canonical != wanted or effective != wanted:
            raise SystemExit(f"Value mismatch for {name}: canonical={canonical!r}, widget={effective!r}, wanted={wanted!r}")
        ap = dereference(widget.get("/AP", {})).get("/N")
        if not ap or not dereference(ap).get_data():
            raise SystemExit(f"Widget {name} has no non-empty appearance stream.")

    catalog = reader.trailer["/Root"]
    for forbidden in ("/OpenAction", "/AA", "/JavaScript", "/EmbeddedFiles"):
        if catalog.get(forbidden):
            raise SystemExit(f"Forbidden catalog entry remains: {forbidden}")
    print(f"Validated {args.pdf}: {len(fields)} editable fields, {len(reader.pages)} pages.")


if __name__ == "__main__":
    main()
