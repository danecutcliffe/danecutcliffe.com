import { describe, expect, it } from "vitest";
import example from "./portfolio.example.json";
import { adaptPortfolioPackage, parsePortfolioPackage } from "./portfolio-schema";

describe("portfolio package adapter", () => {
  it("accepts the sanitized schema v2 example", () => {
    const parsed = parsePortfolioPackage(example);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.units).toHaveLength(1);
  });

  it("maps empty schema v1 term arrays to unknown, not known-empty", () => {
    const v1 = structuredClone(example) as Record<string, unknown>;
    v1.schemaVersion = 1;
    const unit = (v1.units as Array<Record<string, unknown>>)[0];
    delete unit.inclusionsState;
    delete unit.responsibilitiesState;
    unit.includedOptionIds = [];
    unit.tenantResponsibilityOptionIds = [];

    const adapted = adaptPortfolioPackage(parsePortfolioPackage(v1));
    expect(adapted.units[0].inclusionsState).toBe("unknown");
    expect(adapted.units[0].responsibilitiesState).toBe("unknown");
  });

  it("maps populated schema v1 arrays to known-populated", () => {
    const v1 = structuredClone(example) as Record<string, unknown>;
    v1.schemaVersion = 1;
    const unit = (v1.units as Array<Record<string, unknown>>)[0];
    delete unit.inclusionsState;
    delete unit.responsibilitiesState;

    const adapted = adaptPortfolioPackage(parsePortfolioPackage(v1));
    expect(adapted.units[0].inclusionsState).toBe("known_populated");
    expect(adapted.units[0].responsibilitiesState).toBe("unknown");
  });

  it("rejects duplicate stable IDs", () => {
    const invalid = structuredClone(example) as Record<string, unknown>;
    const entities = invalid.entities as unknown[];
    entities.push(structuredClone(entities[0]));
    expect(() => parsePortfolioPackage(invalid)).toThrow(/duplicate ID/);
  });

  it("rejects unresolved relationships before server preview", () => {
    const invalid = structuredClone(example) as Record<string, unknown>;
    const unit = (invalid.units as Array<Record<string, unknown>>)[0];
    unit.entityId = "entity-does-not-exist";
    expect(() => parsePortfolioPackage(invalid)).toThrow(/references missing entity/);
  });
});

