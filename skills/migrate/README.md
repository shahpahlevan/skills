# migrate

Move a WordPress site to another host or account with plain `wp`, `rsync` and `ssh`, behind four guards. The procedure the agent follows is [SKILL.md](SKILL.md). This page is for the developer.

## Any write to a live site

These sections moved here from the article that pairs with this skill on my site, "How to know a website change really happened" (formerly "How I let a coding agent run WP-CLI on a live site"), when it was rewritten for the site's owner. They cover any write a coding agent makes to a live site over SSH; `/migrate` holds a whole move to the same rule.

A database export can exit 0 and leave a 20-byte file. No error, no warning, and no backup inside it. So when a coding agent runs WP-CLI on a live site for me, each write ends on a separate read, never on what the command said. On one bulk change, that meant reading 43 live values before writing any.

Those values came from a statements file: every change the agent will make, one row each, with its old value and its new one, written before anything runs and read by me first. When the write is moving a whole site, `/migrate` holds it to the same rule: a separate read, never an exit code.

### What it does

Each guard ends on a pass or a stop, and a stop ends the write. The first is the identity check: the agent asks the site for its own address, and stops if it isn't the one you expected.

```sh
wp option get siteurl
```

| Guard | What happens | In `/migrate` |
| --- | --- | --- |
| **Identity check** | Asks the site its address before any other step, and again just before the first destructive write | On both ends, source and target |
| **Restore point** | Exports the database before anything changes, into a locked folder outside the web root, with a `RETENTION.md` naming the date to delete it | The target's database and files |
| **Dump check** | A dump passes only if it isn't empty, starts like SQL and ends with `Dump completed`, whatever the exit code said | On the restore point, then again before the first destructive write |
| **Statements file first** | The agent writes the file, you read it, and the write runs from it alone | Not a guard there: it dry-runs each search-replace and reads the counts before the real run |
| **Absolute output paths** | Every command that writes a file gets a full path, outside the web root | Every dump goes to its own folder in the account's home |
| **Separate read** | Reads each change back from the live site, and reports only what it saw | Dry runs again, expecting 0, and inner pages fetched |

### When to reach for it

Reach for `/migrate` when a WordPress site moves to another server or account. For any other write to a live site over SSH, hold the agent to the guards above. Reads need none of them.

### The statements file


A bulk write run as a `wp eval` loop leaves nothing behind but its own report. A review can confirm the result looks right and still not say what ran. Written first, a statements file turns that report into something you can check.

Each row names one target, one field, the old value and the new one. Because it keeps every old value, the same file is how the change gets undone.

Then the agent reads every value again, live. If one no longer matches its old value, it has drifted: something changed the site after the file was written, so the plan is stale. The whole batch aborts before anything is written, and the agent names the rows that drifted.

The 43-row file was checked this way. Every row matched, so all 43 were written.

### What it leaves behind

| It leaves | Why |
| --- | --- |
| The statements file | It's the plan you read, row by row, with the old values to undo it |
| A restore point | It passed the dump check before anything changed |
| A `RETENTION.md` beside each | It names the date to delete it, so nothing lingers by accident |
| Nothing in the web root | Every output path is absolute, and outside it |

The last row comes from a security review of one live site. It found two files in the web root, `csv` and `json`, that no list of changes named, where anyone could download them. The likely cause was an export command that takes the filename where you'd expect a format.

`wp --path` doesn't change folder, either. A relative filename lands wherever the shell happens to be. So every output path is absolute, and I read a command's synopsis before I trust it.

### It's working if

- The identity check prints the address you expected, before any write.
- Every restore point passes the dump check: not empty, and ending with `Dump completed`.
- You read the statements file before a bulk write, never after.
- One drifted row stops the batch, and the agent names it.
- Nothing lands in the web root that you didn't approve.
- "Done" in the agent's report means a separate read saw it.

### Common questions

**Doesn't the agent's SSH access keep it safe?**
Not on its own. These guards govern what the agent does, not what the account can reach. Check the account, its keys and your agent's permission settings separately.

**What if I run the command myself?**
The agent still reads the state again before it says done. Over a non-interactive SSH call, `rm -i` waits on a prompt nobody answers, gets killed and prints nothing. That's the same silence as success, and only a separate `stat` showed the files were still there.

