/* سرور استاتیک کوچک برای اجرای تست‌های مرورگری پروژه.
 * استفاده:  node test/serve.js <root> <port>
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const port = Number(process.argv[3] || 8791);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".md": "text/markdown; charset=utf-8"
};

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const file = path.join(root, urlPath);
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404);
        res.end("not found: " + urlPath);
        return;
      }
      res.writeHead(200, {
        "content-type": TYPES[path.extname(file)] || "application/octet-stream",
        "cache-control": "no-store"
      });
      res.end(buf);
    });
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`serving ${root} at http://127.0.0.1:${port}/`);
  });
