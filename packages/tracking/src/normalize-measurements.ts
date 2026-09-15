import { Prisma } from "@optimitron/db";
import { normalizeTrackingMeasurement } from "./units";
import {
  refreshGlobalVariableSummary,
  refreshNOf1VariableSummary,
} from "./measurement-summaries";
import type { TrackingPrismaClient } from "./types";

/** Dry-run by default. Each variable's repairs and summaries commit together. */
export async function normalizeMeasurements(
  db: TrackingPrismaClient,
  options: { apply?: boolean; globalVariableId?: string } = {},
) {
  const result = {
    examined: 0,
    changed: 0,
    incompatible: [] as Array<{ measurementId: string; reason: string }>,
  };
  let variableCursor: string | undefined;
  for (;;) {
    const variables = await db.globalVariable.findMany({
      where: {
        ...(options.globalVariableId ? { id: options.globalVariableId } : {}),
        measurements: { some: { deletedAt: null } },
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: 100,
      ...(variableCursor ? { cursor: { id: variableCursor }, skip: 1 } : {}),
    });
    if (!variables.length) break;
    for (const variable of variables) {
      await db.$transaction(
        async (tx) => {
          // Match the host's unit locks before writes. Sort to keep lock order stable.
          if (options.apply)
            await tx.$queryRaw(Prisma.sql`
          SELECT pg_advisory_xact_lock(hashtextextended(
            'tracking-units:' || v."subjectId" || ':' || v."globalVariableId", 0
          ))::text
          FROM (SELECT "subjectId", "globalVariableId" FROM "NOf1Variable"
            WHERE "globalVariableId" = ${variable.id} ORDER BY "id") v
        `);
          const { defaultUnit } = await tx.globalVariable.findUniqueOrThrow({
            where: { id: variable.id },
            select: { defaultUnit: true },
          });
          const affected = new Set<string>();
          let cursor: string | undefined;
          for (;;) {
            const rows = await tx.measurement.findMany({
              where: { globalVariableId: variable.id, deletedAt: null },
              include: { originalUnit: true },
              orderBy: { id: "asc" },
              take: 500,
              ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            });
            if (!rows.length) break;
            const changes: Array<{
              id: string;
              previousUpdatedAt: string;
              value: number;
              unitId: string;
            }> = [];
            for (const row of rows) {
              result.examined++;
              if (row.unitId === defaultUnit.id) continue;
              try {
                const normalized = normalizeTrackingMeasurement(
                  row.originalValue,
                  row.originalUnit,
                  defaultUnit,
                );
                changes.push({
                  id: row.id,
                  previousUpdatedAt: row.updatedAt.toISOString(),
                  value: normalized.value,
                  unitId: normalized.unitId,
                });
              } catch (error) {
                result.incompatible.push({
                  measurementId: row.id,
                  reason:
                    error instanceof Error ? error.message : String(error),
                });
              }
            }
            if (options.apply && changes.length) {
              // Update only the stored representation. A concurrent correction wins.
              const updated = await tx.$queryRaw<
                Array<{ nOf1VariableId: string }>
              >(Prisma.sql`
              UPDATE "Measurement" m
              SET "value" = c."value", "unitId" = c."unitId", "updatedAt" = (clock_timestamp() AT TIME ZONE 'UTC')
              FROM jsonb_to_recordset(${JSON.stringify(changes)}::jsonb)
                AS c("id" text, "previousUpdatedAt" timestamp, "value" double precision, "unitId" text)
              WHERE m."id" = c."id" AND m."updatedAt" = c."previousUpdatedAt" AND m."deletedAt" IS NULL
              RETURNING m."nOf1VariableId"
            `);
              result.changed += updated.length;
              for (const row of updated) affected.add(row.nOf1VariableId);
            } else if (!options.apply) result.changed += changes.length;
            cursor = rows[rows.length - 1].id;
          }
          if (affected.size) {
            await refreshGlobalVariableSummary(tx, variable.id);
            for (const id of [...affected].sort())
              await refreshNOf1VariableSummary(tx, id);
          }
        },
        { timeout: 60_000, maxWait: 30_000 },
      );
    }
    variableCursor = variables[variables.length - 1].id;
  }
  return result;
}
