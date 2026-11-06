---
name: migrate
description: Move a WordPress site to another host or account with plain wp, rsync and ssh, behind four guards. Use when moving or copying a WordPress site to another server or account.
version: 1.0.0
---

# Migrate a WordPress site

Move a WordPress site from a **source** to a **target** over SSH with plain `wp`, `rsync` and `ssh`. Every command is one you can read and run by hand.

Four **guards** gate the run. Each is a numbered step below, each ends on a pass or a stop, and a stop ends the run: report which guard stopped it and why, then wait for the user.

- **Guard 1, identity check** on both ends, before any other step.
- **Guard 2, restore point** of the target, taken and checked before anything changes.
- **Guard 3, refuse an empty or non-SQL restore point** before every destructive write.
- **Guard 4, dry-run search-replace** through WP-CLI before the real one.

The target's files and database are overwritten. Run this only when the user asked for this move, and name the source and target back to them before Step 1.

## Inputs

| Name | Meaning |
|---|---|
| `SRC_SSH` | SSH target for the source, e.g. `user@source.example.com -p 22` |
| `SRC_ROOT` | Absolute WordPress root on the source |
| `SRC_URL` | The source's `siteurl`, e.g. `https://staging.example.com` |
| `DST_SSH`, `DST_ROOT`, `DST_URL` | The same three for the target |
| `EXPIRY` | The date the user wants the restore point and dumps deleted by |

Take each value from the user's site registry (a `sites.json` if they keep one) or read it off the box. Ask the user for any value you can't read. WordPress roots differ between accounts on the same host, so read `ROOT` rather than infer it.

`SRC_HOST` and `DST_HOST` are the host parts of the two URLs.

## Dumps are secrets

Every dump this run writes holds password hashes, licence keys and SMTP credentials in plain text. Each lives in its own folder in the account's home, outside the web root, made under `umask 077` (folder `0700`, files `0600`), with a `RETENTION.md` beside it naming `EXPIRY`. Deleting them is the user's call.

## The dump check

Guards 2 and 3 both run this on a SQL file. It passes only when the file is non-empty, starts like a SQL dump and ends with mysqldump's completion line:

```bash
ssh DST_SSH 'f=FILE; test -s "$f" \
  && head -c 400 "$f" | grep -qE "^(-- |/\*!|CREATE TABLE|INSERT INTO)" \
  && tail -c 200 "$f" | grep -q "Dump completed" \
  && echo DUMP-OK'
```

No `DUMP-OK` line means the check failed.

## Steps

### 1. Guard 1: identity check, both ends

```bash
ssh SRC_SSH "wp --path=SRC_ROOT option get siteurl"   # must print SRC_URL
ssh DST_SSH "wp --path=DST_ROOT option get siteurl"   # must print DST_URL
```

Several sites often share one hosting account, and `--path` plus this check are all that keep the move off a neighbouring site. Any mismatch is a stop: work out why with the user before anything else. A connection timeout (rather than an auth error) usually means the host's SSH IP allow-list has lapsed.

Done when both ends print their expected URL.

### 2. Read both ends

Read-only. Each check stops the run when it fails.

- **Capacity**: `df -h ~; df -i ~` on both. Stop when the target is over 85% disk or 80% inodes; inode exhaustion fails writes with `Disk quota exceeded` while disk space looks fine.
- **`exec()`**: `wp --path=ROOT eval 'echo function_exists("exec") ? "YES" : "NO";'` on both. On `NO`, `wp db export` and `wp db import` fail silently, so use `mysqldump` and `mysql` for those two (credentials from `wp config get`). Every other `wp` command here works either way.
- **Triggers**: `wp --path=ROOT db query 'SHOW TRIGGERS'` on both. A trigger's `DEFINER` breaks the import under another database user; resolve any with the user first.
- **Target is a scaffold**: `wp --path=DST_ROOT post list --post_type=any --format=count` and `wp --path=DST_ROOT user list --format=count`. Real content or users beyond the first admin mean the target is a live site: stop.
- **Source facts**: `wp --path=SRC_ROOT config get table_prefix`, and `wp core version` on both.
- **Target DNS**: when `DST_URL` already resolves publicly, put the target behind the host's password protection for the run. WordPress maintenance mode expires after 10 minutes and does not cover a whole run.

Done when every check above passed and you have the source's table prefix.

### 3. Guard 2: take and check the target's restore point

Write the dump to a temporary name and promote it only once it passes the dump check, so a failed export never becomes the restore point.

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
ssh DST_SSH "set -o pipefail; umask 077; RP=\$HOME/restore-points/$STAMP; mkdir -p \$RP \
  && printf 'Restore point of DST_URL. Expires EXPIRY. Delete by hand.\n' > \$RP/RETENTION.md \
  && wp --path=DST_ROOT db export \$RP/db.sql.tmp \
  && cp -a DST_ROOT/wp-content \$RP/wp-content \
  && cp -a DST_ROOT/wp-config.php \$RP/"
```

Run the dump check on `~/restore-points/$STAMP/db.sql.tmp`. On `DUMP-OK`, `mv` it to `db.sql` and record the absolute restore-point path. Without `DUMP-OK`, stop.

Done when `db.sql` exists and has passed the dump check.

### 4. Export the source

```bash
ssh SRC_SSH "umask 077; mkdir -p ~/migrate-$STAMP \
  && printf 'Migration dump of SRC_URL. Expires EXPIRY. Delete by hand.\n' > ~/migrate-$STAMP/RETENTION.md \
  && wp --path=SRC_ROOT db export ~/migrate-$STAMP/db.sql"
