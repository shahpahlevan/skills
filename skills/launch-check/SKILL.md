---
name: launch-check
description: Go/no-go check that a WordPress site is ready to launch. Runs a read-only setup script, then walks the launch checklist with the site owner, from staging URLs and redirects to forms and a restore drill. Use when a WordPress site is about to go live, move host or cut over DNS.
version: 2.0.0
---

# Launch check

A **gate** between a built WordPress site and its launch. The result is a go/no-go list: every checklist item marked PASS, FAIL or N/A with its evidence, and every FAIL sorted into **blocker** or **follow-up**.

The gate is read-only. You observe and record; fixes are separate work, and each fixed item is checked again here before it counts.

## 1. Gather the inputs

Collect from the site owner, and ask for anything missing:

- The live site's public URL.
- Every other hostname that should redirect to it: the `www` or bare twin, and other domains.
- WP-CLI access, if any: an SSH alias and the WordPress path, or a local path.
- The staging URL the site was built on, if it moved.
- Confirmation that the owner controls these hosts or has written permission to probe them.

Done when you hold the URL and the owner's permission, and know which of the rest exist.

## 2. Run the script

From this skill's folder:

```sh
bash scripts/go-live-check.sh https://example.com [--ssh <alias>] [--wp-path <path>] [--staging <url>] [--alias <host>]...
```

`--help` lists the options and exit codes. It prints a SETUP pass, one line per check, then a `SETUP PASS n FAIL n SKIP n` summary line. It exits 0 when every check passes, 2 when one fails and 1 on a usage error.

Done when the summary line is printed and every line above it is recorded as evidence. A SKIP or INFO line is unfinished: carry it into step 3.

## 3. Walk the checklist

Read [checklist.md](checklist.md). Take every item in it, in order. For each one:

- If the script's output already settles it, cite that line.
- If you can settle it yourself with a read-only request (`curl -sI`, a WP-CLI read), do so and record the command and what it showed.
- Otherwise ask the owner to check it, telling them exactly what to look at, and record their answer.

Done when every item is PASS, FAIL or N/A, each with its evidence. An item with no evidence is a FAIL.

## 4. Give the verdict

Apply the rule at the top of [checklist.md](checklist.md) and report:

- **GO** or **NO-GO**, on the first line.
- The **blockers**: every FAIL marked blocker, each with its evidence and what would make it pass.
- The **follow-ups**: every other FAIL, for the owner to schedule.
- The PASS and N/A items, as one short list.

Done when the first line is GO or NO-GO and every FAIL sits under blockers or follow-ups.

## 5. Check again when things change

- After a fix, re-run the item's check and update its line. Keep the old FAIL in the record as history.
- After DNS cutover, run the script again against the public hostname. Redirects often change once the real domain and any CDN are in front of the site.
- After a host move, run the whole gate again.

Done when every item touched by the change carries a fresh mark and the verdict is given again.
