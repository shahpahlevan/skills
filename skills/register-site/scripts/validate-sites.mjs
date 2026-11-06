#!/usr/bin/env node
// Checks a sites.json registry against the shape the register-site skill writes.
//
//   node validate-sites.mjs <path/to/sites.json>
//
// Prints one line per problem and exits 1 on any, 0 when the file is clean,
// 2 when the file cannot be read.
import { readFileSync } from "node:fs";

const SCHEMA_VERSION = 1;

// Every environment carries these; each is read off the server, never copied.
const REQUIRED = [
  "site_url", "ssh_alias", "ssh_host", "ssh_port", "ssh_user", "wp_root", "db_name", "db_user",
];

// A key that names a secret. The registry is committed, so a secret never goes in it.
const SECRET_KEY = /password|passwd|secret|token|private_key/i;

function secretKeys(value, path, found) {
  if (typeof value !== "object" || value === null) return found;
  for (const [key, inner] of Object.entries(value)) {
    const here = path ? `${path}.${key}` : key;
    if (SECRET_KEY.test(key)) found.push(here);
    secretKeys(inner, here, found);
  }
  return found;
}

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

// Shape checks for fields whose wrong form breaks the commands built from them.
const SHAPES = {
  ssh_port: [(v) => Number.isInteger(v) && v > 0 && v < 65536, "must be a port number, not a string"],
  site_url: [(v) => typeof v === "string" && /^https?:\/\/[^\s/]+/.test(v), "must be a full URL starting http:// or https://"],
  ip_allowlist_expiry: [
    (v) => typeof v === "string" && (isDate(v) || /^UNKNOWN: \S/.test(v)),
    'must be a date (YYYY-MM-DD) or "UNKNOWN: <why>"',
  ],
  wp_root: [(v) => typeof v === "string" && v.startsWith("/"), "must be an absolute path on the server"],
};

function checkRegistry(data) {
  const problems = [];
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return ["the top level must be an object"];
  }
  if (data.schema_version !== SCHEMA_VERSION) {
    problems.push(`schema_version must be ${SCHEMA_VERSION} (got ${JSON.stringify(data.schema_version)})`);
  }
  for (const key of secretKeys(data, "", [])) {
    problems.push(`${key.replace(/^environments\./, "")} holds a secret; fetch it from the server when needed`);
  }
  const environments = data.environments;
  if (typeof environments !== "object" || environments === null || Array.isArray(environments)) {
    problems.push("environments must be an object keyed by environment name");
    return problems;
  }
  const names = Object.keys(environments);
  if (names.length === 0) problems.push("environments holds no environment");
  for (const name of names) {
    const env = environments[name];
    if (typeof env !== "object" || env === null || Array.isArray(env)) {
      problems.push(`${name} must be an object`);
      continue;
    }
    for (const field of REQUIRED) {
      if (!(field in env)) problems.push(`${name}.${field} is required`);
    }
    for (const [field, [ok, rule]] of Object.entries(SHAPES)) {
      if (field in env && !ok(env[field])) problems.push(`${name}.${field} ${rule}`);
    }
    for (const [field, value] of Object.entries(env)) {
      if (typeof value !== "string") continue;
      if (value.trim() === "") problems.push(`${name}.${field} is empty`);
      else if (/^<.*>$/.test(value.trim())) {
        problems.push(`${name}.${field} is a placeholder (${value}); read the real value off the server`);
      }
    }
  }
  return problems;
}

const path = process.argv[2];
if (!path) {
  console.error("usage: node validate-sites.mjs <path/to/sites.json>");
  process.exit(2);
}

let text;
try {
  text = readFileSync(path, "utf8");
} catch (error) {
  console.error(`cannot read ${path}: ${error.message}`);
  process.exit(2);
}

const problems = [];
let data;
try {
  data = JSON.parse(text);
} catch (error) {
  problems.push(`not valid JSON: ${error.message}`);
}
if (data !== undefined) problems.push(...checkRegistry(data));

for (const problem of problems) console.log(`${path}: ${problem}`);
if (problems.length) {
  console.log(`FAIL  ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`ok    ${path}`);
