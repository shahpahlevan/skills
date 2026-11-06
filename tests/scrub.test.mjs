import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const fixtures = join(root, "checks", "fixtures");

// `privateList` is the path of the private-term list; "" means none.
function scrub(dir, privateList = "") {
  return spawnSync("node", [join(root, "checks", "scrub.mjs"), dir], {
    encoding: "utf8",
    env: { ...process.env, SCRUB_PRIVATE_LIST: privateList },
  });
}

// A made-up private-term list, standing in for the real one kept outside the repo.
function madeUpList(t) {
  const dir = mkdtempSync(join(tmpdir(), "skills-scrub-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "private-terms.txt");
  writeFileSync(path, "# made-up names\nZorvik\n\n09 Back Office\n");
  return path;
}

test("a clean tree passes, example.com and its subdomains included", () => {
  const run = scrub(join(fixtures, "scrub.clean"));
  assert.equal(run.status, 0, run.stdout + run.stderr);
});

// Each banned pattern has its own fixture; the check must name the rule it broke.
const failing = [
  ["ip", "ip-address"],
  ["ipv6", "ip-address"],
  ["hostname", "hostname"],
  ["lookalike-host", "hostname"],
  ["rare-tld", "hostname"],
  ["sop-id", "sop-gl-id"],
  ["gl-id", "sop-gl-id"],
  ["wikilink", "wikilink"],
  ["home-path", "home-path"],
];

for (const [fixture, rule] of failing) {
  test(`the ${fixture} fixture fails on ${rule}`, () => {
    const run = scrub(join(fixtures, `scrub.${fixture}`));
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(run.stdout, new RegExp(`SKILL\\.md:\\d+: ${rule}: `));
  });
}

test("a term on the private list fails, each one named", (t) => {
  const run = scrub(join(fixtures, "scrub.private-term"), madeUpList(t));
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /SKILL\.md:1: private-term: Zorvik$/m);
  assert.match(run.stdout, /SKILL\.md:1: private-term: 09 Back Office$/m);
});

test("private terms match whole words, case and all", (t) => {
  const run = scrub(join(fixtures, "scrub.clean"), madeUpList(t));
  assert.equal(run.status, 0, run.stdout + run.stderr);
});

test("a private list named but missing fails rather than passing unchecked", () => {
  const run = scrub(join(fixtures, "scrub.clean"), join(tmpdir(), "no-such-private-list.txt"));
  assert.equal(run.status, 2, run.stdout + run.stderr);
});

test("the repo itself passes, outside its own fixtures", () => {
  const run = spawnSync("node", [join(root, "checks", "scrub.mjs")], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
