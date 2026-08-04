import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const port = 3100;
const basePath =
  process.env.SEWNCOVERS_GITHUB_PAGES === "true"
    ? "/sewncovers"
    : "";
const exportDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../out",
);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function exportedPath(requestUrl) {
  const url = new URL(requestUrl, `http://${host}:${port}`);
  let pathname = decodeURIComponent(url.pathname);

  if (basePath !== "") {
    if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) {
      return null;
    }

    pathname = pathname.slice(basePath.length) || "/";
  }

  const relativePath = pathname.endsWith("/")
    ? `${pathname}index.html`
    : pathname;
  const filePath = path.resolve(exportDirectory, `.${relativePath}`);

  return filePath.startsWith(`${exportDirectory}${path.sep}`)
    ? filePath
    : null;
}

const server = createServer(async (request, response) => {
  const filePath = exportedPath(request.url ?? "/");

  if (filePath === null) {
    response.writeHead(404).end();
    return;
  }

  try {
    const file = await stat(filePath);

    if (!file.isFile()) {
      response.writeHead(404).end();
      return;
    }

    response.writeHead(200, {
      "content-length": file.size,
      "content-type":
        contentTypes[path.extname(filePath)] ??
        "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
});

export function startStaticServer() {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}
