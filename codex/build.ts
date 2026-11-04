import { mkdir, cp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dir, "..");
await mkdir(`${import.meta.dir}/dist`, { recursive: true });
for (const [entry, outfile] of [
  ["src/cli.ts", "cli.mjs"],
  ["src/server.ts", "server.mjs"],
  ["../mod/hooks/register.tsx", "pal.mjs"],
]) {
  const result = await Bun.build({
    entrypoints: [resolve(import.meta.dir, entry)],
    target: "node",
    tsconfig: resolve(import.meta.dir, "tsconfig.json"),
    plugins: [
      {
        name: "claude-runtime-adapter",
        setup(build) {
          build.onLoad({ filter: /register\.tsx$/ }, async ({ path }) => ({
            contents:
              "const jsx = globalThis.__capplJSX; const Fragment = 'fragment';\n" +
              (await Bun.file(path).text()) +
              '\nexport function setLanguage(value) { runtime.language = value }\nexport function snapshotRuntime() { const {queue, ...saved} = runtime; return {...saved, isSyncing: false} }\nexport function restoreRuntime(saved) { Object.assign(runtime, saved, {queue: Promise.resolve(), isSyncing: false, synced: \"\"}) }',
            loader: "tsx",
          }));
          build.onResolve({ filter: /^claude-code$/ }, () => ({
            path: resolve(import.meta.dir, "src/runtime.ts"),
          }));
        },
      },
    ],
  });
  if (!result.success) throw new Error(result.logs.join("\n"));
  await writeFile(
    `${import.meta.dir}/dist/${outfile}`,
    await result.outputs[0].text(),
  );
}
await cp(`${root}/mod/assets`, `${import.meta.dir}/assets`, {
  recursive: true,
});
await cp(
  `${import.meta.dir}/src/panel.html`,
  `${import.meta.dir}/dist/panel.html`,
);

// Reuse the original regression suite with only test-runner/import adaptation.
const originalTests = await Bun.file(`${root}/mod/tests/rules.test.ts`).text();
await writeFile(
  `${import.meta.dir}/dist/rules.test.ts`,
  originalTests
    .replace("claude-code/testing", "bun:test")
    .replaceAll("'../hooks", "'../../mod/hooks"),
);

// The same HTML uses Orca's worker bridge inside the sidebar and HTTP in browsers.
await cp(`${import.meta.dir}/orca`, `${import.meta.dir}/dist/orca`, { recursive: true });
await cp(`${import.meta.dir}/src/panel.html`, `${import.meta.dir}/dist/orca/panel.html`);
