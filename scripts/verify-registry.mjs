import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const version = process.env.RELEASE_VERSION;
assert.match(version ?? "", /^\d+\.\d+\.\d+(?:-rc\.\d+)?$/);
const commit = process.env.RELEASE_COMMIT;
assert.match(commit ?? "", /^[a-f0-9]{40}$/);
const response = await fetch(
  `https://registry.npmjs.org/@uthereal-sdk%2Fcortex/${version}`,
);
assert.ok(response.ok, `Registry metadata: ${response.status}`);
const metadata = await response.json();
const archive = await readFile(
  `.cache/package/uthereal-sdk-cortex-${version}.tgz`,
);
const integrity = `sha512-${
  createHash("sha512").update(archive).digest("base64")
}`;
assert.equal(
  metadata.dist.integrity,
  integrity,
  "Registry artifact differs from validated archive",
);
assert.ok(
  metadata.dist.attestations?.url,
  "Registry is missing provenance attestations",
);
const attestationResponse = await fetch(metadata.dist.attestations.url);
assert.ok(attestationResponse.ok, "Cannot read registry attestations");
const attestations = await attestationResponse.json();
const provenance = attestations.attestations.find((item) =>
  item.predicateType === "https://slsa.dev/provenance/v1"
);
assert.ok(provenance, "SLSA provenance missing");
const statement = JSON.parse(
  Buffer.from(provenance.bundle.dsseEnvelope.payload, "base64").toString(
    "utf8",
  ),
);
const repository = "https://github.com/Uthereal-Labs/Uthereal-Cortex-SDK";
const build = statement.predicate.buildDefinition;
assert.deepEqual(build.externalParameters.workflow, {
  ref: "refs/heads/main",
  repository,
  path: ".github/workflows/publish.yml",
});
assert.ok(
  build.resolvedDependencies.some((dependency) =>
    dependency.uri === `git+${repository}@refs/heads/main` &&
    dependency.digest.gitCommit === commit
  ),
  "Provenance does not identify the release repository and commit",
);
assert.ok(
  statement.subject.some((subject) =>
    subject.name === `pkg:npm/%40uthereal-sdk/cortex@${version}` &&
    subject.digest.sha512 === createHash("sha512").update(archive).digest("hex")
  ),
  "Provenance subject does not match the validated package archive",
);
console.log(`Verified registry integrity and GitHub provenance for ${version}`);
