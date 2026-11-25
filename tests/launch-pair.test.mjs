import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repo, frontmatter } from "./skills.mjs";

// The two launch skills run as a pair: security first, then the launch check.
const pair = ["launch-security-check", "launch-check"];
const skillMd = (skill) => readFileSync(join(repo, "skills", skill, "SKILL.md"), "utf8");
const other = (skill) => pair.find((name) => name !== skill);

// A SKILL.md's numbered steps, as { title, body }, in order.
function steps(text) {
  return text
    .split(/^## /m)
    .slice(1)
    .filter((section) => /^\d+\. /.test(section))
    .map((section) => ({ title: section.split("\n")[0], body: section }));
}

for (const skill of pair) {
  test(`${skill} names ${other(skill)} in its description and its last step`, () => {
    const text = skillMd(skill);
    const named = new RegExp(`(^|[^a-z-])${other(skill)}([^a-z-]|$)`);
    assert.match(frontmatter(text).description, named);
    assert.match(steps(text).at(-1).body, named);
  });

  test(`${skill}'s report template opens with GO or NO-GO`, () => {
    const template = steps(skillMd(skill))
      .map(({ body }) => body.match(/```text\n([\s\S]*?)```/)?.[1])
      .find(Boolean);
    assert.ok(template, "a step carries a report template");
    assert.match(template.split("\n")[0], /^GO \| NO-GO\b/);
  });
}

test("launch-check's first step reuses the security check's host list", () => {
  const [first] = steps(skillMd("launch-check"));
  assert.match(first.body, /launch-security-check/);
  assert.match(first.body, /host list/);
  assert.match(first.body, /missing/);
});

test("the README says a site is ready when both launch skills say GO", () => {
  const readme = readFileSync(join(repo, "README.md"), "utf8").replace(/\s+/g, " ");
  assert.match(readme, /`launch-security-check` first/);
  assert.match(readme, /ready (to launch )?when both say GO/);
});
