import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  handleTrackingToolCall,
  setTrackingPrismaProvider,
  updateTrackingVariableSettingsForUser,
} from "@optimitron/tracking";
import type { TrackingToolName } from "@optimitron/tracking";
import { normalizeMeasurements } from "@optimitron/tracking/normalize-measurements";
import { prisma } from "@/lib/prisma";

const PREFIX = "measurement_units_test_";
const USER = `${PREFIX}user`;
const OTHER_USER = `${PREFIX}other`;
const VARIABLE = `${PREFIX}variable`;
const NOF1 = `${PREFIX}nof1`;
const SUBJECT = `${PREFIX}subject`;
const TIME = "2026-09-14T14:00:00.000Z";
let mg: string;
let grams: string;

async function cleanup() {
  await prisma.trackingReminderNotification.deleteMany({
    where: { trackingReminder: { globalVariableId: VARIABLE } },
  });
  await prisma.trackingReminder.deleteMany({
    where: { globalVariableId: VARIABLE },
  });
  await prisma.measurement.deleteMany({
    where: { globalVariableId: VARIABLE },
  });
  await prisma.nOf1Variable.deleteMany({
    where: { globalVariableId: VARIABLE },
  });
  await prisma.globalVariable.deleteMany({ where: { id: VARIABLE } });
  await prisma.subject.deleteMany({ where: { id: SUBJECT } });
  await prisma.user.deleteMany({ where: { id: { in: [USER, OTHER_USER] } } });
  await prisma.variableCategory.deleteMany({
    where: { id: `${PREFIX}category` },
  });
}

async function call(
  name: TrackingToolName,
  args: Record<string, unknown>,
  userId = USER,
) {
  const response = await handleTrackingToolCall({
    name,
    args,
    userId,
    authRequired: () => {
      throw new Error("Unauthorized");
    },
  });
  // The same JSON boundary clients receive over MCP; the database and handlers are real.
  return JSON.parse(response.content[0]!.text);
}

async function record(
  value: number,
  unitAbbreviation = "mg",
  startTime = TIME,
) {
  return (
    await call("recordMeasurement", {
      globalVariableId: VARIABLE,
      value,
      unitAbbreviation,
      startTime,
    })
  ).result.measurement;
}

async function reminder(time = "08:00", value = 150) {
  return (
    await call("upsertTrackingReminder", {
      globalVariableId: VARIABLE,
      reminderStartTime: time,
      unitAbbreviation: "mg",
      defaultValue: value,
      startTrackingDate: "2026-09-01T00:00:00Z",
    })
  ).result.reminder;
}