```

Run the dump check on `~/migrate-$STAMP/db.sql` over `SRC_SSH`. Without `DUMP-OK`, stop.

Done when the source dump has passed the dump check.

### 5. Guard 3: refuse an empty or non-SQL restore point

Immediately before the first destructive write (Step 6), run Guard 1 on the target again and the dump check on the target's `restore-points/$STAMP/db.sql`. Any failure is a stop, whatever the earlier steps said.

Done when the target prints `DST_URL` and the restore point prints `DUMP-OK`, both in this step.

### 6. Copy the files

Copy `uploads`, `themes`, `plugins` and `mu-plugins` (when present) from the source's `wp-content` to the target's. Remove the target's own `themes`, `plugins` and `mu-plugins` first (the restore point holds them), so no stale plugin survives. Pick the first transport that works:

1. **Same SSH login on both ends**: `rsync -a` between the two paths on the server.
2. **Source can reach target over SSH** (probe with `nc -zw5 DST_HOST PORT` from the source; shared hosts often block it): `rsync -az -e 'ssh -p PORT'` from the source to the target.
3. **Neither**: `rsync -az` down to a local folder, then up to the target.

Leave `object-cache.php` and `advanced-cache.php` behind: they belong to the source's host and white-screen the target. Copy `uploads` additively, without `--delete`.

Done when `ls -la DST_ROOT/wp-content` shows the four folders owned by the same user as the rest of the install.

### 7. Load the database

Move the source dump's `~/migrate-$STAMP` folder to the target's home with the transport from Step 6 (keep its `0700`/`0600` modes), then:

```bash
ssh DST_SSH "wp --path=DST_ROOT db clean --yes \
  && wp --path=DST_ROOT db import ~/migrate-$STAMP/db.sql \
  && wp --path=DST_ROOT config set table_prefix 'PREFIX' --type=variable \
  && wp --path=DST_ROOT option get siteurl"
```

`wp db clean` empties the database without needing `CREATE DATABASE` rights. The last command prints `SRC_URL`, which is expected: Step 8 rewrites it.

Done when the last command prints `SRC_URL` and `wp --path=DST_ROOT db tables --all-tables | wc -l` matches the same count on the source.

### 8. Guard 4: dry-run the search-replace, then run it

Rewrite URLs only with `wp search-replace --precise --recurse-objects --all-tables`, which keeps serialised PHP intact. `sed` on a dump and SQL `REPLACE()` corrupt serialised data silently, even where a host's own guide recommends them.

Run these four forms, in this order, each first with `--dry-run --report-changed-only`. The examples move `old.example.com` to `new.example.com`; substitute `SRC_HOST` and `DST_HOST`.

| Form | Search | Replace |
|---|---|---|
| The URL | `SRC_URL` | `DST_URL` |
| Escaped slashes, as page builders store JSON | `https:\/\/old.example.com` | `https:\/\/new.example.com` |
| Plain `http` | `http://old.example.com` | `https://new.example.com` |
| Bare host | `old.example.com` | `new.example.com` |

```bash
ssh DST_SSH "wp --path=DST_ROOT search-replace 'SEARCH' 'REPLACE' \
  --all-tables --precise --recurse-objects --report-changed-only --dry-run"
```

Read each dry-run's count. Zero on the first form, or a count far from what the source's size suggests, is a stop. When the counts look sane, run the four forms for real without `--dry-run`.

Page builders also bake absolute URLs into generated CSS files. Grep `DST_ROOT/wp-content` for `SRC_HOST` and regenerate that builder's CSS through its own tool.

Done when all four forms have run for real and you have recorded each one's replacement count.

### 9. Verify

- Re-run the four dry-runs: each must report 0 replacements.
- `grep -rl SRC_HOST DST_ROOT/wp-content` finds nothing you can't explain (logs and test files are fine to name).
- `.htaccess` holds a `# BEGIN WordPress` block. Under WP-CLI, `wp rewrite flush` exits 0 without writing it, so its exit code is not evidence. When the block is missing, write WordPress's standard block by hand.
- Fetch a few interior pages and confirm each returns 200. Behind HTTP auth, the auth wall answers first, so report those checks as unverified rather than passed.
- Ask the user to look at the site in a browser. Nothing in this list proves it looks right.

Leave `blog_public` at `0` on a site that is not yet public. Going public is the user's call.

## Going back

Restoring the target refuses to run against an empty or non-SQL restore point. Run Guard 1 on the target and the dump check on the restore point's `db.sql` first; on both passing:

```bash
ssh DST_SSH "set -o pipefail; cat RP/db.sql | (wp --path=DST_ROOT db clean --yes && wp --path=DST_ROOT db import -)"
```

This restores the database only. Restore `wp-content` and `wp-config.php` from the restore point by hand.

## Throughout

- Skip `wp core update` during a migration.
- Keep the restore point and both dumps until the user removes them; their `RETENTION.md` names the date.

## Report

Give the user: source and target (URL, root, SSH target), the four replacement counts, which verify checks passed and which were unverified or skipped, the restore-point path, the exact restore command, and what remains before the site goes public.
