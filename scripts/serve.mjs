import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve("."),
  port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".md": "text/plain; charset=utf-8",
};
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost"),
      pathname = decodeURIComponent(url.pathname),
      path = resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    if (
      !path.startsWith(root + sep) ||
      pathname.split("/").some((p) => p.startsWith(".")) ||
      !types[extname(path)]
    ) {
      res.writeHead(404);
      res.end("No encontrado");
      return;
    }
    await stat(path);
    res.writeHead(200, {
      "Content-Type": types[extname(path)],
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404);
    res.end("No encontrado");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`TocToc: http://127.0.0.1:${port}`),
);
