// Verify the Instagram proxy fetch path end-to-end against a local fixture
// server (no paid key needed):
//
//   node --experimental-strip-types --import ./scripts/register-paths.mjs scripts/test-ig-proxy.mjs
//
// Covers:
//  1. template mode  — IG_PROXY_URL with {url} placeholder (ScraperAPI style):
//     real HTTP via curl → status handling → user-object parsing
//  2. not-found shape — IG's 404 → "not_found" reason
//  3. dev-fixture mode — the in-process fixture used for staging smoke tests
//
// The plain-proxy (-x) branch shares the same curl call and only adds the
// -x flag; verify it against your real proxy endpoint when the key arrives:
//   IG_PROXY_URL=http://user:pass@host:port npm run ... (staging smoke)

import http from "node:http";
import { proxiedIgUser } from "../src/lib/meta-enrich.ts";

const fixtureUser = (username) => {
  if (username.startsWith("notfound")) return null;
  return {
    full_name: `Test ${username}`,
    biography: `Bio for @${username} (fixture)`,
    profile_pic_url: "https://picsum.photos/seed/meta-test/200",
  };
};

// Minimal unblocker-style endpoint: GET /proxy?url=<encoded target>
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://127.0.0.1");
  if (u.pathname !== "/proxy") {
    res.writeHead(404).end("no such route");
    return;
  }
  const target = new URL(u.searchParams.get("url"));
  const username = target.searchParams.get("username");
  const user = username ? fixtureUser(username) : null;
  if (!user) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "User not found", status: "fail" }));
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ data: { user }, status: "ok" }));
});

await new Promise((r) => server.listen(8788, "127.0.0.1", r));

let fails = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "OK  " : "FAIL"} ${name}${extra ? "  " + extra : ""}`);
  if (!cond) fails++;
};

// 1. template mode
process.env.IG_PROXY_URL = "http://127.0.0.1:8788/proxy?url={url}";
try {
  const t0 = Date.now();
  const user = await proxiedIgUser("nasa", 8000);
  check("template mode: parse user object", !!user && user.full_name === "Test nasa", `${Date.now() - t0}ms`);
} catch (e) {
  check("template mode: parse user object", false, String(e.message ?? e));
}

// 2. not-found → typed reason
try {
  await proxiedIgUser("notfound.user", 8000);
  check("not-found: throws", false, "returned without throwing");
} catch (e) {
  check("not-found: typed reason", /not_found/.test(String(e.message)), String(e.message));
}

// 3. dev-fixture mode (used for the staging smoke test)
process.env.IG_PROXY_URL = "dev-fixture://";
try {
  const user = await proxiedIgUser("khaby.lame", 1000);
  check("dev-fixture: deterministic payload", /khaby/i.test(String(user?.full_name ?? "")) && /fixture/.test(String(user?.full_name ?? "")));
} catch (e) {
  check("dev-fixture: deterministic payload", false, String(e.message ?? e));
}

server.close();
process.exit(fails ? 1 : 0);
