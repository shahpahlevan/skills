#!/usr/bin/env node
// Decide whether this commit cuts a release: it does when the version in
// .claude-plugin/plugin.json has no matching `v<version>` tag yet.
// Prints `version=`, `tag=` and `release=true|false`, and appends the same
// lines to $GITHUB_OUTPUT when it is set. Exit 1 on a version that is not semver.
import { appendFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const { version } = JSON.parse(readFileSync(".claude-plugin/plugin.json", "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(String(version))) {
  console.error(`release-plan: plugin.json version "${version}" is not MAJOR.MINOR.PATCH`);
  process.exit(1);
}

const tag = `v${version}`;
const tags = execFileSync("git", ["tag", "--list", tag], { encoding: "utf8" }).split("\n");
const release = !tags.includes(tag);

const lines = `version=${version}\ntag=${tag}\nrelease=${release}\n`;
process.stdout.write(lines);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines);
