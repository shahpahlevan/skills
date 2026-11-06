# Pre-launch checklist

**The rule:** any **blocker** at FAIL makes the verdict NO-GO. A **follow-up** at FAIL lets the launch go ahead, but goes on the owner's list with a date. Mark an item N/A only when the site lacks the thing it checks (no shop, no forms), and say why.

`[script]` marks an item `go-live-check.sh` answers in full or in part. Check every hostname in scope, staging included, unless an item says otherwise.

## Logins and admin

1. **Two-factor sign-in for every admin account, on every copy of the site.** Blocker. Sign out, sign in as an administrator, and confirm a second factor is asked for. In the security plugin's settings, confirm two-factor is required for every admin-level role, not optional.
2. **The login page is fenced off or rate-limited.** Follow-up. `[script]` From outside any allowed network, `wp-login.php` and `wp-admin/` should be refused, or failed sign-ins should lock out after a few tries.
3. **Only the people who need admin have it.** Follow-up. List users with the administrator role (`wp user list --role=administrator`) and ask the owner to confirm each one.

## HTTPS and headers

4. **Plain HTTP redirects to HTTPS with a 301, on every hostname.** Blocker. `[script]`
5. **HSTS with a max-age of at least a year.** Blocker. `[script]` Turn it on only once HTTPS is stable: browsers remember it.
6. **Security headers present:** X-Frame-Options (or a CSP `frame-ancestors`), Referrer-Policy, Permissions-Policy, `X-Content-Type-Options: nosniff`, and a Content-Security-Policy. Blocker. `[script]` A CSP in report-only mode passes if there is a dated plan to enforce it.
7. **Login and session cookies carry `Secure`, `HttpOnly` and `SameSite`.** Follow-up. Sign in with the browser's developer tools open and read the cookies.

## What the site gives away

8. **No PHP version in the response headers.** Blocker. `[script]`
9. **No WordPress or server version on show:** no versioned `Server` header, no generator tag, and `readme.html` and `license.txt` refused. Follow-up. `[script]`
10. **`wp-cron.php` cannot be triggered by the public**, and a real cron job runs it instead. Follow-up. `[script]` Confirm the real cron job with the owner or the host's cron settings.
11. **Usernames are not listed:** the REST users endpoint and `?author=1` reveal no login names. Follow-up. `[script]`
12. **No directory listings, and no leftover installer, backup or test files in the web root.** Follow-up. `[script]` covers uploads only. List the web root by hand for `*.sql`, `*.zip`, `*.bak`, `*.csv`, `*.json` and stray PHP files.
13. **Debug output is off:** `WP_DEBUG_DISPLAY` is false on the live site and no PHP notices show on any page. Blocker.

## Staging and other copies

14. **Every non-live copy needs a password**, whether HTTP auth or the host's own lock. Blocker. Open each staging or preview URL in a private window.
15. **Non-live copies are hidden from search:** `noindex` on every page, and not listed in any sitemap the live site serves. Follow-up.
16. **The server behind any CDN or firewall is not reachable directly.** Blocker, when the site uses one. Request the origin's address with the site's `Host` header; it should refuse or redirect.
17. **No staging URLs left in the live database.** Blocker. `[script]` with `--staging` and WP-CLI access; without them, only the homepage is checked.

## Search, analytics and redirects

18. **Search engines are allowed:** "Discourage search engines" is unticked and `robots.txt` does not disallow the whole site. Blocker. `[script]`
19. **A valid XML sitemap.** Follow-up. `[script]`
20. **A real 404 page:** a made-up path returns status 404 and a designed page. Follow-up. `[script]`
21. **A real homepage title**, not a placeholder. Follow-up. `[script]`
22. **Analytics installed, and the owner can sign in to it and to the search console.** Follow-up. `[script]` finds the tag; access needs the owner.
23. **Every other domain and the `www` or bare twin redirect to the live site with a 301.** Follow-up. `[script]` with `--alias`.
24. **The old site's important URLs redirect to their new homes**, when this replaces a site. Follow-up. Ask the owner for the old site's top pages and request each one.

## Things only a person can test

25. **Every form sends, and its email arrives** in the right inbox, not spam. Blocker.
26. **A real purchase goes through end to end**, refunded after, when the site takes payments. Blocker.
27. **Test content, test users and sample pages are gone.** Follow-up.
28. **The privacy policy describes what this site actually collects.** Follow-up.
29. **Paid plugin and theme licences are activated on the live domain.** Follow-up.
30. **The site's speed is acceptable on a phone**, measured with Google's PageSpeed Insights or a similar tool. Follow-up.

## Email and DNS

31. **The sending domain publishes SPF, DKIM and DMARC**, and they cover whatever sends the site's mail. Follow-up. Check with `dig TXT`.
32. **No stale DNS records:** nothing points at a server, service or old host the owner no longer controls. Follow-up. List the zone and ask the owner about anything unknown.

## Backups and a restore drill

33. **A backup runs on a schedule, and the latest one is recent.** Blocker. Find the latest backup and its date.
34. **Backups are kept somewhere other than the site's own server.** Blocker.
35. **A restore has been tried:** a recent backup restored to a spare copy of the site, and the copy works. Blocker. A backup that has never been restored is a hope, not a backup.
