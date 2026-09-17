import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { CortexClient } from "../.cache/node/sdk/server.js";
import { readAnswers } from "../.cache/node/sdk/core.js";
const fixture = await readFile(
  new URL("../examples/ask/response.ndjson", import.meta.url),
  "utf8",
);
const client = new CortexClient({
  assistantId: "fixture-agent",
  apiKey: "fixture-key",
  baseUrl: "https://example.invalid/functions/v1/api-server-proxy",
}, async () => new Response(fixture));
const response = await client.ask("owner", "session", { message: "Garden" });
let answer;
for await (const snapshot of readAnswers(response)) answer = snapshot;
assert.ok(answer?.utterance);
assert.ok(answer.references.inline.length);
console.log("Node server imports and fixture streaming passed");
