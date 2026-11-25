---
name: launch-check
description: Go/no-go check that a WordPress site is ready to launch. Runs a read-only setup script, then walks the launch checklist with the site owner, from staging URLs and redirects to forms and a restore drill. Use when a WordPress site is about to go live, move host or cut over DNS. Run launch-security-check first, and the site is ready when both say GO.
version: 2.0.0
---

# Launch check

A **gate** between a built WordPress site and its launch. The result is a go/no-go list: every checklist item marked PASS, FAIL or N/A with its evidence, and every FAIL sorted into **blocker** or **follow-up**.

The gate is read-only. You observe and record; fixes are separate work, and each fixed item is checked again here before it counts.

This gate is the second of a pair. `launch-security-check` runs first, from outside the site, and this gate repeats none of its checks. The site is ready to launch when both say GO.

## 1. Gather the inputs

You need five inputs:

- The live site's public URL.
- Every other hostname that should redirect to it: the `www` or bare twin, and other domains.
- WP-CLI access, if any: an SSH alias and the WordPress path, or a local path.
- The staging URL the site was built on, if it moved.
- Confirmation that the owner controls these hosts or has written permission to probe them.

Start from the host list `launch-security-check` gathered, when this session or its report holds one. It gives the live URL, the other hostnames, the non-live copies (the staging URL is one of them) and the permission. Then ask the site owner only for what is still missing: usually WP-CLI access, and which copy the site was built on.

With no host list, ask whether `launch-security-check` has run. It goes first; if the user wants this gate now, collect all five inputs from the owner.

Done when you hold the URL and the owner's permission, know which of the rest exist, and have asked for nothing the host list already gave.

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

Apply the rule at the top of [checklist.md](checklist.md) and report in this shape:

```text
GO | NO-GO        blockers _ at FAIL        follow-ups _ at FAIL
Site: <url>        Date: <YYYY-MM-DD>

Blockers
<item number>  <item>  <evidence>  <what would make it pass>

Follow-ups
<item number>  <item>  <evidence>

PASS: <item numbers>
N/A: <item numbers, each with its reason>
```

A blocker is every FAIL the checklist marks blocker. Every other FAIL is a follow-up, for the owner to schedule.

Done when the first line is GO or NO-GO and every FAIL sits under blockers or follow-ups.

## 5. Check again when things change

- After a fix, re-run the item's check and update its line. Keep the old FAIL in the record as history.
- After DNS cutover, run the script again against the public hostname. Redirects often change once the real domain and any CDN are in front of the site.
- After a host move, run the whole gate again.
- After DNS cutover or a host move, run `launch-security-check` again as well, first. The site stays ready only while both gates say GO.

Done when every item touched by the change carries a fresh mark, the verdict is given again, and the user knows what `launch-security-check` last said.
