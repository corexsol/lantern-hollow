const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "..");
http
  .createServer((req, res) => {
    let file;
    try {
      file = path.resolve(
        root,
        "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
      );
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (file === root) file = path.join(root, "index.html");
    if (
      !file.startsWith(root + path.sep) ||
      file.split(path.sep).some((p) => p.startsWith("."))
    ) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (error, body) => {
      if (error) {
        res.writeHead(404).end();
        return;
      }
      res.setHeader(
        "Content-Type",
        file.endsWith(".svg") ? "image/svg+xml" : file.endsWith(".js")
          ? "text/javascript; charset=utf-8"
          : file.endsWith(".html")
            ? "text/html; charset=utf-8"
            : "text/plain; charset=utf-8",
      );
      res.end(body);
    });
  })
  .listen(8080, "127.0.0.1", () => console.log("Open http://localhost:8080"));
