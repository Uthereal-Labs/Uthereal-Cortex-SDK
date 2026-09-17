/** Generate/check portable types without starting services or rewriting files in check mode. */
import { readFile, writeFile } from "node:fs/promises";
import openapiTS, { astToString, COMMENT_HEADER } from "openapi-typescript";

const schema = new URL("../openapi.json", import.meta.url);
const target = new URL("../sdk/protocol/openapi.generated.ts", import.meta.url);
const content = COMMENT_HEADER +
  astToString(await openapiTS(schema, { defaultNonNullable: false }));
if (process.argv.includes("--check")) {
  if (await readFile(target, "utf8") !== content) {
    throw new Error(
      "Cortex generated types are stale. Run pnpm generate:types",
    );
  }
} else {
  await writeFile(target, content);
}