**Why doesn't the agent delete old restore points itself?**
A deletion it schedules for itself is hard to audit. A restore point that deletes itself while you still need it is worse than one that lingers. So the date is written down, and the deleting is yours.

## Moving a whole site

These sections moved here from the article "How to know your site still works after a move" (formerly "The new way to move a live WordPress site"), when it was rewritten for the site's owner. They cover a whole move with `/migrate`; the guards they name are the ones above.

### What it does

Each guard ends on a pass or a stop, and a stop ends the run. The last step is yours.

| Step | What happens |
| --- | --- |
| **Check both ends** | Asks each site for its own address, then checks the target's disk space and that it holds no real content yet |
| **Take a restore point** | Dumps the target's database and copies its files, and keeps the dump only if it passes the dump check: not empty, starts like SQL, ends with mysqldump's last line |
| **Copy and load** | Asks the target its address and runs the dump check again, then copies the files and loads the database |
| **Change the address** | Dry-runs four forms of the old address: the URL, the same with escaped slashes as page builders store it, plain `http`, and the bare domain. Reads each count, then runs them for real |
| **Verify** | Re-runs the dry runs, expecting 0, and fetches inner pages. Then you look at the site |

### When to reach for it on a move

Reach for `/migrate` when a WordPress site moves to another server or account, such as staging to production. The target's files and database are overwritten, so it stops if the target already holds real content. A fresh WordPress install doesn't stop it, since that's where my moves start.

### The check that passes while the site is broken

The first time I moved a real site this way, the final check passed while every inner page returned a 404. A target that's already public stays behind the host's password wall while it moves. The wall answers before WordPress does, so on that first run every inner page gave the same 401, real or missing. The final check counted each 401 as a pass, and never reached the 404 behind it. Now a 401 makes it report the page as unverified, never as passed.

A check like that is fail-green: it reports success when what it checks has failed, because it could never report anything else. A green result proves nothing until it could have been red, and a fail-green check is worse than no check, because it turns a fault you'd find into an all-clear you trust. The same session found two more like it.

So every guard now reads the fact itself:

| Instead of trusting | The guard reads |
| --- | --- |
| **Guard 1:** that the connection worked | Each site's own address, from WordPress |
| **Guard 2:** that the export finished without error | The dump itself, by the dump check |
| **Guard 3:** that the restore point passed earlier | The dump check again, just before the database is emptied |
| **Guard 4:** that the search-replace ran | Its count of changes, then 0 when it runs again |
| **Final check:** a 401 from the password wall | A 200, or the page reported as unverified |

A check that can fail will sometimes fail wrongly, as it did on one page in the second run. That's a cheaper mistake than a pass that means nothing.

### What a move leaves behind

| It leaves | Why |
| --- | --- |
| A restore point of the target, outside the web root | It's checked twice before the first write |
| The exact restore command | It refuses to run against an empty or non-SQL restore point |
| A `RETENTION.md` beside every dump | Dumps hold password hashes and keys, so it names the date to delete them |
| The four replacement counts | A count far from what the site suggests is a stop, not a detail |
| Which checks passed, and which were unverified | So an unverified check is never read as a pass |

### A move is working if

- Both ends print the address you expected.
- The restore point's dump passes the dump check, and its path is in the report.
- The four dry runs report 0 when they run again.
- `.htaccess` holds a `# BEGIN WordPress` block.
- Inner pages return 200, or the report calls them unverified.
- You've looked at the site in a browser.

### Questions about a move

**Why not `sed` on the dump?**
WordPress stores settings and page builder layouts as serialised data: text that states its own length. `sed` changes the text but not the length, so the value breaks without a word, even where a host's own guide recommends it. `wp search-replace` with `--precise` and `--recurse-objects` fixes the lengths as it goes.

**Why read `.htaccess` instead of trusting the flush?**
Under WP-CLI, `wp rewrite flush` can finish without writing the WordPress block. Its exit code says nothing, so the skill reads the file.

**Did it work the first time?**
No. The first run took two attempts and one fix by hand: a `#` in the database password got cut off, and rsync overwrote CSS that had already been fixed. Reviews of the tool had found 28 issues before that run, and missed both.

**What can't it check?**
Whether the site looks right. None of its checks prove that, so the last step is yours.
