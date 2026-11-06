import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repo, skills } from "./skills.mjs";
const manifest = () => JSON.parse(readFileSync(join(repo, ".claude-plugin", "plugin.json"), "utf8"));

test("the plugin manifest lists exactly the skills in the skills folder", () => {
  const listed = manifest().skills.map((path) => path.replace(/^\.\/skills\//, "").replace(/\/$/, ""));
  assert.deepEqual([...listed].sort(), skills);
});

// Claude Code is the judge of a valid plugin; skip only where it is not installed (CI).
const claude = spawnSync("claude", ["--version"], { encoding: "utf8" });
test("Claude Code accepts the plugin and its marketplace", { skip: claude.status !== 0 && "claude CLI not installed" }, () => {
  for (const target of [join(repo, ".claude-plugin", "plugin.json"), join(repo, ".claude-plugin", "marketplace.json")]) {
    const run = spawnSync("claude", ["plugin", "validate", "--strict", target], { encoding: "utf8", timeout: 60_000 });
    assert.equal(run.status, 0, `${target}\n${run.stdout}${run.stderr}`);
  }
});
