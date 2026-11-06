// Shared by the tests: the skills in this repo and how a reader installs one.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const repo = join(import.meta.dirname, "..");

// The skills folder is the one list of skills; the manifest and README are checked against it.
export const skills = readdirSync(join(repo, "skills"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry["name"])
  .sort();

// What a reader does: install one skill from the repo into a fresh project.
// The caller removes `dir`.
export function install(skill) {
  const dir = mkdtempSync(join(tmpdir(), `install-${skill}-`));
  const run = spawnSync(
    "npx",
    ["-y", "skills@1.7.6", "add", repo, "--skill", skill, "--agent", "claude-code", "--copy", "-y"],
    {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, DISABLE_TELEMETRY: "1", DO_NOT_TRACK: "1", CI: "1" },
      timeout: 180_000,
    },
  );
  return { dir, run, skillsDir: join(dir, ".claude", "skills") };
}

// The top-level `key: value` lines of a SKILL.md frontmatter block, or null.
export function frontmatter(text) {
  const block = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!block) return null;
  return Object.fromEntries(
    block[1]
      .split("\n")
      .map((line) => line.match(/^([a-z_-]+):\s*(.*)$/i))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.replace(/^["']|["']$/g, "")]),
  );
}
