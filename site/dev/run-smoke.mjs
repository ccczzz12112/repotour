// 用 rolldown 把 TS 冒烟脚本打包后在 Node 里执行：node dev/run-smoke.mjs [repo-url]
import { rolldown } from "rolldown";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const outDir = path.resolve("node_modules/.cache");
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "pipeline-smoke.mjs");

const build = await rolldown({
  input: "dev/pipeline-smoke.ts",
  platform: "node",
  define: { "import.meta.env.BASE_URL": '"/"' },
});
await build.write({ file: outFile, format: "esm" });
await build.close();
await import(pathToFileURL(outFile).href);