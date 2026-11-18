# pre-launch-check

A go/no-go check of a WordPress site before it launches. It's a gate: a checklist of items, each marked PASS, FAIL or N/A with its evidence, where any blocker at FAIL makes the verdict NO-GO. Every other item is a follow-up, which can fail and still launch, with a date on the owner's list.

Two real sites checked before launch both failed the first time. Each had 10 blockers, items that stop a launch until they're fixed. On one, a blocker was a backup nobody had ever restored.

The procedure the agent follows is [SKILL.md](SKILL.md), and the items are in [checklist.md](checklist.md). This page is for the developer: what the skill does, what it leaves behind and how to tell it worked.

## What it does

It runs in four steps, and the script in them only reads: it sends requests and runs WP-CLI reads, and writes nothing to the site.

| Step | Who | What happens |
| --- | --- | --- |
| **Give the inputs** | You | The site's address, every other hostname, and your permission to probe them |
| **Run the script** | Script | `go-live-check.sh` runs a setup pass, then a security pass, on every hostname, staging included |
| **Walk the checklist** | Agent and you | All 35 items in order: a script line cited where one settles it, a read-only request where one can, and your answer for the rest |
| **Give the verdict** | Agent | GO or NO-GO on the first line, then the blockers, then the follow-ups |

Each item ends on one of three marks, with its evidence. A script line can carry a fourth.

| Mark | What it means |
| --- | --- |
| **PASS** | The evidence shows it holds |
| **FAIL** | It doesn't hold, or there's no evidence either way |
| **N/A** | The site lacks the thing it checks, such as a shop, and the reason is written down |
| **SKIP** | Only on a script line: the script lacked something it needed, such as WP-CLI access or the staging address. It isn't a pass, so the item is settled another way |

The 35 items fall into eight areas:

- Logins and admin: two-factor sign-in for every admin, and who has admin at all.
- HTTPS and headers: a 301 to HTTPS, and the security headers a site sends to tell the browser how to protect its visitors. One is HSTS, which keeps visitors on HTTPS.
- What the site gives away: version numbers, usernames, debug output and leftover files.
- Staging and other copies: a password on each, and none of their URLs in the live database.
- Search and redirects: search engines allowed, a sitemap, a real 404 page and old URLs redirected.
- Things only a person can test: every form sends, and a real purchase goes through.
- Email and DNS: the sending domain's mail records, and no stale DNS records.
- Backups: a schedule, copies off the server, and a restore drill, where a recent backup is restored to a spare copy of the site and the copy works.

The script settles items in the first five areas, some only in part. The last three take a read-only request or your answer.

## When to reach for it

Reach for it before a site goes live, moves host or has its DNS switched over, and again after each fix and after the switch, when headers and redirects often change. It fixes nothing, so each fix is separate work. Don't run it on a site you don't control or have no written permission to probe.

## The backup nobody restored

A finished-looking site answers the questions you can see. The gate asks the ones you can't, and on one of those two sites the backups failed it: no restore had ever been tried, and no backup ran on a schedule. That was one of its 10 blockers, so the verdict was NO-GO.

I check this area hardest. A missing header can be fixed the day it's found. But a backup that has never been restored is a hope, not a backup, and you find out which on the worst day. So all three backup items are blockers: a backup on a schedule, copies kept off the site's own server, and a restore drill.

## What it leaves behind

The verdict is the gate's record, kept so the next run can be read against it. A fix counts only once its item is checked again and its line updated.

| It leaves | Why |
| --- | --- |
| GO or NO-GO, on the first line | So the answer is never buried |
| Each blocker, its evidence, and what would make it pass | So the fix list is ready to work through |
| Each follow-up | So the owner can put a date on it |
| The PASS and N/A items | So the next run can be compared with it |
| Every old FAIL, kept after its fix | So the record shows what changed |

## It's working if

- The script prints a setup pass and a security pass for every hostname, staging included.
- Every item is PASS, FAIL or N/A, and each has its evidence.
- No SKIP line is left unsettled.
- A restore drill, not a backup's existence, settles the restore item.
- The verdict's first line is GO or NO-GO, and each blocker says what would make it pass.

## Common questions

**Is it safe to run on a live site?**
Yes. The whole gate is read-only: the script and every request after it write nothing to the site.

**Can a site launch with a FAIL?**
Only a follow-up. It goes on the owner's list with a date. A blocker at FAIL means NO-GO, however finished the site looks.

**Why not let the script decide?**
More than half the items are beyond the script. It can't tell whether a form's email lands in the right inbox, or whether a restored backup works.
