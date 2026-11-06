import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const validator = join(
  import.meta.dirname, "..", "skills", "register-site", "scripts", "validate-sites.mjs",
);

// A registry the skill would write for a freshly registered production site.
const good = () => ({
  schema_version: 1,
  environments: {
    production: {
      site_url: "https://example.com",
      ssh_alias: "example-production",
      ssh_host: "server1.example.com",
      ssh_port: 22,
      ssh_user: "exampleuser",
      wp_root: "/home/exampleuser/public_html",
      db_name: "exampleuser_wp",
      db_user: "exampleuser_wpuser",
      table_prefix: "wp_",
      ip_allowlist_expiry: "2026-12-04",
      note: "Identity check: wp option get siteurl must equal site_url before any write.",
    },
  },
});

// Runs the validator the way the skill tells an agent to: on a sites.json path.
function validate(content) {
  const dir = mkdtempSync(join(tmpdir(), "sites-"));
  try {
    const file = join(dir, "sites.json");
    writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content, null, 2));
    return spawnSync("node", [validator, file], { encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a complete registry passes", () => {
  const run = validate(good());
  assert.equal(run.status, 0, run.stdout + run.stderr);
});

test("a file that is not JSON fails, and a missing file is a usage error", () => {
  const broken = validate("{ \"schema_version\": 1, ");
  assert.equal(broken.status, 1, broken.stdout + broken.stderr);
  assert.match(broken.stdout, /not valid JSON/);

  const missing = spawnSync("node", [validator, join(tmpdir(), "no-such-sites.json")], {
    encoding: "utf8",
  });
  assert.equal(missing.status, 2, missing.stdout + missing.stderr);
});

test("an environment missing a field the skill reads off the box fails, naming it", () => {
  const registry = good();
  delete registry.environments.production.wp_root;
  const run = validate(registry);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /production\.wp_root/);
});

test("a registry with no environments, or the wrong schema version, fails", () => {
  const empty = validate({ schema_version: 1, environments: {} });
  assert.equal(empty.status, 1, empty.stdout + empty.stderr);

  const wrongVersion = validate({ ...good(), schema_version: 2 });
  assert.equal(wrongVersion.status, 1, wrongVersion.stdout + wrongVersion.stderr);
  assert.match(wrongVersion.stdout, /schema_version/);
});

test("a stored password fails, wherever it sits", () => {
  const registry = good();
  registry.environments.production.db_password = "hunter2";
  const run = validate(registry);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /production\.db_password/);
  assert.doesNotMatch(run.stdout, /hunter2/, "the validator never echoes a secret");

  const nested = good();
  nested.environments.production.cpanel = { Password: "hunter2" };
  assert.equal(validate(nested).status, 1);
});

test("a placeholder or empty value fails: the skill writes real values or nothing", () => {
  for (const value of ["<TBD>", "<from wp config get DB_NAME>", "", "  "]) {
    const registry = good();
    registry.environments.production.db_name = value;
    const run = validate(registry);
    assert.equal(run.status, 1, `${JSON.stringify(value)}: ${run.stdout}`);
    assert.match(run.stdout, /production\.db_name/);
  }
});

test("a field of the wrong shape fails, naming it", () => {
  const cases = [
    ["ssh_port", "22"],
    ["ssh_port", 0],
    ["site_url", "example.com"],
    ["wp_root", "public_html"],
  ];
  for (const [field, value] of cases) {
    const registry = good();
    registry.environments.production[field] = value;
    const run = validate(registry);
    assert.equal(run.status, 1, `${field}=${JSON.stringify(value)}: ${run.stdout}`);
    assert.match(run.stdout, new RegExp(`production\\.${field}`));
  }
});

test("the allow-list expiry is a real date or an UNKNOWN with its reason", () => {
  const unknown = good();
  unknown.environments.production.ip_allowlist_expiry =
    "UNKNOWN: the host said the address was already allowed and gave no start date";
  assert.equal(validate(unknown).status, 0);

  const absent = good();
  delete absent.environments.production.ip_allowlist_expiry;
  assert.equal(validate(absent).status, 0, "hosts without an allow-list leave it out");

  for (const value of ["next month", "2026-13-40", "UNKNOWN"]) {
    const registry = good();
    registry.environments.production.ip_allowlist_expiry = value;
    const run = validate(registry);
    assert.equal(run.status, 1, `${JSON.stringify(value)}: ${run.stdout}`);
    assert.match(run.stdout, /production\.ip_allowlist_expiry/);
  }
});
