import type { Prisma } from "@optimitron/db";
import { normalizeTrackingMeasurement } from "./units";
import { refreshMeasurementSummaries } from "./measurement-summaries";
import type { TrackingPrismaClient } from "./types";

/** Dry-run by default. Preserve entered values; repair only stored representations. */
export async function normalizeMeasurements(
  db: TrackingPrismaClient,
  options: { apply?: boolean; globalVariableId?: string } = {},
) {
  const result = {
    examined: 0,
    changed: 0,
    incompatible: [] as Array<{ measurementId: string; reason: string }>,
  };
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.measurement.findMany({
      where: {
        deletedAt: null,
        ...(options.globalVariableId
          ? { globalVariableId: options.globalVariableId }
          : {}),
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) break;
    for (const row of rows) {
      result.examined++;
      const inspect = async (tx: Prisma.TransactionClient) => {
        const measurement = await tx.measurement.findFirst({
          where: { id: row.id, deletedAt: null },
          include: {
            originalUnit: true,
            globalVariable: { include: { defaultUnit: true } },
          },
        });
        if (
          !measurement ||
          measurement.unitId === measurement.globalVariable.defaultUnitId
        )
          return;
        let normalized;
        try {
          normalized = normalizeTrackingMeasurement(
            measurement.originalValue,
            measurement.originalUnit,
            measurement.globalVariable.defaultUnit,
          );
        } catch (error) {
          result.incompatible.push({
            measurementId: row.id,
            reason: error instanceof Error ? error.message : String(error),
          });
          return;
        }
        if (options.apply) {
          // Optimistic concurrency: a correction since the read must never be overwritten.
          const updated = await tx.measurement.updateMany({
            where: {
              id: row.id,
              updatedAt: measurement.updatedAt,
              deletedAt: null,
            },
            data: { value: normalized.value, unitId: normalized.unitId },
          });
          if (!updated.count) return;
          await refreshMeasurementSummaries(tx, measurement);
        }
        result.changed++;
      };
      await db.$transaction(inspect);
    }
    cursor = rows[rows.length - 1].id;
  }
  return result;
}
