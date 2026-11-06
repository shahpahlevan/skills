---
name: pre-launch-check
description: Go/no-go check of a WordPress site before it launches. Runs a read-only probe script, then walks the rest of the pre-launch checklist with the site owner. Use when a WordPress site is about to go live, move host or cut over DNS.
version: 1.0.0
---

# Pre-launch check

A **gate** between a built WordPress site and its launch. The result is a go/no-go list: every checklist item marked PASS, FAIL or N/A with its evidence, and every FAIL that blocks launch named.

The gate is read-only. You observe and record; fixes are separate work, and each fixed item is checked again here before it counts.

## 1. Gather the inputs

Collect from the site owner, and ask for anything missing:

- The site's public URL.
- Every other hostname that serves the site or a copy of it: the `www` or bare twin, other domains that should redirect, staging and preview sites.
- WP-CLI access, if any: an SSH alias and the WordPress path, or a local path.
- The staging URL the site was built on, if it moved.
- Confirmation that the owner controls these hosts or has written permission to probe them.

Done when you hold the URL and the owner's permission, and know which of the rest exist.

## 2. Run the script

From this skill's folder:

```sh
bash scripts/go-live-check.sh <site url> [--ssh <alias>] [--wp-path <path>] [--staging <url>] [--alias <host>]...
```

`--help` lists the options and exit codes. It prints a SETUP pass and a SECURITY pass, one line per check. Run it once per hostname in scope, staging included.

Record every line as evidence. A SKIP or INFO line is unfinished: carry it into step 3.

## 3. Walk the checklist

Read [checklist.md](checklist.md). Take every item in it, in order. For each one:

- If the script's output already settles it, cite that line.
- If you can settle it yourself with a read-only request (`curl -sI`, `dig`, a WP-CLI read), do so and record the command and what it showed.
- Otherwise ask the owner to check it, telling them exactly what to look at, and record their answer.

Done when every item is PASS, FAIL or N/A, each with its evidence. An item with no evidence is a FAIL.

## 4. Give the verdict

Apply the rule at the top of [checklist.md](checklist.md) and report:

- **GO** or **NO-GO**, on the first line.
- The **blockers**: every FAIL marked blocker, each with its evidence and what would make it pass.
- The **follow-ups**: every other FAIL, for the owner to schedule.
- The PASS and N/A items, as one short list.

## 5. Check again when things change

- After a fix, re-run the item's check and update its line. Keep the old FAIL in the record as history.
- After DNS cutover, run the script again against the public hostname. Headers, redirects and certificates often change once the real domain and any CDN are in front of the site.
- After a host move or a CDN change, run the whole gate again.
