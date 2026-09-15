import {
  convertUnit,
  getUnitDefinition,
} from "@optimitron/data/unit-conversion";
import type { Unit } from "@optimitron/db";

export type TrackingUnit = Pick<Unit, "id" | "abbreviatedName">;

/** Counts and ordinal scales need variable-specific meaning, not just a shared category. */
export function convertTrackingValue(
  value: number,
  from: TrackingUnit,
  to: TrackingUnit,
): number {
  if (!Number.isFinite(value))
    throw new Error("Measurement value must be finite.");
  if (from.id === to.id) return value;
  const source = getUnitDefinition(from.abbreviatedName);
  const target = getUnitDefinition(to.abbreviatedName);
  if (
    !source ||
    source.category !== target?.category ||
    source.category === "Count" ||
    source.category === "Rating"
  ) {
    throw new Error(
      `Cannot convert ${from.abbreviatedName} to ${to.abbreviatedName}. Use a compatible unit; counts, concentrations, and rating scales need an explicit conversion definition.`,
    );
  }
  const converted = convertUnit(
    value,
    from.abbreviatedName,
    to.abbreviatedName,
  );
  if (!Number.isFinite(converted))
    throw new Error("Converted measurement value must be finite.");
  return converted;
}

export function normalizeTrackingMeasurement(
  value: number,
  inputUnit: TrackingUnit,
  canonicalUnit: TrackingUnit,
) {
  return {
    originalValue: value,
    originalUnitId: inputUnit.id,
    value: convertTrackingValue(value, inputUnit, canonicalUnit),
    unitId: canonicalUnit.id,
  };
}