describe("measurement units through MCP and PostgreSQL", () => {
  beforeEach(async () => {
    await cleanup();
    for (const [abbreviatedName, name, ucumCode, unitCategoryId] of [
      ["mg", "Milligrams", "mg", "Weight"],
      ["g", "Grams", "g", "Weight"],
      ["mL", "Milliliters", "mL", "Volume"],
      ["servings", "Servings", "{serving}", "Count"],
    ]) {
      await prisma.unit.upsert({
        where: { abbreviatedName },
        update: {},
        create: { abbreviatedName, name, ucumCode, unitCategoryId },
      });
    }
    mg = (
      await prisma.unit.findUniqueOrThrow({ where: { abbreviatedName: "mg" } })
    ).id;
    grams = (
      await prisma.unit.findUniqueOrThrow({ where: { abbreviatedName: "g" } })
    ).id;
    await prisma.user.createMany({
      data: [USER, OTHER_USER].map((id) => ({
        id,
        email: `${id}@example.test`,
        timeZone: "America/Chicago",
      })),
    });
    await prisma.subject.create({ data: { id: SUBJECT, userId: USER } });
    await prisma.variableCategory.create({
      data: {
        id: `${PREFIX}category`,
        name: `${PREFIX}category`,
        defaultUnitId: mg,
      },
    });
    await prisma.globalVariable.create({
      data: {
        id: VARIABLE,
        name: VARIABLE,
        defaultUnitId: mg,
        variableCategoryId: `${PREFIX}category`,
      },
    });
    await prisma.nOf1Variable.create({
      data: {
        id: NOF1,
        subjectId: SUBJECT,
        globalVariableId: VARIABLE,
        defaultUnitId: mg,
      },
    });
    setTrackingPrismaProvider(async () => prisma);
  });
  afterAll(cleanup);

  it("normalizes mixed units, preserves entered values, and keeps a one-time unit out of personal defaults", async () => {
    await record(150);
    const second = await record(0.15, "g", "2026-09-14T15:00:00Z");
    expect(second).toMatchObject({
      value: 150,
      unitId: mg,
      originalValue: 0.15,
      originalUnitId: grams,
    });
    const personal = await prisma.nOf1Variable.findUniqueOrThrow({
      where: { id: NOF1 },
    });
    expect(personal).toMatchObject({
      defaultUnitId: mg,
      mean: 150,
      numberOfMeasurements: 2,
    });
    expect(
      await prisma.globalVariable.findUniqueOrThrow({
        where: { id: VARIABLE },
      }),
    ).toMatchObject({ mean: 150, numberOfMeasurements: 2 });
  });

  it("corrects amount and unit by ID without a duplicate or metadata loss", async () => {
    const row = await record(150);
    await prisma.measurement.update({
      where: { id: row.id },
      data: { note: "Keep this note", duration: 60 },
    });
    const corrected = await call("updateMeasurement", {
      measurementId: row.id,
      value: 0.2,
      unitName: "grams",
    });
    expect(corrected.measurement).toMatchObject({
      id: row.id,
      value: 200,
      unit: { id: mg },
      originalValue: 0.2,
      originalUnit: { id: grams },
      startTime: TIME,
      note: "Keep this note",
      duration: 60,
    });
    expect(
      await prisma.measurement.count({ where: { globalVariableId: VARIABLE } }),
    ).toBe(1);
    expect(
      await prisma.nOf1Variable.findUniqueOrThrow({ where: { id: NOF1 } }),
    ).toMatchObject({ mean: 200, defaultUnitId: mg });
  });

  it("derives originalValue for existing clients and rejects inconsistent double representations", async () => {
    const row = await record(0.15, "g");
    const result = await call("updateMeasurement", {
      measurementId: row.id,
      value: 200,
    });
    expect(result.measurement).toMatchObject({
      value: 200,
      originalValue: 0.2,
      originalUnit: { id: grams },
    });
    await expect(
      call("updateMeasurement", {
        measurementId: row.id,
        value: 300,
        originalValue: 10,
      }),
    ).rejects.toThrow("does not match");
    expect(
      await prisma.measurement.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({ value: 200, originalValue: 0.2 });
  });

  it("rejects unknown, incompatible, and unauthorized corrections with no persisted changes", async () => {
    const row = await record(150);
    await expect(
      call("updateMeasurement", {
        measurementId: row.id,
        value: 1,
        unitAbbreviation: "mL",
      }),
    ).rejects.toThrow("Cannot convert");
    await expect(
      call("updateMeasurement", {
        measurementId: row.id,
        value: 1,
        unitAbbreviation: "unknown-unit",
      }),
    ).rejects.toThrow("not found");
    await expect(
      call(
        "updateMeasurement",
        { measurementId: row.id, value: 0.2, unitId: grams },
        OTHER_USER,
      ),
    ).rejects.toThrow("Measurement not found");
    await expect(record(1, "servings", "2026-09-14T15:00:00Z")).rejects.toThrow(
      "Cannot convert",
    );
    expect(
      await prisma.measurement.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({
      value: 150,
      unitId: mg,
      originalValue: 150,
      originalUnitId: mg,
    });
    expect(
      await prisma.measurement.count({ where: { globalVariableId: VARIABLE } }),
    ).toBe(1);
  });

  it("converts every reminder preset and personal limit when the preferred unit changes", async () => {
    const first = await reminder();
    const second = await reminder("20:00", 200);
    await prisma.nOf1Variable.update({
      where: { id: NOF1 },
      data: {
        fillingValue: 150,
        minimumAllowedValue: 50,
        maximumAllowedValue: 300,
      },
    });
    await record(0.1, "g");
    expect(
      await prisma.trackingReminder.findUniqueOrThrow({
        where: { id: first.id },
      }),
    ).toMatchObject({ defaultValue: 150 });
    const updated = await call("upsertTrackingReminder", {
      trackingReminderId: first.id,
      unitAbbreviation: "g",
    });
    expect(updated.result.reminder).toMatchObject({
      id: first.id,
      defaultValue: 0.15,
    });
    expect(updated.result.unit.id).toBe(grams);
    expect(
      await prisma.trackingReminder.findUniqueOrThrow({
        where: { id: second.id },
      }),
    ).toMatchObject({ defaultValue: 0.2 });
    expect(
      await prisma.nOf1Variable.findUniqueOrThrow({ where: { id: NOF1 } }),
    ).toMatchObject({
      defaultUnitId: grams,
      fillingValue: 0.15,
      minimumAllowedValue: 0.05,
      maximumAllowedValue: 0.3,
    });
    const row = (
      await call("recordMeasurement", {
        globalVariableId: VARIABLE,
        value: 0.15,
        startTime: "2026-09-14T16:00:00Z",
      })
    ).result.measurement;
    expect(row).toMatchObject({
      value: 150,
      unitId: mg,
      originalValue: 0.15,
      originalUnitId: grams,
    });
  });

  it("applies an explicitly replaced preset in the new unit and keeps REST preference edits consistent", async () => {
    const r = await reminder();
    await call("upsertTrackingReminder", {
      trackingReminderId: r.id,
      unitAbbreviation: "g",
      defaultValue: 0.25,
    });
    await updateTrackingVariableSettingsForUser(
      { globalVariableId: VARIABLE, unitAbbreviation: "mg" },
      USER,
    );
    expect(
      await prisma.trackingReminder.findUniqueOrThrow({ where: { id: r.id } }),
    ).toMatchObject({ defaultValue: 250 });
    await expect(
      call("upsertTrackingReminder", {
        trackingReminderId: r.id,
        unitAbbreviation: "mL",
      }),
    ).rejects.toThrow("Cannot convert");
    expect(
      await prisma.nOf1Variable.findUniqueOrThrow({ where: { id: NOF1 } }),
    ).toMatchObject({ defaultUnitId: mg });
  });

  it("converts a reminder default for a one-time response unit and retains its personal-unit receipt", async () => {
    const r = await reminder();
    await call("respondToTrackingReminder", {
      trackingReminderId: r.id,
      status: "TRACKED",
      unitAbbreviation: "g",
      dateKey: "2026-09-14",
      trackedAt: TIME,
    });
    expect(
      await prisma.measurement.findFirstOrThrow({
        where: { globalVariableId: VARIABLE },
      }),
    ).toMatchObject({
      value: 150,
      unitId: mg,
      originalValue: 0.15,
      originalUnitId: grams,
    });
    expect(
      await prisma.trackingReminderNotification.findFirstOrThrow({
        where: { trackingReminderId: r.id },
      }),
    ).toMatchObject({ trackedValue: 150 });
    await call("upsertTrackingReminder", {
      trackingReminderId: r.id,
      unitAbbreviation: "g",
    });
    expect(
      await prisma.trackingReminderNotification.findFirstOrThrow({
        where: { trackingReminderId: r.id },
      }),
    ).toMatchObject({ trackedValue: 0.15 });
  });

  it("keeps reminder amounts consistent during concurrent preference changes", async () => {
    const r = await reminder();
    for (let index = 0; index < 4; index++) {
      await Promise.all([
        call("upsertTrackingReminder", {
          trackingReminderId: r.id,
          unitAbbreviation: index % 2 === 0 ? "g" : "mg",
        }),
        call("respondToTrackingReminder", {
          trackingReminderId: r.id,
          status: "TRACKED",
          dateKey: `2026-09-${14 + index}`,
          trackedAt: `2026-09-${14 + index}T14:00:00Z`,
        }),
      ]);
    }
    const rows = await prisma.measurement.findMany({
      where: { globalVariableId: VARIABLE },
    });
    expect(rows).toHaveLength(4);
    for (const row of rows)
      expect(row).toMatchObject({ value: 150, unitId: mg });
    expect(
      await prisma.trackingReminderNotification.findMany({
        where: { trackingReminderId: r.id },
        select: { trackedValue: true },
      }),
    ).toEqual(Array.from({ length: 4 }, () => ({ trackedValue: 150 })));
  });

  it("repairs legacy unit rows with an idempotent dry-run command and suppresses mixed-unit summaries", async () => {
    const first = await record(150);
    await prisma.measurement.update({
      where: { id: first.id },
      data: {
        value: 0.15,
        unitId: grams,
        originalValue: 0.15,
        originalUnitId: grams,
      },
    });
    await record(150, "mg", "2026-09-14T15:00:00Z");
    expect(
      await prisma.nOf1Variable.findUniqueOrThrow({ where: { id: NOF1 } }),
    ).toMatchObject({ mean: null, numberOfMeasurements: 2 });
    expect(
      await normalizeMeasurements(prisma, { globalVariableId: VARIABLE }),
    ).toMatchObject({ examined: 2, changed: 1, incompatible: [] });
    expect(
      await prisma.measurement.findUniqueOrThrow({ where: { id: first.id } }),
    ).toMatchObject({ value: 0.15, unitId: grams });
    expect(
      await normalizeMeasurements(prisma, {
        globalVariableId: VARIABLE,
        apply: true,
      }),
    ).toMatchObject({ changed: 1, incompatible: [] });
    expect(
      await prisma.measurement.findUniqueOrThrow({ where: { id: first.id } }),
    ).toMatchObject({
      value: 150,
      unitId: mg,
      originalValue: 0.15,
      originalUnitId: grams,
    });
    expect(
      await prisma.nOf1Variable.findUniqueOrThrow({ where: { id: NOF1 } }),
    ).toMatchObject({ mean: 150 });
    expect(
      await normalizeMeasurements(prisma, {
        globalVariableId: VARIABLE,
        apply: true,
      }),
    ).toMatchObject({ changed: 0 });
  });
});
