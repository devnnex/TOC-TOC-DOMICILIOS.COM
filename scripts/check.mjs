import { readFile, readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { Script } from "node:vm";
const files = await readdir("assets");
for (const name of files.filter((x) => x.endsWith(".js"))) {
  const r = spawnSync(process.execPath, ["--check", `assets/${name}`], {
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
}
new Script(await readFile("Code.gs", "utf8"), { filename: "Code.gs" });
for (const name of ["index.html", "admin.html"]) {
  const html = await readFile(name, "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  if (new Set(ids).size !== ids.length)
    throw new Error(`IDs repetidos en ${name}`);
  for (const m of html.matchAll(/(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
    const path = m[1];
    if (/^(https?:|mailto:|tel:)/.test(path)) continue;
    await stat(path);
  }
}
for (const file of ["config.js", "appsscript.json", "package.json"]) {
  const source = await readFile(file, "utf8");
  if (file.endsWith(".json")) JSON.parse(source);
}
console.log(
  "Sintaxis, JSON, identificadores y archivos referenciados: correctos.",
);
