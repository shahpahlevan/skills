import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { repo } from "./skills.mjs";

const dir = join(repo, "release-notes");
const { version } = JSON.parse(readFileSync(join(repo, ".claude-plugin", "plugin.json"), "utf8"));

test("every release notes file is named for a version tag", () => {
  for (const file of readdirSync(dir)) assert.match(file, /^v\d+\.\d+\.\d+\.md$/);
});

// A major version removes or renames something an installer names, so it must say what.
test("a major version ships with its own release notes", { skip: !/^\d+\.0\.0$/.test(version) && "not a major version" }, () => {
  assert.ok(existsSync(join(dir, `v${version}.md`)), `release-notes/v${version}.md is missing`);
});

test("the 2.0.0 notes give the rename, the new skill and the run order", () => {
  const notes = readFileSync(join(dir, "v2.0.0.md"), "utf8");
  assert.match(notes, /`pre-launch-check` became `launch-check`/);
  assert.match(notes, /`launch-security-check` is new/);
  assert.match(notes, /Run `launch-security-check` first[^]*Run `launch-check` second/);
  assert.match(notes, /both say GO/);
  assert.doesNotMatch(notes, /—/);
});
