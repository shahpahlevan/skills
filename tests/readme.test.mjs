import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repo, skills } from "./skills.mjs";

const readme = readFileSync(join(repo, "README.md"), "utf8");

function description(skill) {
  const text = readFileSync(join(repo, "skills", skill, "SKILL.md"), "utf8");
  return text.match(/^description:\s*(.*)$/m)[1].trim();
}

for (const skill of skills) {
  test(`the README lists ${skill} with its description`, () => {
    const line = readme.split("\n").find((l) => l.includes(`\`${skill}\``) && l.trimStart().startsWith("|"));
    assert.ok(line, `a table row names ${skill}`);
    assert.ok(line.includes(description(skill)), `the ${skill} row carries its SKILL.md description`);
  });
}

test("the README gives the one install command", () => {
  assert.ok(readme.includes("npx skills add shahpahlevan/skills --skill <name>"));
});

test("the README gives the Claude Code plugin install", () => {
  assert.ok(readme.includes("/plugin marketplace add shahpahlevan/skills"));
  assert.ok(readme.includes("/plugin install wordpress-agent-skills@shahpahlevan-skills"));
});
