#!/usr/bin/env node
// The public scrub check: fails when any file in the tree carries private detail.
//
//   node checks/scrub.mjs [dir]     (dir defaults to the repo root)
//
// Prints one line per finding (`path:line: rule: match`) and exits 1 on any finding.
// Its own fixtures and this file (which holds the patterns) are skipped.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(process.argv[2] ?? join(import.meta.dirname, ".."));

// `.git` is a folder in a clone and a file in a worktree; skip it either way.
const SKIP_NAMES = new Set([".git", "node_modules"]);
const SKIP_PATHS = new Set(["checks/fixtures", "checks/scrub.mjs"]);

const matches = (pattern) => (text) =>
  [...text.matchAll(pattern)].map((m) => m[0]);

// Last labels that make a dotted token a hostname: every top-level domain in the
// IANA root zone (checks/tlds.txt), plus the private names hosts use in-house.
// File extensions that are also top-level domains (md, sh, py, pl, rs) are left
// out on purpose; a URL is caught whatever its ending.
const NOT_HOSTS = new Set(["md", "sh", "py", "pl", "rs"]);
const TLDS = new Set(
  [
    ...readFileSync(join(import.meta.dirname, "tlds.txt"), "utf8").split("\n"),
    "local", "localhost", "test", "internal", "lan", "home", "corp",
  ]
    .map((line) => line.trim().toLowerCase())
    .filter((tld) => tld && !tld.startsWith("#") && !NOT_HOSTS.has(tld)),
);

const isExample = (host) =>
  host === "example.com" || host.endsWith(".example.com");

function hostnames(text) {
  const found = [];
  for (const m of text.matchAll(
    /(?<![\w.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9](?![\w-])/gi,
  )) {
    const host = m[0].toLowerCase();
    if (TLDS.has(host.split(".").pop()) && !isExample(host)) found.push(m[0]);
  }
  for (const m of text.matchAll(/[a-z][a-z0-9+.-]*:\/\/(?:[^@\s/]*@)?([^\s/:?#'"`)>\]]+)/gi)) {
    const host = m[1].toLowerCase().replace(/\.$/, "");
    if (!isExample(host) && !found.includes(m[1])) found.push(m[1]);
  }
  return found;
}

// An IPv6 address: colon-separated hex groups, either all eight of them or
// shortened with "::". A clock time (12:30:45) has neither, so it passes.
function ipv6(text) {
  return [...text.matchAll(/(?<![\w:])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![\w:])/gi)]
    .map((m) => m[0])
    .filter((ip) => {
      const groups = ip.split(":");
      return ip.includes("::") ? groups.some((g) => g !== "") && ip.split("::").length === 2 : groups.length === 8;
    });
}

// Private terms (names, folder names, private paths) never live in this repo:
// they would go public with it. They come from a list kept outside the repo, one
// term per line, `#` starts a comment, at the path in $SCRUB_PRIVATE_LIST or else
// in git config `skills.privateList`. A term matches case-sensitively, as a whole
// word wherever it starts or ends on a letter or digit.
function privateListPath() {
  if (process.env.SCRUB_PRIVATE_LIST !== undefined) return process.env.SCRUB_PRIVATE_LIST;
  const git = spawnSync("git", ["-C", root, "config", "--get", "skills.privateList"], {
    encoding: "utf8",
  });
  return git.status === 0 ? git.stdout.trim() : "";
}

function privateTerms(path) {
  if (!path) return [];
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    console.log("FAIL  scrub: the private-term list is missing at the path given");
    process.exit(2);
  }
  return text
    .split("\n")
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean);
}

const escape = (term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const termPattern = (term) =>
  (/^\w/.test(term) ? "(?<!\\w)" : "") + escape(term) + (/\w$/.test(term) ? "(?!\\w)" : "");

const listPath = privateListPath();
const terms = privateTerms(listPath);

const RULES = [
  { id: "hostname", find: hostnames },
  { id: "home-path", find: matches(/\/Users\/[^\s/]+/g) },
  ...(terms.length
    ? [{ id: "private-term", find: matches(new RegExp(terms.map(termPattern).join("|"), "g")) }]
    : []),
  // A POSIX bracket class such as [[:space:]] in a shell script is not a wikilink.
  { id: "wikilink", find: matches(/\[\[(?!:[a-z]+:\])[^\]\n]+\]\]/g) },
  { id: "sop-gl-id", find: matches(/\b(?:SOP|GL)-\d+/gi) },
  {
    id: "ip-address",
    find: (text) => [
      ...matches(
        /(?<![\w.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\w]|\.\d)/g,
      )(text),
      ...ipv6(text),
    ],
  },
];

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const rel = relative(root, path).split(sep).join("/");
    if (SKIP_PATHS.has(rel) || SKIP_NAMES.has(entry.name)) continue;
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (entry.isFile()) {
      yield [path, rel];
    }
  }
}

const findings = [];
for (const [path, rel] of walk(root)) {
  const buffer = readFileSync(path);
  if (buffer.includes(0)) continue; // binary
  const lines = buffer.toString("utf8").split("\n");
  lines.forEach((text, i) => {
    for (const rule of RULES) {
      for (const match of rule.find(text)) {
        findings.push(`${rel}:${i + 1}: ${rule.id}: ${match}`);
      }
    }
  });
}

for (const finding of findings) console.log(finding);
if (findings.length) {
  console.log(`FAIL  scrub: ${findings.length} finding(s)`);
  process.exit(1);
}
console.log(terms.length ? "ok    scrub" : "ok    scrub (no private-term list: generic shapes only)");
