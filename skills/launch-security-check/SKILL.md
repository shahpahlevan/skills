---
name: launch-security-check
description: Go/no-go security check for a WordPress site, run from the outside. Runs a read-only script, then works 19 checks, each with a fix, from two-factor sign-in and security headers to locked staging copies and DNS. Use before a WordPress site launches, right after DNS cutover, or after a host or CDN move. Run launch-check after it, and the site is ready when both say GO.
version: 1.0.0
---

# Launch security check

A security **gate** between a built WordPress site and its launch: 19 checks made from outside the site, the way an attacker first sees it. Each check ends PASS, FAIL or N/A on observed evidence, every FAIL is a **blocker** or a **follow-up**, and the run ends in one verdict, GO or NO-GO.

The gate is read-only: headers, status codes, DNS records and admin-screen settings. You observe and record; fixes are separate work, and each fixed check is made again here before it counts.

This gate is the first of a pair. It needs no site owner, so it runs before `launch-check`, which covers readiness and backups with the owner and repeats none of these checks. The site is ready to launch when both say GO.

## 1. Gather the scope

Collect from the user, and ask for anything missing:

- The live site's public URL.
- Every other hostname that serves the site: the `www` or bare twin, subdomains, other domains.
- Every non-live copy: staging, UAT, preview.
- Whether a CDN or firewall fronts the site, and if so the origin server's address.
- Confirmation that the user owns these hosts or has written permission to probe them.

Done when you hold the host list, the CDN answer and the permission.

## 2. Run the script

From this skill's folder, once for each public hostname:

```sh
bash scripts/check.sh https://example.com [--origin <ip>] [--no-cdn]
```

Give `--origin` when a CDN or firewall fronts the site, and `--no-cdn` when nothing does. `--help` lists the options and exit codes. The script prints one line per check, `<ID> <PASS|FAIL|MANUAL|N/A> <evidence>`, then a `SECURITY PASS n FAIL n SKIP n` summary line. It exits 0 when no check fails, 2 when one fails and 1 on an error.

Done when each hostname has its summary line and every line above it is recorded as evidence. A MANUAL line is unfinished: carry it into step 3.

## 3. Work the checks

Take every check in the table below, in order, on every hostname it applies to. For each one:

- If the script's line settles it, cite that line.
- If you can settle it yourself with a read-only request (`curl -sI`, `dig`, a WP-CLI read), do so and record the command and what it showed.
- Otherwise ask the user to look, telling them exactly where, and record their answer.

Mark a check N/A only when the site lacks the thing it checks (no non-live copy, no CDN), and say why.

Done when every check on every hostname is PASS, FAIL or N/A, each with its evidence. A check with no evidence is a FAIL.

## 4. Attach the fixes

For each FAIL, open [FIXES.md](FIXES.md) at its check id and write the fix into the report, with an owner.

Done when every FAIL carries a fix and an owner.

## 5. Give the verdict

Any **blocker** at FAIL makes the verdict NO-GO. A **follow-up** at FAIL lets the launch go ahead, and goes on the owner's list with a date. Report in this shape:

```text
GO | NO-GO        blockers _/8 at FAIL        follow-ups _/11 at FAIL
Site: <url>        Run: <pre-launch | post-cutover>        Date: <YYYY-MM-DD>

ID     Severity   Result  Evidence                       Fix / owner / due
WP-01  blocker    ...
...
WP-19  blocker    ...
```

Evidence is the observed fact: the header line, the status code, the setting seen.

Keep the host list from step 1 with the report: `launch-check` starts from it.

Done when the first line is GO or NO-GO, all 19 checks have a row and the host list is with the report.

## 6. Check again when things change

- After a fix, make the check again and update its row. Keep the old FAIL in the record as history.
- After DNS cutover, run the whole gate against the real domain. A CDN and production headers change the results.
- After a host or CDN move, run the whole gate again.
- After this gate's verdict, run `launch-check` next, before launch and again after DNS cutover or a host move. Hand it the host list. The site is ready only while both gates say GO.

Done when every check touched by the change carries a fresh result, the verdict is given again, and the user has been told to run `launch-check`.

