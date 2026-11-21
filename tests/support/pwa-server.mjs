import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { environment } from "./gas.mjs";
// All page and worker requests use this same-origin, in-memory backend.
// No interception gap can send a service or notification to the live Sheet.
export async function startPwaServer() {
  const backend = environment(),
    requests = [],
    root = resolve("."),
    prefix = "/TOC-TOC-DOMICILIOS.COM/";
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".png": "image/png",
    ".webmanifest": "application/manifest+json",
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (!url.pathname.startsWith(prefix)) throw new Error("scope");
      const relative = url.pathname.slice(prefix.length) || "index.html";
      if (relative === "__test-api") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const p = JSON.parse(body);
        requests.push(p.action);
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify(backend.call(p.action, p.data, p.session)));
        return;
      }
      const file = resolve(root, relative);
      if (
        !file.startsWith(root + sep) ||
        relative.includes("..") ||
        !types[extname(file)]
      )
        throw new Error("file");
      let content = await readFile(file);
      if (relative === "config.js")
        content = content
          .toString()
          .replace(/apiUrl:\s*"[^"]*"/, `apiUrl: "${prefix}__test-api"`);
      res.writeHead(200, {
        "Content-Type": types[extname(file)],
        "Cache-Control": "no-store",
      });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    backend,
    requests,
    base: `http://127.0.0.1:${server.address().port}${prefix}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
