import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const workflow = readFileSync(join(import.meta.dirname, "..", ".github", "workflows", "release.yml"), "utf8");

test("the deploy hook comes only from the repo secret", () => {
  assert.match(workflow, /DEPLOY_HOOK: \$\{\{ secrets\.CLOUDFLARE_DEPLOY_HOOK \}\}/);
  const uses = workflow.split("\n").filter((line) => line.includes("secrets.CLOUDFLARE_DEPLOY_HOOK"));
  for (const line of uses) {
    assert.match(line, /DEPLOY_HOOK: \$\{\{ secrets\.CLOUDFLARE_DEPLOY_HOOK \}\}|secrets\.CLOUDFLARE_DEPLOY_HOOK != ''/, line);
  }
});

test("nothing in the workflow can print the hook", () => {
  assert.doesNotMatch(workflow, /set -x|echo[^\n]*\$\{?DEPLOY_HOOK|curl[^\n]*(-v|--verbose|--trace)/);
});

// Steps of the release job, keyed by name.
const steps = Object.fromEntries(
  workflow
    .split("\n      - name: ")
    .slice(1)
    .map((step) => [step.split("\n")[0].trim(), step]),
);

test("only main with a new version cuts a release", () => {
  const cutting = Object.values(steps).filter((step) => step.includes("gh release create"));
  assert.equal(cutting.length, 1);
  assert.ok(cutting[0].includes("if: github.ref == 'refs/heads/main' && steps.plan.outputs.release == 'true'"));
});

test("the hook fires on main for a new release, or by hand to retry the current one", () => {
  const firing = Object.values(steps).filter((step) => step.includes("$DEPLOY_HOOK"));
  assert.equal(firing.length, 1);
  assert.ok(
    firing[0].includes(
      "if: github.ref == 'refs/heads/main' && (steps.plan.outputs.release == 'true' || github.event_name == 'workflow_dispatch')",
    ),
    firing[0],
  );
});

test("nothing is released until the scrub check and the tests pass", () => {
  assert.match(workflow, /^  checks:\n    uses: \.\/\.github\/workflows\/checks\.yml\n    secrets: inherit$/m);
  assert.match(workflow, /^  release:\n    needs: checks$/m);
  const checks = readFileSync(join(import.meta.dirname, "..", ".github", "workflows", "checks.yml"), "utf8");
  assert.match(checks, /^  workflow_call:/m);
});

test("the workflow names the site's real host, a Worker, not Pages", () => {
  assert.doesNotMatch(workflow, /Pages/);
});

test("a dry run mentions the hook secret only when main would call it", () => {
  assert.match(steps["Dry run"], /if \[ "\$RELEASE" = "true" \]; then[^]*Deploy hook secret set[^]*else/);
});