## The checks

**Auto** means `scripts/check.sh` decides it. Keep each check at the severity the table gives it: a follow-up reported as a blocker stops a clean launch and costs trust in the gate.

| ID | Severity | Check | PASS when |
|---|---|---|---|
| WP-01 | Blocker | Two-factor sign-in for admins | Every admin-level sign-in asks for a second factor, on every copy of the site, and it is required, not optional. Application Passwords bypass two-factor: they are disabled, or held only by named integrations. |
| WP-02 | Follow-up | Login page protected | `wp-login.php` is refused outside allowed networks (Auto), or failed sign-ins lock out after a few tries. Test: a few wrong passwords trigger the lockout. |
| WP-03 | Blocker | HSTS for one year | Auto. Every hostname sends `Strict-Transport-Security` with a `max-age` of 31536000 or more. |
| WP-04 | Blocker | Security headers | Auto. X-Frame-Options (or a CSP `frame-ancestors`), `X-Content-Type-Options: nosniff`, Referrer-Policy, Permissions-Policy and a Content-Security-Policy. A report-only CSP passes at launch. |
| WP-05 | Follow-up | Cookies carry SameSite | Sign in and read `wordpress_logged_in_*` and `wordpress_sec_*` in the browser's developer tools: `SameSite` is set beside `Secure` and `HttpOnly`. WordPress core leaves SameSite unset, so a stock site fails. |
| WP-06 | Blocker | PHP version hidden | Auto. No `X-Powered-By` header names a PHP version. |
| WP-07 | Follow-up | Version files blocked | Auto. `readme.html` and `license.txt` return 403 or 404. |
| WP-08 | Follow-up | `wp-cron.php` closed to the public | Auto. The public request is refused, and a server cron job runs the scheduled tasks instead. Confirm the cron job with the user or the host's cron settings. |
| WP-09 | Follow-up | Usernames hidden | Auto. Neither REST route (`/wp-json/wp/v2/users`, `/?rest_route=/wp/v2/users`) nor `?author=1` reveals a login name. Hosts often block only the first route. |
| WP-10 | Follow-up | Version fingerprints removed | Auto. No version number in the `Server` header and no WordPress generator tag. |
| WP-11 | Follow-up | No directory listings or leftover files | Auto for directory listings, control-panel paths and common leftover names. Then list the web root on the server: no `*.sql`, `*.zip`, `*.bak`, `*.csv` or `*.json` file, no installer, no stray PHP file. |
| WP-12 | Blocker | Non-live copies locked | Every staging, UAT and preview host asks for a password (HTTP auth, single sign-on) or is blocked at the network before it serves anything. Open each in a private window. |
| WP-13 | Follow-up | Non-live copies hidden from search | Each non-live host sends `noindex` (header or meta tag), a `site:<host>` search returns nothing, and no sitemap the live site serves lists it. `robots.txt` alone does not count. |
| WP-14 | Blocker | Origin server refuses direct requests | Auto with `--origin`. The origin refuses a request that skips the CDN or firewall. N/A when nothing fronts the site (`--no-cdn`). |
| WP-15 | Follow-up | Email authentication | Auto for SPF and DMARC. Confirm DKIM with the mail provider's selector. |
| WP-16 | Follow-up | DNS records clean | No DNS record exposes the origin's address, and none points at a retired service (a subdomain takeover risk). Review the zone with the user. |
| WP-17 | Blocker | HTTP redirects to HTTPS | Auto. Plain HTTP redirects to HTTPS with a 301, on every hostname. |
| WP-18 | Follow-up | Only the admins who need it | The user confirms each account with the administrator role (`wp user list --role=administrator`) still needs it. |
| WP-19 | Blocker | Debug output off | `WP_DEBUG_DISPLAY` is false on the live site, no page shows a PHP notice, and `/wp-content/debug.log` is refused. Auto fails it on a PHP message on the homepage or a public log; a person confirms the rest. |

This gate covers what the site exposes on launch day. Code review, known plugin vulnerabilities and ongoing monitoring are separate work.
