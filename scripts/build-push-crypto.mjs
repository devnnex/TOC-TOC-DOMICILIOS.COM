import { build } from "esbuild";
import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
const marker = "// BEGIN GENERATED PUSH CRYPTO";
const serviceMarker = "// BEGIN GENERATED PUSH SERVICE";
const result = await build({
  entryPoints: ["backend/push-crypto.source.mjs"],
  bundle: true,
  format: "iife",
  globalName: "TocPushCrypto",
  target: "es2020",
  platform: "neutral",
  minify: true,
  legalComments: "inline",
  write: false,
});
let code = await readFile("Code.gs", "utf8");
code = code.split(serviceMarker)[0].split(marker)[0].trimEnd();
const service = await readFile("backend/push-service.gs", "utf8");
const licenses =
  (await readFile("node_modules/@noble/curves/LICENSE", "utf8")) +
  "\n" +
  (await readFile("node_modules/@noble/hashes/LICENSE", "utf8"));
await writeFile(
  "Code.gs",
  code +
    "\n\n" +
    serviceMarker +
    "\n" +
    service +
    "\n// END GENERATED PUSH SERVICE\n\n" +
    marker +
    "\n/*\n" +
    licenses +
    "\n*/\n" +
    result.outputFiles[0].text +
    "\n// END GENERATED PUSH CRYPTO\n",
);
await mkdir("vendor", { recursive: true });
await copyFile(
  "node_modules/@noble/curves/LICENSE",
  "vendor/noble-curves-LICENSE.txt",
);
await copyFile(
  "node_modules/@noble/hashes/LICENSE",
  "vendor/noble-hashes-LICENSE.txt",
);
console.log(
  "Firma de avisos integrada en Code.gs; no contiene claves privadas.",
);
