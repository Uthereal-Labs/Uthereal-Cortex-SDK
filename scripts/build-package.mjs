import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const configFile = ts.readConfigFile("tsconfig.package.json", ts.sys.readFile);
if (configFile.error) {
  throw new Error(
    ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"),
  );
}
const config = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  process.cwd(),
);
const program = ts.createProgram(config.fileNames, config.options);
const diagnostics = [...config.errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) {
  throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (file) => file,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => "\n",
  }));
}

await rm("dist", { recursive: true, force: true });
if (program.emit().emitSkipped) throw new Error("Package emission failed");

// TypeScript rewrites runtime imports but leaves source extensions in declarations.
for (const file of await readdir("dist", { recursive: true })) {
  if (!file.endsWith(".d.ts")) continue;
  const path = `dist/${file}`;
  const declaration = await readFile(path, "utf8");
  await writeFile(
    path,
    declaration.replace(
      /((?:from\s+|import\s*\(\s*)["'])(\.{1,2}\/[^"']+)\.tsx?(["'])/g,
      "$1$2.js$3",
    ),
  );
}
await cp("sdk/react/styles.css", "dist/react/styles.css");

// An installed package cannot rely on the host bundler resolving a bare worker
// specifier inside new URL(). Ship the exact renderer's worker alongside the JS.
const renderer = JSON.parse(
  await readFile(require.resolve("react-pdf/package.json"), "utf8"),
);
const pdf = JSON.parse(
  await readFile(require.resolve("pdfjs-dist/package.json"), "utf8"),
);
if (renderer.dependencies["pdfjs-dist"] !== pdf.version) {
  throw new Error(
    "React-PDF and the packaged PDF.js worker must have identical versions",
  );
}
const evidencePath = "dist/react/PdfEvidence.js";
const evidence = await readFile(evidencePath, "utf8");
const workerSpecifier = '"pdfjs-dist/build/pdf.worker.min.mjs"';
if (evidence.split(workerSpecifier).length !== 2) {
  throw new Error("Unexpected PDF worker initialization");
}
await writeFile(
  evidencePath,
  evidence.replace(workerSpecifier, '"./pdf.worker.min.mjs"'),
);
await cp(
  require.resolve("pdfjs-dist/build/pdf.worker.min.mjs"),
  "dist/react/pdf.worker.min.mjs",
);
await mkdir("dist/licenses", { recursive: true });
await cp(
  require.resolve("pdfjs-dist/LICENSE"),
  "dist/licenses/pdfjs-dist-LICENSE",
);
console.log("Built ESM, declarations, CSS and local PDF worker");
