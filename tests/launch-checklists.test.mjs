import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repo } from "./skills.mjs";

// Each launch skill's checks as { id, title }, read from where the skill lists them.
const read = (...path) => readFileSync(join(repo, "skills", ...path), "utf8");
const checklists = {
  "launch-check": [...read("launch-check", "checklist.md").matchAll(/^(\d+)\. \*\*(.+?)\*\*/gm)],
  "launch-security-check": [...read("launch-security-check", "SKILL.md").matchAll(/^\| (WP-\d+) \| [^|]+ \| ([^|]+) \|/gm)],
};
for (const [skill, found] of Object.entries(checklists)) {
  checklists[skill] = Array.from(found, ([, id, title]) => ({ id, title: title.trim() }));
}

// Every topic a launch check may cover. A new check needs its topic here, which
// is where a check that repeats the other skill's topic gets caught.
const topics = {
  "two-factor sign-in": /two-factor/i,
  "login page": /login page/i,
  HSTS: /HSTS/,
  "security headers": /security headers/i,
  cookies: /cookies|SameSite/i,
  "PHP version": /PHP version/i,
  "version files": /version files/i,
  cron: /cron/i,
  usernames: /usernames/i,
  "version fingerprints": /fingerprints|generator/i,
  "listings and leftover files": /directory listings|leftover files/i,
  "non-live copies locked": /locked/i,
  "non-live copies hidden from search": /hidden from search|noindex/i,
  "origin server": /origin/i,
  "email authentication": /email authentication|SPF|DKIM|DMARC/i,
  "DNS records": /DNS/,
  "HTTPS redirect": /HTTPS/,
  "admin accounts": /only the admins/i,
  "debug output": /debug/i,
  "staging URLs": /staging URLs/i,
  "search engines allowed": /search engines/i,
  sitemap: /sitemap/i,
  "404 page": /404/,
  "homepage title": /homepage title/i,
  analytics: /analytics/i,
  "other domains redirect": /other domain|twin/i,
  "old URLs redirect": /old site/i,
  forms: /form sends/i,
  purchase: /purchase/i,
  "test content": /test content/i,
  "privacy policy": /privacy policy/i,
  licences: /licen[cs]es/i,
  speed: /speed/i,
  backups: /backup/i,
  restore: /restore/i,
};

test("both launch checklists are read", () => {
  assert.equal(checklists["launch-check"].length, 17);
  assert.equal(checklists["launch-security-check"].length, 19);
});

test("no check id appears in both launch skills", () => {
  const general = new Set(checklists["launch-check"].map(({ id }) => id));
  const shared = checklists["launch-security-check"].map(({ id }) => id).filter((id) => general.has(id));
  assert.deepEqual(shared, []);
});

test("every launch check has a known topic", () => {
  for (const [skill, checks] of Object.entries(checklists)) {
    for (const { id, title } of checks) {
      const known = Object.values(topics).some((pattern) => title.match(pattern));
      assert.ok(known, `${skill} ${id} "${title}" matches no topic in this test`);
    }
  }
});

test("no topic is checked in both launch skills", () => {
  for (const [topic, pattern] of Object.entries(topics)) {
    const [general, security] = Object.values(checklists).map((checks) =>
      checks.filter(({ title }) => title.match(pattern)).map(({ id, title }) => `${id} ${title}`),
    );
    assert.ok(
      general.length === 0 || security.length === 0,
      `"${topic}" is in both: ${general.join("; ")} and ${security.join("; ")}`,
    );
  }
});
