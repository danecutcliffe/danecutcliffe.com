import type {
  AdaptedPortfolioPackage,
  ConfigurationState,
  PortfolioPackage,
  PortfolioStandardOption,
  PortfolioUnit,
  StandardOptionCategory,
} from "./portfolio-types";

const configurationStates = new Set<ConfigurationState>([
  "unknown",
  "known_empty",
  "known_populated",
]);
const optionCategories = new Set<StandardOptionCategory>([
  "included_standard",
  "included_other",
  "tenant_responsibility",
]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireString = (
  record: Record<string, unknown>,
  field: string,
  path: string,
): string => {
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(`${path}.${field} must be a string.`);
  }
  return value;
};

const requireStringArray = (
  record: Record<string, unknown>,
  field: string,
  path: string,
): string[] => {
  const value = record[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${path}.${field} must be an array of strings.`);
  }
  return value;
};

const assertUniqueIds = (records: Array<{ id: string }>, path: string) => {
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id)) throw new Error(`${path} contains duplicate ID ${record.id}.`);
    seen.add(record.id);
  }
};

/**
 * Performs dependency-free client validation before the authoritative database
 * preview. Unknown fields are retained so future provenance is never discarded.
 */
export function parsePortfolioPackage(value: unknown): PortfolioPackage {
  if (!isObject(value)) throw new Error("Portfolio data must be a JSON object.");
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) {
    throw new Error("Only portfolio schemaVersion 1 or 2 is supported.");
  }

  for (const field of ["entities", "buildings", "units", "standardOptions"] as const) {
    if (!Array.isArray(value[field])) throw new Error(`${field} must be an array.`);
  }
  if (!isObject(value.globalDefaults)) throw new Error("globalDefaults must be an object.");

  const rawEntities = value.entities as unknown[];
  const rawBuildings = value.buildings as unknown[];
  const rawUnits = value.units as unknown[];
  const rawStandardOptions = value.standardOptions as unknown[];

  const entities = rawEntities.map((item, index) => {
    if (!isObject(item)) throw new Error(`entities[${index}] must be an object.`);
    const entity = {
      ...item,
      id: requireString(item, "id", `entities[${index}]`),
      legalName: requireString(item, "legalName", `entities[${index}]`),
      addressForService: requireString(item, "addressForService", `entities[${index}]`),
      community: requireString(item, "community", `entities[${index}]`),
      province: requireString(item, "province", `entities[${index}]`),
      postalCode: requireString(item, "postalCode", `entities[${index}]`),
      phone: requireString(item, "phone", `entities[${index}]`),
      rentPaymentRecipient: requireString(item, "rentPaymentRecipient", `entities[${index}]`),
      rentPaymentInstructions: requireString(item, "rentPaymentInstructions", `entities[${index}]`),
      rentPaymentAddress: requireString(item, "rentPaymentAddress", `entities[${index}]`),
    };
    return entity;
  });

  const buildings = rawBuildings.map((item, index) => {
    if (!isObject(item)) throw new Error(`buildings[${index}] must be an object.`);
    return {
      ...item,
      id: requireString(item, "id", `buildings[${index}]`),
      displayName: requireString(item, "displayName", `buildings[${index}]`),
      streetAddress: requireString(item, "streetAddress", `buildings[${index}]`),
      community: requireString(item, "community", `buildings[${index}]`),
      province: requireString(item, "province", `buildings[${index}]`),
      postalCode: requireString(item, "postalCode", `buildings[${index}]`),
    };
  });

  const standardOptions = rawStandardOptions.map((item, index) => {
    if (!isObject(item)) throw new Error(`standardOptions[${index}] must be an object.`);
    const category = requireString(item, "category", `standardOptions[${index}]`);
    if (!optionCategories.has(category as StandardOptionCategory)) {
      throw new Error(`standardOptions[${index}].category is unsupported.`);
    }
    return {
      ...item,
      id: requireString(item, "id", `standardOptions[${index}]`),
      systemKey: typeof item.systemKey === "string" ? item.systemKey : undefined,
      category: category as StandardOptionCategory,
      label: requireString(item, "label", `standardOptions[${index}]`),
      pdfText: requireString(item, "pdfText", `standardOptions[${index}]`),
    } satisfies PortfolioStandardOption;
  });

  const units: PortfolioUnit[] = rawUnits.map((item, index) => {
    if (!isObject(item)) throw new Error(`units[${index}] must be an object.`);
    if (typeof item.defaultRentalRate !== "number" || !Number.isFinite(item.defaultRentalRate) || item.defaultRentalRate < 0) {
      throw new Error(`units[${index}].defaultRentalRate must be a non-negative number.`);
    }
    const unit = {
      ...item,
      id: requireString(item, "id", `units[${index}]`),
      buildingId: requireString(item, "buildingId", `units[${index}]`),
      entityId: requireString(item, "entityId", `units[${index}]`),
      displayName: requireString(item, "displayName", `units[${index}]`),
      unitNumber: requireString(item, "unitNumber", `units[${index}]`),
      premisesStreetAddress: requireString(item, "premisesStreetAddress", `units[${index}]`),
      premisesCommunity: requireString(item, "premisesCommunity", `units[${index}]`),
      premisesPostalCode: requireString(item, "premisesPostalCode", `units[${index}]`),
      premisesType: requireString(item, "premisesType", `units[${index}]`),
      defaultRentalRate: item.defaultRentalRate,
      rentPeriod: requireString(item, "rentPeriod", `units[${index}]`),
      rentDueDay: requireString(item, "rentDueDay", `units[${index}]`),
      includedOptionIds: requireStringArray(item, "includedOptionIds", `units[${index}]`),
      tenantResponsibilityOptionIds: requireStringArray(
        item,
        "tenantResponsibilityOptionIds",
        `units[${index}]`,
      ),
      inclusionsState:
        typeof item.inclusionsState === "string"
          ? (item.inclusionsState as ConfigurationState)
          : undefined,
      responsibilitiesState:
        typeof item.responsibilitiesState === "string"
          ? (item.responsibilitiesState as ConfigurationState)
          : undefined,
    } satisfies PortfolioUnit;

    if (value.schemaVersion === 2) {
      if (!configurationStates.has(unit.inclusionsState as ConfigurationState)) {
        throw new Error(`units[${index}].inclusionsState is required for schemaVersion 2.`);
      }
      if (!configurationStates.has(unit.responsibilitiesState as ConfigurationState)) {
        throw new Error(`units[${index}].responsibilitiesState is required for schemaVersion 2.`);
      }
    }
    return unit;
  });

  assertUniqueIds(entities, "entities");
  assertUniqueIds(buildings, "buildings");
  assertUniqueIds(standardOptions, "standardOptions");
  assertUniqueIds(units, "units");

  const buildingIds = new Set(buildings.map(({ id }) => id));
  const entityIds = new Set(entities.map(({ id }) => id));
  const optionIds = new Set(standardOptions.map(({ id }) => id));
  for (const unit of units) {
    if (!buildingIds.has(unit.buildingId)) throw new Error(`${unit.id} references missing building ${unit.buildingId}.`);
    if (!entityIds.has(unit.entityId)) throw new Error(`${unit.id} references missing entity ${unit.entityId}.`);
    for (const optionId of [...unit.includedOptionIds, ...unit.tenantResponsibilityOptionIds]) {
      if (!optionIds.has(optionId)) throw new Error(`${unit.id} references missing option ${optionId}.`);
    }
  }

  return {
    ...value,
    schemaVersion: value.schemaVersion,
    entities,
    buildings,
    units,
    standardOptions,
    globalDefaults: {
      ...value.globalDefaults,
      damageDepositMode: requireString(value.globalDefaults, "damageDepositMode", "globalDefaults"),
      rentPeriod: requireString(value.globalDefaults, "rentPeriod", "globalDefaults"),
      rentDueDay: requireString(value.globalDefaults, "rentDueDay", "globalDefaults"),
    },
  } as PortfolioPackage;
}

/** Adds explicit state for application use without inventing missing values. */
export function adaptPortfolioPackage(pkg: PortfolioPackage): AdaptedPortfolioPackage {
  return {
    ...pkg,
    units: pkg.units.map((unit) => ({
      ...unit,
      inclusionsState:
        unit.inclusionsState ?? (unit.includedOptionIds.length > 0 ? "known_populated" : "unknown"),
      responsibilitiesState:
        unit.responsibilitiesState ??
        (unit.tenantResponsibilityOptionIds.length > 0 ? "known_populated" : "unknown"),
    })),
  };
}
