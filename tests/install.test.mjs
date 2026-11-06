import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { frontmatter, install, repo, skills } from "./skills.mjs";

const files = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry["name"])))
    .sort();

for (const skill of skills) {
  test(`installing ${skill} yields exactly that skill, every file, with valid frontmatter`, (t) => {
    const { dir, run, skillsDir } = install(skill);
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    assert.equal(run.status, 0, run.stdout + run.stderr);

    assert.deepEqual(readdirSync(skillsDir), [skill]);
    assert.deepEqual(files(join(skillsDir, skill)), files(join(repo, "skills", skill)));

    const fields = frontmatter(readFileSync(join(skillsDir, skill, "SKILL.md"), "utf8"));
    assert.ok(fields, "SKILL.md opens with a frontmatter block");
    assert.equal(fields["name"], skill);
    assert.ok(fields["description"]?.length > 20, "description is a real sentence");
    assert.match(fields["version"] ?? "", /^\d+\.\d+\.\d+$/);
  });
}
