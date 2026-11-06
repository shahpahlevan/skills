---
name: wp-cli-safely
description: Write-safety rules for running WP-CLI against a live WordPress site. Use before any write to a production or client site over SSH, any bulk write through `wp eval` or `$wpdb`, a database export, or a command you hand to the human to run.
version: 1.0.0
---

# WP-CLI, safely

A live site is someone's business. Reads are cheap; every write follows the rules below, and every rule applies on every write. Run them as a checklist, not as background reading.

The **evidence** test sits under all of them: a step counts as done only when a separate, read-only check shows the new state. A command's exit code, its output, or its silence is a self-report, and a self-report is not evidence.

## Before the first write: the identity check

Ask the site who it is, and compare the answer with the URL you expect. Take the expected URL and the site's WordPress root from the site registry (`site_url` and `wp_root` in a `sites.json`) or from the human. The root varies between accounts, even on one host, so use the recorded one:

```sh
wp --path=<wp_root> option get siteurl
wp --path=<wp_root> option get home
```

Both must match the expected URL exactly, scheme included. On any mismatch, stop and tell the human what you expected and what the site answered. Run the check again whenever you change account, path or SSH host. A copy of a site on staging answers with its own URL, so this is also how you tell staging from production.

## The seven rules

### 1. Write the statements file before any bulk write

Any bulk write (a `$wpdb` batch, a `wp eval` loop, a run of `wp post update` or `wp option update`) first writes every change to a statements file, then runs from that file.

- One row per change: table or object, ID, field, **old value**, new value. The old values make the file the rollback source.
- Write it **before** the run. A file written afterwards is a second self-report.
- Show the human the file, or its row count and a sample, before you run it.
- **Drift abort.** Before writing anything, re-read every current value. If any one differs from the old value in the file, abort the whole batch and report the rows that drifted: something changed underneath the plan, so the plan is stale. Re-plan from a fresh read.
- Treat the file like a database dump (rule 2): a write to `options` or `usermeta` puts secrets in it.

### 2. Every restore point states its expiry, and is locked down

- In the same command that creates a dump or statements file, write a `RETENTION.md` beside it naming the expiry date.
- Leave the deletion to the human. A self-scheduled `cron` or `at` job is hard to audit, and a dump that deletes itself while it is still the rollback point is worse than one that lingers.
- Store it outside the web root. Set permissions explicitly: directory `0700`, every file `0600`. Shared hosts often run umask `0002`, which leaves files world-readable.
- Confirm the path is not reachable over HTTP.
- A dump holds password hashes, licence keys and SMTP credentials in plain text. Handle it like a secret.

### 3. Check a backup by its size, never its exit code

`wp db export` can exit 0 with no file and no error, for example when `DB_HOST` carries a port (`localhost:3306`). A tiny gzip is what a backup that did nothing looks like.

- Measure the file and check that it ends with the `Dump completed` footer.
- If the export fails this way, run `mariadb-dump` (or `mysqldump`) directly, with host and port as separate keys in a `--defaults-extra-file`.

### 4. Give every file-writing command an absolute output path

`wp --path` does not change directory: a relative output filename lands in the shell's working directory. Run `wp db export dump.sql` from inside the WordPress root and you have published the whole database to the web.

- Every output path is absolute, and outside the web root.
- Read a command's synopsis before you trust its positional arguments. Some plugin commands take the filename where you would expect a format, so the token you supply becomes a file named after the format.

### 5. Verify on the wire

- Confirm every change on the live response after you make it. Report as applied only what you verified.
- When the content comes from an iframe, embed or script, `curl` can't see it. Check in a rendered browser.
- Check robots meta on a real page, never on a 404: some SEO plugins mark every 404 `noindex`.
- Resolve a redirect to its final target. A redirect that lands on a 404 looks healthy in every redirect plugin's list.
- A redirect does not unpublish the page it points away from. If the sitemap still lists it, the sitemap is right.

### 6. Hold the scope, and prove it

- Metadata is not page content. An SEO title or meta description change touches only `<title>` and `<meta name="description">`. Headings, `post_title` and body copy are the client's approved words and need their own approval.
- Prove the scope held with evidence: checksum the content before and after, scan the live headings, diff `post_title`.

### 7. A command you hand to the human is still yours to confirm

When a rule keeps the last step from you (a destructive `rm`, a write you have not been cleared for), you hand the command to the human. The keystrokes move; the duty to confirm the outcome stays with you.

- A hand-off that did nothing looks exactly like one that worked. `rm -i` over a non-interactive SSH call waits on a prompt nobody can answer, gets killed, and returns empty output, the same silence as success.
- Write hand-off commands with `rm -f` and fully spelt-out absolute paths: no globs, nothing that can match more than the named files.
- After the human runs it, re-read the state with a separate read-only call (`stat`, `ls`, `find`, `wp ... get`) before you record anything as done.
- Close the task on the verified state, never on the decision to run it.

## What these rules leave to you

These rules govern what the agent does. They do not narrow what the SSH account itself can reach: that is set by the account, its keys and your agent's permission settings. Check those separately before you call access scoped.
