# Launch checklist

**The rule:** any **blocker** at FAIL makes the verdict NO-GO. A **follow-up** at FAIL lets the launch go ahead, but goes on the owner's list with a date. Mark an item N/A only when the site lacks the thing it checks (no shop, no forms), and say why.

`[script]` marks an item `go-live-check.sh` answers in full or in part.

## Staging leftovers

1. **No staging URLs left in the live database.** Blocker. `[script]` with `--staging` and WP-CLI access; without them, only the homepage is checked.

## Search, analytics and redirects

2. **Search engines are allowed:** "Discourage search engines" is unticked and `robots.txt` does not disallow the whole site. Blocker. `[script]`
3. **A valid XML sitemap.** Follow-up. `[script]`
4. **A real 404 page:** a made-up path returns status 404 and a designed page. Follow-up. `[script]`
5. **A real homepage title**, not a placeholder. Follow-up. `[script]`
6. **Analytics installed, and the owner can sign in to it and to the search console.** Follow-up. `[script]` finds the tag; access needs the owner.
7. **Every other domain and the `www` or bare twin redirect to the live site with a 301.** Follow-up. `[script]` with `--alias`.
8. **The old site's important URLs redirect to their new homes**, when this replaces a site. Follow-up. Ask the owner for the old site's top pages and request each one.

## Things only a person can test

9. **Every form sends, and its email arrives** in the right inbox, not spam. Blocker.
10. **A real purchase goes through end to end**, refunded after, when the site takes payments. Blocker.
11. **Test content, test users and sample pages are gone.** Follow-up.
12. **The privacy policy describes what this site actually collects.** Follow-up.
13. **Paid plugin and theme licences are activated on the live domain.** Follow-up.
14. **The site's speed is acceptable on a phone**, measured with Google's PageSpeed Insights or a similar tool. Follow-up.

## Backups and a restore drill

15. **A backup runs on a schedule, and the latest one is recent.** Blocker. Find the latest backup and its date.
16. **Backups are kept somewhere other than the site's own server.** Blocker.
17. **A restore has been tried:** a recent backup restored to a spare copy of the site, and the copy works. Blocker. A backup that has never been restored is a hope, not a backup.
