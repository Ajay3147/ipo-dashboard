// Local development server + secure IPO Guru API proxy.
// Requires Node.js 18+ (uses built-in fetch; no npm dependencies).
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const API_URL = "https://www.ipoguru.in/api/v2/ipos";

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon"
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/ipos") {
    const key = process.env.IPOGURU_API_KEY;
    if (!key) {
      return send(res, 400, {
        error: "API key not configured",
        message: "Add your IPO Guru key to the IPOGURU_API_KEY value in .env, then restart the server."
      });
    }
    try {
      const upstream = await fetch(API_URL, {
        method: "GET",
        headers: { "X-API-KEY": key, "Accept": "application/json" }
      });
      const raw = await upstream.text();
      let data;
      try { data = JSON.parse(raw); } catch { data = { raw }; }
      return send(res, upstream.status, data);
    } catch (err) {
      return send(res, 502, {
        error: "Unable to reach IPO Guru",
        message: err.message
      });
    }
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, { error: "Method not allowed" });
  }

  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.resolve(ROOT, "." + pathname);
  if (!filePath.startsWith(ROOT + path.sep)) return send(res, 403, { error: "Forbidden" });

  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "Not found", "text/plain; charset=utf-8");
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`IPO Dashboard running at http://localhost:${PORT}`);
  console.log(process.env.IPOGURU_API_KEY ? "IPO Guru API key loaded." : "API key not set yet. Configure .env.");
});
