import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { promisify } from "node:util";

const skill = join(import.meta.dirname, "..", "skills", "launch-security-check");
const script = join(skill, "scripts", "check.sh");
const run = promisify(execFile);

// A stand-in site on localhost that answers every request with one status and records it.
async function fakeSite(t, status = 404) {
  const requests = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      requests.push({ method: req.method, path: req.url, body });
      res.writeHead(status, { "content-type": "text/html" }).end("<title>A page</title>");
    });
  });
  await new Promise((resolve) => server.listen(0, "localhost", resolve));
  t.after(() => server.close());
  return { url: "http" + "://localhost:" + server.address().port, requests };
}

async function check(args) {
  try {
    const { stdout, stderr } = await run("bash", [script, ...args]);
    return { status: 0, stdout, stderr };
  } catch (error) {
    return { status: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

const line = (stdout, id) => stdout.split("\n").find((l) => l.startsWith(id)) ?? "";
const ids = (text, pattern) => [...text.matchAll(pattern)].map((m) => m[1]);

test("the wp-cron.php check never runs the site's cron", async (t) => {
  const site = await fakeSite(t);
  await check([site.url, "--timeout", "5"]);
  const cron = site.requests.filter((r) => r.path.includes("wp-cron.php"));
  assert.ok(cron.length > 0, "wp-cron.php is checked");
  // WordPress runs cron on any request to wp-cron.php except a POST with a body.
  for (const r of cron) {
    assert.equal(r.method, "POST", `${r.method} ${r.path}`);
    assert.notEqual(r.body, "");
  }
});

test("check.sh runs against example.com and prints its summary line", async () => {
  const { status, stdout, stderr } = await check(["https://example.com"]);
  // 0 = no check failed, 2 = at least one failed. Anything else is the script going wrong.
  assert.ok([0, 2].includes(status), `exit ${status}\n${stderr}`);
  assert.equal(stderr, "");
  assert.match(stdout, /SECURITY\s+PASS \d+\s+FAIL \d+\s+SKIP \d+/);
});

test("a site with no CDN gets N/A on the origin check, not a FAIL", async (t) => {
  const site = await fakeSite(t);
  const { stdout } = await check([site.url, "--no-cdn", "--timeout", "5"]);
  assert.match(line(stdout, "WP-14"), /^WP-14\s+N\/A/);
});

test("a site serving plain HTTP with a 200 fails the HTTPS redirect check", async (t) => {
  const site = await fakeSite(t, 200);
  const { status, stdout } = await check([site.url, "--timeout", "5"]);
  assert.equal(status, 2, stdout);
  assert.match(line(stdout, "WP-17"), /^WP-17\s+FAIL/);
});

test("a run with no URL is a usage error", async () => {
  const { status, stderr } = await check([]);
  assert.equal(status, 1);
  assert.match(stderr, /site URL/);
});

test("every check in SKILL.md has a line from the script and a fix in FIXES.md", async (t) => {
  const skillMd = readFileSync(join(skill, "SKILL.md"), "utf8");
  const checks = ids(skillMd, /^\| (WP-\d+) \|/gm);
  assert.equal(new Set(checks).size, checks.length, "no check id is listed twice");
  // The count the description, the report and the site's title all state.
  assert.equal(checks.length, 19);
  assert.match(skillMd, new RegExp(`^description:.*\\b${checks.length} checks\\b`, "m"));

  assert.deepEqual(ids(readFileSync(join(skill, "FIXES.md"), "utf8"), /^## (WP-\d+) /gm), checks);

  const site = await fakeSite(t);
  const { stdout } = await check([site.url, "--timeout", "5"]);
  assert.deepEqual(ids(stdout, /^(WP-\d+) /gm), checks);
});
