import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const manifest = JSON.parse(await readFile("package.json", "utf8"));
const pnpm = process.env.npm_execpath;
assert.ok(pnpm, "Run this check through pnpm test:package");
const temporary = await mkdtemp(`${tmpdir()}/cortex-package-`);
const run = (command, args, cwd = temporary) =>
  execFileSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, CI: "true" },
  });
const install = (cwd) =>
  run(process.execPath, [
    pnpm,
    "install",
    "--ignore-scripts",
    "--config.auto-install-peers=false",
  ], cwd);

try {
  let tarball = process.argv[2] && resolve(process.argv[2]);
  if (!tarball) {
    await mkdir(".cache/package", { recursive: true });
    run(process.execPath, [
      pnpm,
      "pack",
      "--pack-destination",
      ".cache/package",
    ], root);
    tarball = resolve(
      `.cache/package/uthereal-sdk-cortex-${manifest.version}.tgz`,
    );
  }
  const entries = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
    .trim().split("\n");
  for (const entry of entries) {
    assert.match(
      entry,
      /^package\/(?:dist\/|package\.json$|openapi\.json$|(?:README|INTEGRATING|CHANGELOG|SECURITY|THIRD_PARTY_NOTICES)\.md$|LICENSE$)/,
    );
    assert.ok(!entry.includes(".."), `Unsafe archive path: ${entry}`);
  }
  const packed = JSON.parse(
    execFileSync("tar", ["-xOzf", tarball, "package/package.json"], {
      encoding: "utf8",
    }),
  );
  assert.equal(packed.name, "@uthereal-sdk/cortex");
  assert.equal(packed.version, manifest.version);
  assert.deepEqual(packed.dependencies, { zod: "3.23.8" });
  assert.ok(entries.includes("package/dist/react/pdf.worker.min.mjs"));
  assert.ok(entries.includes("package/dist/licenses/pdfjs-dist-LICENSE"));
  const digest = createHash("sha512").update(await readFile(tarball)).digest(
    "base64",
  );
  console.log(`Testing ${tarball}\nIntegrity: sha512-${digest}`);

  const core = `${temporary}/core`;
  await mkdir(core);
  await writeFile(
    `${core}/package.json`,
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: { "@uthereal-sdk/cortex": `file:${tarball}` },
      devDependencies: { typescript: manifest.devDependencies.typescript },
    }),
  );
  await writeFile(`${core}/.npmrc`, "auto-install-peers=false\n");
  install(core);
  const require = createRequire(`${core}/package.json`);
  for (const dependency of Object.keys(manifest.peerDependencies)) {
    assert.throws(
      () => require.resolve(dependency),
      `Core-only install pulled in ${dependency}`,
    );
  }
  const fixture = await readFile("examples/ask/response.ndjson", "utf8");
  await writeFile(
    `${core}/smoke.mjs`,
    `
import assert from 'node:assert/strict';
import { SDK_VERSION, readAnswers } from '@uthereal-sdk/cortex';
import { CortexClient, createCortexHandler } from '@uthereal-sdk/cortex/server';
import { createCortexBrowserClient } from '@uthereal-sdk/cortex/browser';
assert.equal(SDK_VERSION, ${JSON.stringify(manifest.version)});
assert.equal(typeof createCortexHandler, 'function');
assert.equal(typeof createCortexBrowserClient, 'function');
const client = new CortexClient({assistantId:'fixture-agent', apiKey:'fixture-key', baseUrl:'https://example.invalid/functions/v1/api-server-proxy'}, async () => new Response(${
      JSON.stringify(fixture)
    }));
let answer;
for await (const snapshot of readAnswers(await client.ask('owner', 'session', {message:'Garden'}))) answer = snapshot;
assert.ok(answer.utterance.length);
assert.ok(answer.references.inline.length);
console.log('Installed package: Node/Deno streaming and metadata passed');
`,
  );
  run(process.execPath, ["smoke.mjs"], core);
  run("deno", [
    "run",
    "--no-config",
    "--node-modules-dir=manual",
    "--allow-read",
    "smoke.mjs",
  ], core);
  await writeFile(
    `${core}/types.ts`,
    `
import { type Answer, SDK_VERSION } from '@uthereal-sdk/cortex';
import { CortexClient, createCortexHandler, type CortexStore } from '@uthereal-sdk/cortex/server';
import { createCortexBrowserClient } from '@uthereal-sdk/cortex/browser';
const version: string = SDK_VERSION;
export type Saved = { answer: Answer; store: CortexStore };
export { version, CortexClient, createCortexHandler, createCortexBrowserClient };
`,
  );
  for (const resolution of ["NodeNext", "Bundler"]) {
    run(process.execPath, [
      pnpm,
      "exec",
      "tsc",
      "--noEmit",
      "--strict",
      "--target",
      "ES2022",
      "--module",
      resolution === "NodeNext" ? "NodeNext" : "ESNext",
      "--moduleResolution",
      resolution,
      "types.ts",
    ], core);
  }

  for (const react of ["18.3.1", manifest.devDependencies.react]) {
    const app = `${temporary}/react-${react}`;
    await mkdir(`${app}/src`, { recursive: true });
    await cp("examples", `${app}/examples`, { recursive: true });
    const replay = (await readFile("src/Replay.tsx", "utf8"))
      .replace('"../sdk/react.ts"', '"@uthereal-sdk/cortex/react"')
      .replace('"../sdk/core.ts"', '"@uthereal-sdk/cortex/core"');
    await writeFile(`${app}/src/Replay.tsx`, replay);
    await writeFile(
      `${app}/package.json`,
      JSON.stringify({
        private: true,
        type: "module",
        dependencies: {
          "@uthereal-sdk/cortex": `file:${tarball}`,
          ...Object.fromEntries(
            Object.keys(manifest.peerDependencies).map((
              key,
            ) => [key, manifest.devDependencies[key]]),
          ),
          react,
          "react-dom": react,
        },
        devDependencies: Object.fromEntries(
          ["vite", "typescript", "@types/react", "@types/react-dom"].map((
            key,
          ) => [key, manifest.devDependencies[key]]),
        ),
      }),
    );
    await writeFile(
      `${app}/index.html`,
      '<div id="root"></div><script type="module" src="/src/main.tsx"></script>',
    );
    await writeFile(
      `${app}/src/main.tsx`,
      `
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Replay } from './Replay';
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><Replay /></QueryClientProvider>);
`,
    );
    await writeFile(
      `${app}/adapters.ts`,
      `
export * from '@uthereal-sdk/cortex/adapters/supabase-browser';
export * from '@uthereal-sdk/cortex/adapters/supabase-server';
`,
    );
    if (react.startsWith("18.")) {
      const appManifest = JSON.parse(
        await readFile(`${app}/package.json`, "utf8"),
      );
      appManifest.devDependencies["@types/react"] = "18.3.18";
      appManifest.devDependencies["@types/react-dom"] = "18.3.5";
      await writeFile(`${app}/package.json`, JSON.stringify(appManifest));
    }
    const config = JSON.parse(await readFile("tsconfig.json", "utf8"));
    config.compilerOptions.skipLibCheck = false;
    config.include = ["src"];
    await writeFile(`${app}/tsconfig.json`, JSON.stringify(config));
    install(app);
    run(process.execPath, [pnpm, "exec", "tsc", "--noEmit"], app);
    // Supabase 2.104.0 has upstream declaration errors under full library
    // checking; type-check our adapter usage with the demo's skipLibCheck.
    run(process.execPath, [
      pnpm,
      "exec",
      "tsc",
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "adapters.ts",
    ], app);
    run(process.execPath, [
      "--input-type=module",
      "-e",
      "import {createSupabaseStore} from '@uthereal-sdk/cortex/adapters/supabase-server'; import {createSupabaseFetch} from '@uthereal-sdk/cortex/adapters/supabase-browser'; if (typeof createSupabaseStore !== 'function' || typeof createSupabaseFetch !== 'function') throw new Error('Adapter exports missing');",
    ], app);
    run(process.execPath, [pnpm, "exec", "vite", "build"], app);
    const assets = await readdir(`${app}/dist/assets`);
    assert.ok(
      assets.some((file) =>
        file.startsWith("pdf.worker.min-") && file.endsWith(".mjs")
      ),
    );
    assert.ok(assets.some((file) => file.endsWith(".css")));
    for (const asset of assets.filter((file) => file.endsWith(".js"))) {
      const content = await readFile(`${app}/dist/assets/${asset}`, "utf8");
      assert.ok(!content.includes("CORTEX_SHARED_API_KEY"));
      assert.ok(!content.includes("fixture-key"));
    }
    // A host can use PdfEvidence without CitedAnswer; its CSS must survive
    // tree shaking even when the sibling renderer is never imported.
    await writeFile(
      `${app}/pdf-only.ts`,
      `
import { PdfEvidence } from '@uthereal-sdk/cortex/react';
globalThis.cortexPdfEvidence = PdfEvidence;
`,
    );
    await writeFile(
      `${app}/vite.pdf.config.mjs`,
      `
export default {build: {outDir: 'dist-pdf', rollupOptions: {input: 'pdf-only.ts'}}};
`,
    );
    run(process.execPath, [
      pnpm,
      "exec",
      "vite",
      "build",
      "--config",
      "vite.pdf.config.mjs",
    ], app);
    assert.ok(
      (await readdir(`${app}/dist-pdf/assets`)).some((file) =>
        file.endsWith(".css")
      ),
      "PdfEvidence alone lost its stylesheet",
    );
    const server = spawn(process.execPath, [
      `${app}/node_modules/vite/bin/vite.js`,
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      "4179",
      "--strictPort",
    ], { cwd: app, stdio: ["ignore", "pipe", "pipe"] });
    try {
      let serverOutput = "";
      server.stderr.on("data", (data) => {
        serverOutput += data.toString();
      });
      server.stdout.on("data", (data) => {
        serverOutput += data.toString();
      });
      const deadline = Date.now() + 30000;
      while (true) {
        if (server.exitCode !== null) {
          throw new Error(`Vite exited: ${serverOutput}`);
        }
        try {
          const response = await fetch("http://127.0.0.1:4179", {
            signal: AbortSignal.timeout(1000),
          });
          if (response.ok) break;
        } catch { /* The local preview server is still starting. */ }
        if (Date.now() >= deadline) {
          throw new Error(`Vite preview timed out: ${serverOutput}`);
        }
        await delay(100);
      }
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto("http://127.0.0.1:4179");
        await page.getByRole("button", {
          name: "Open reference 7",
          exact: true,
        }).first().click();
        await page.locator("canvas").waitFor({ state: "visible" });
        assert.ok(await page.getByLabel("Cited passage highlight").isVisible());
        const styles = await page.getByLabel("Cited passage highlight")
          .evaluate((element) => getComputedStyle(element).position);
        assert.equal(styles, "absolute");
        await page.getByRole("combobox", { name: /Account/ }).selectOption(
          "fixture-account-b",
        );
        assert.equal(await page.locator("canvas").count(), 0);
        await page.getByRole("button", {
          name: "Open reference 9",
          exact: true,
        }).first().click();
        assert.ok(
          await page.getByText("Text-only evidence; no PDF geometry supplied.")
            .isVisible(),
        );
        assert.deepEqual(errors, []);
        console.log(
          `Installed React ${react}: production PDF worker, citation, CSS and account cleanup passed`,
        );
      } finally {
        await browser.close();
      }
    } finally {
      server.kill("SIGTERM");
      await new Promise((done) =>
        server.exitCode !== null ? done() : server.once("exit", done)
      );
    }
  }
  console.log("Packed-package checks passed");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
