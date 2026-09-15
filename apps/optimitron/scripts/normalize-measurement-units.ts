import "./load-env";
import { normalizeMeasurements } from "@optimitron/tracking/normalize-measurements";
import { prisma } from "../src/lib/prisma";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--apply" && !arg.startsWith("--variable="))) {
  throw new Error(
    "Use --apply and/or --variable=<globalVariableId>. Omit --apply for a dry run.",
  );
}
const apply = args.includes("--apply");
const globalVariableId = args
  .find((arg) => arg.startsWith("--variable="))
  ?.slice(11);
if (globalVariableId === "")
  throw new Error("--variable requires a global variable ID.");
normalizeMeasurements(prisma, { apply, globalVariableId })
  .then((result) =>
    console.log(
      JSON.stringify({ mode: apply ? "apply" : "dry-run", ...result }, null, 2),
    ),
  )
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
