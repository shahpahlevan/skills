import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const script = join(import.meta.dirname, "..", "skills", "pre-launch-check", "scripts", "go-live-check.sh");
const run = promisify(execFile);

// A stand-in site on localhost that answers 404 to everything and records each request.
async function fakeSite(t) {
  const requests = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      requests.push({ method: req.method, path: req.url, body });
      res.writeHead(404, { "content-type": "text/html" }).end("<title>Not found</title>");
    });
  });
  await new Promise((resolve) => server.listen(0, "localhost", resolve));
  t.after(() => server.close());
  return { url: "http" + "://localhost:" + server.address().port, requests };
}

// A stand-in `wp` on PATH. `searchReplace` is the shell body run for `wp search-replace`.
function fakeWp(t, searchReplace) {
  const bin = mkdtempSync(join(tmpdir(), "go-live-wp-"));
  t.after(() => rmSync(bin, { recursive: true, force: true }));
  writeFileSync(
    join(bin, "wp"),
    `#!/bin/sh
for a in "$@"; do
  case "$a" in
    siteurl) echo "$FAKE_SITE"; exit 0 ;;
    blog_public) echo 1; exit 0 ;;
    search-replace) ${searchReplace} ;;
  esac
done
exit 1
`,
  );
  chmodSync(join(bin, "wp"), 0o755);
  return bin;
}

async function goLiveCheck(site, args = [], bin) {
  const env = { ...process.env, FAKE_SITE: site.url };
  if (bin) env.PATH = `${bin}:${process.env.PATH}`;
  try {
    const { stdout, stderr } = await run("bash", [script, site.url, "--timeout", "5", ...args], { env });
    return { status: 0, stdout, stderr };
  } catch (error) {
    return { status: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

const line = (stdout, name) => stdout.split("\n").find((l) => l.includes(name)) ?? "";
const staging = ["--wp-path", "/srv/site", "--staging", "https://staging.example.com"];

// WP-CLI's real flag is --report-changed-only; anything else is an unknown-parameter error.
const realSearchReplace = `case "$*" in
  *--report-changed-only*) echo "Success: 3 replacements to be made."; exit 0 ;;
  *) echo "Error: unknown --report-changes-only parameter" >&2; exit 1 ;;
esac`;

test("staging URLs left in the database fail the check", async (t) => {
  const site = await fakeSite(t);
  const { status, stdout } = await goLiveCheck(site, staging, fakeWp(t, realSearchReplace));
  assert.equal(status, 2, stdout);
  assert.match(line(stdout, "No staging URLs"), /FAIL.*3 values/);
});

test("a search-replace dry run that errors fails the check, never passes it", async (t) => {
  const site = await fakeSite(t);
  const broken = `echo "Error: Error establishing a database connection." >&2; exit 1`;
  const { stdout } = await goLiveCheck(site, staging, fakeWp(t, broken));
  assert.match(line(stdout, "No staging URLs"), /FAIL/);
});

test("the wp-cron.php check never runs the site's cron", async (t) => {
  const site = await fakeSite(t);
  await goLiveCheck(site);
  const cron = site.requests.filter((r) => r.path.startsWith("/wp-cron.php"));
  assert.ok(cron.length > 0, "wp-cron.php is checked");
  // WordPress runs cron on any request to wp-cron.php except a POST with a body.
  for (const r of cron) {
    assert.equal(r.method, "POST", `${r.method} ${r.path}`);
    assert.notEqual(r.body, "");
  }
});

test("go-live-check.sh runs against example.com and prints its results", async () => {
  const site = { url: "https://example.com" };
  const { status, stdout, stderr } = await goLiveCheck(site);
  // 0 = every check passed, 2 = at least one check failed. Anything else is the
  // script itself going wrong.
  assert.ok([0, 2].includes(status), `exit ${status}\n${stderr}`);
  assert.equal(stderr, "");
  assert.match(stdout, /SETUP\s+PASS \d+\s+FAIL \d+\s+SKIP \d+/);
  assert.match(stdout, /SECURITY\s+PASS \d+\s+FAIL \d+\s+SKIP \d+/);
});
