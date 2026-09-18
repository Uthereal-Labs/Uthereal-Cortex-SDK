import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const tag = process.env.RELEASE_TAG;
assert.match(
  tag ?? "",
  /^v\d+\.\d+\.\d+(?:-rc\.\d+)?$/,
  "Expected vX.Y.Z or vX.Y.Z-rc.N",
);
const manifest = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(manifest.name, "@uthereal-sdk/cortex");
assert.equal(tag, `v${manifest.version}`, "Git tag and package version differ");
const { SDK_VERSION } = await import("../dist/version.js");
assert.equal(SDK_VERSION, manifest.version, "SDK and package versions differ");
assert.equal(
  git("status", "--porcelain"),
  "",
  "Release checkout must be clean",
);
const commit = git("rev-parse", "HEAD");
if (process.env.GITHUB_SHA) {
  assert.equal(
    commit,
    process.env.GITHUB_SHA,
    "Dispatch main only when its tip is the release tag, so provenance identifies the actual source",
  );
}
assert.equal(
  git("rev-parse", `${tag}^{commit}`),
  commit,
  "Checkout is not the tagged commit",
);
git("merge-base", "--is-ancestor", commit, "origin/main");
const changelog = await readFile("CHANGELOG.md", "utf8");
assert.ok(
  changelog.includes(`## ${manifest.version}\n`),
  "Version needs a changelog entry",
);
const response = await fetch(
  `https://registry.npmjs.org/@uthereal-sdk%2Fcortex/${manifest.version}`,
);
assert.equal(
  response.status,
  404,
  `Version already exists or registry check failed (${response.status})`,
);
const distTag = manifest.version.includes("-") ? "next" : "latest";
const outputs =
  `version=${manifest.version}\ndist_tag=${distTag}\ncommit=${commit}\n`;
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, outputs);
}
console.log(outputs);
