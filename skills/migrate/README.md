# migrate

Move a WordPress site to another host or account with plain `wp`, `rsync` and `ssh`, behind four guards. The procedure the agent follows is [SKILL.md](SKILL.md). This page is for the developer.

## Any write to a live site

These sections moved here from the article that pairs with this skill on my site, "How to know a change to your site really happened" (formerly "How I let a coding agent run WP-CLI on a live site"), when it was rewritten for the site's owner. They cover any write a coding agent makes to a live site over SSH; `/migrate` holds a whole move to the same rule.

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
