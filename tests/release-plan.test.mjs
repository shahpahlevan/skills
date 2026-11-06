import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const plan = join(import.meta.dirname, "..", "scripts", "release-plan.mjs");

const author = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };

function git(cwd, ...args) {
  const run = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...author } });
  assert.equal(run.status, 0, run.stderr);
}

// A throwaway repo whose plugin manifest carries `version`, with `tags` already cut.
function repoAt(t, version, tags = []) {
  const dir = mkdtempSync(join(tmpdir(), "release-plan-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, ".claude-plugin"));
  writeFileSync(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "x", version }));
  git(dir, "init", "-q");
  git(dir, "commit", "-qm", "init", "--allow-empty");
  for (const tag of tags) git(dir, "tag", tag);
  return dir;
}

function runPlan(cwd, env = {}) {
  const run = spawnSync("node", [plan], { cwd, encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: "", ...env } });
  return { ...run, out: Object.fromEntries(run.stdout.trim().split("\n").filter(Boolean).map((l) => l.split("="))) };
}

test("a version with no tag yet is released", (t) => {
  const { status, out } = runPlan(repoAt(t, "1.0.0"));
  assert.equal(status, 0);
  assert.deepEqual(out, { version: "1.0.0", tag: "v1.0.0", release: "true" });
});

test("a push that leaves the version alone is a no-op", (t) => {
  const { status, out } = runPlan(repoAt(t, "1.0.0", ["v1.0.0"]));
  assert.equal(status, 0);
  assert.equal(out.release, "false");
});

test("a bumped version is released even when older tags exist", (t) => {
  const { out } = runPlan(repoAt(t, "1.1.0", ["v1.0.0"]));
  assert.deepEqual(out, { version: "1.1.0", tag: "v1.1.0", release: "true" });
});

test("a version that is not semver stops the release", (t) => {
  const { status } = runPlan(repoAt(t, "next"));
  assert.notEqual(status, 0);
});

test("the plan is written to GITHUB_OUTPUT for the workflow", (t) => {
  const dir = repoAt(t, "2.0.0", ["v1.0.0"]);
  const output = join(dir, "github-output");
  writeFileSync(output, "");
  runPlan(dir, { GITHUB_OUTPUT: output });
  assert.equal(readFileSync(output, "utf8"), "version=2.0.0\ntag=v2.0.0\nrelease=true\n");
});
