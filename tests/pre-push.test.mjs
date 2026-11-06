import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hook = join(import.meta.dirname, "..", "hooks", "pre-push");

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

function git(cwd, ...args) {
  return spawnSync("git", args, { cwd, env, encoding: "utf8" });
}

// A bare remote and a clone of it with the hook installed and pointed at `list`.
function setup({ list = "Acme Widgets\n", configure = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "skills-pre-push-"));
  const remote = join(dir, "remote.git");
  const clone = join(dir, "clone");
  const listPath = join(dir, "private", "client-names.txt");
  git(dir, "init", "-q", "--bare", "-b", "main", remote);
  git(dir, "clone", "-q", remote, clone);
  git(clone, "checkout", "-q", "-b", "main");
  copyFileSync(hook, join(clone, ".git", "hooks", "pre-push"));
  chmodSync(join(clone, ".git", "hooks", "pre-push"), 0o755);
  if (list !== null) {
    mkdirSync(join(dir, "private"));
    writeFileSync(listPath, list);
  }
  if (configure) git(clone, "config", "skills.clientList", listPath);
  return {
    dir,
    commit(file, text, message = "Add a file") {
      writeFileSync(join(clone, file), text);
      git(clone, "add", file);
      return git(clone, "commit", "-q", "-m", message);
    },
    push: () => git(clone, "push", "-q", "origin", "main"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("a clean push goes through", (t) => {
  const repo = setup();
  t.after(repo.cleanup);
  repo.commit("SKILL.md", "Register a site on any host.\n");
  const push = repo.push();
  assert.equal(push.status, 0, push.stderr);
});

test("a push that names a client is refused, whatever the case", (t) => {
  const repo = setup();
  t.after(repo.cleanup);
  repo.commit("SKILL.md", "I built this for acme widgets last year.\n");
  const push = repo.push();
  assert.notEqual(push.status, 0);
  assert.match(push.stderr, /client name/i);
});

test("a push fails when the list file is absent, rather than passing", (t) => {
  const repo = setup({ list: null });
  t.after(repo.cleanup);
  repo.commit("SKILL.md", "Register a site on any host.\n");
  const push = repo.push();
  assert.notEqual(push.status, 0);
  assert.match(push.stderr, /list is missing/);
});

test("a push fails when no list path is set", (t) => {
  const repo = setup({ configure: false });
  t.after(repo.cleanup);
  repo.commit("SKILL.md", "Register a site on any host.\n");
  const push = repo.push();
  assert.notEqual(push.status, 0);
  assert.match(push.stderr, /skills\.clientList is not set/);
});

test("a push fails when the list holds only comments and blank lines", (t) => {
  const repo = setup({ list: "# clients\n\n   \n" });
  t.after(repo.cleanup);
  repo.commit("SKILL.md", "Register a site on any host.\n");
  const push = repo.push();
  assert.notEqual(push.status, 0);
  assert.match(push.stderr, /list is empty/);
});

test("a client name in an earlier commit is refused even if a later one removes it", (t) => {
  const repo = setup();
  t.after(repo.cleanup);
  repo.commit("SKILL.md", "Built for Acme Widgets.\n");
  repo.commit("SKILL.md", "Built for any site.\n");
  const push = repo.push();
  assert.notEqual(push.status, 0);
});

test("a client name in a commit message is refused", (t) => {
  const repo = setup();
  t.after(repo.cleanup);
  repo.commit("SKILL.md", "Register a site on any host.\n", "Port the Acme Widgets steps");
  const push = repo.push();
  assert.notEqual(push.status, 0);
});

test("only whole words match, so a name inside a longer word passes", (t) => {
  const repo = setup({ list: "Orbit\n" });
  t.after(repo.cleanup);
  repo.commit("SKILL.md", "Set an orbital cache lifetime.\n");
  const push = repo.push();
  assert.equal(push.status, 0, push.stderr);
});

test("a later push to a branch the remote already has is checked too", (t) => {
  const repo = setup();
  t.after(repo.cleanup);
  repo.commit("SKILL.md", "Register a site on any host.\n");
  assert.equal(repo.push().status, 0);
  repo.commit("NOTES.md", "Acme Widgets asked for this.\n");
  assert.notEqual(repo.push().status, 0);
});
