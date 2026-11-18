# register-site

Make a new hosting account ready for a coding agent: one command, three clicks in cPanel, and a site registry read off the server. The site registry is a `sites.json` file with one entry for each site and environment: the server, where WordPress lives and the database name, with no password. Before any write, the agent asks the site its URL and stops if it isn't the one in the entry: the identity check.

The procedure the agent follows is [SKILL.md](SKILL.md). This page is for the developer: what the skill does, what it leaves behind and how to tell it worked.

## What it does

The agent makes the key, then stops and waits, because only you can make the three clicks in cPanel.

| Step | What happens |
| --- | --- |
| **Key** | The agent makes a key for this hosting account alone, gives you its public half, then waits |
| **Import the key** | You open SSH Access in cPanel, then Manage SSH Keys, then Import Key, and paste the key |
| **Authorise it** | Back on Manage SSH Keys, you click Manage beside the key, then Authorize. It's a separate click from the import, and easy to miss |
| **Allow your IP** | Some hosts let SSH in only from listed addresses. You add yours, and note the date and how long the host keeps it |
| **Identity check** | The agent asks the site its URL, and stops if it isn't the one you expected |
| **Site registry** | The agent reads the rest off the server into `sites.json`, then runs a checker that fails on a missing value or a secret |

## When to reach for it

Once per hosting account, before an agent does anything on it, and again when you add a site or an environment to the site registry. If the account already connects on its own key, skip the clicks: the agent goes straight to the identity check.

## The wrong site on a shared account

One hosting account in my records holds the sites of four unrelated clients in one home folder. On one host, WordPress sat in a folder named after the domain on one account, and in `public_html` on the next. A write pointed at the wrong folder lands on another site.

So before any write, the agent asks WordPress for its own address:

```sh
wp option get siteurl
```

If the answer isn't the site in the registry's entry, it stops and changes nothing. The rule is written into the entry's note, so it travels with the site.

## What it leaves behind

| It leaves | Why |
| --- | --- |
| A key for this account alone | A leaked key exposes one account, and you can revoke it without re-keying the rest |
| An entry in the site registry | Server, user and port, where WordPress lives and the database name are never typed from memory |
| The IP allowance's end date | So a timeout has an obvious cause |
| The identity check, in the entry's note | So every write starts with it |
| No password anywhere in it | The file is meant to be committed, so a job that needs the database password reads it on the server |

The end date comes from one connection that timed out from an IP address that hadn't changed. The key was fine. Its entry held the end date as unknown rather than a guess, and the host's IP table showed the address had lapsed 28 days after it was added. So the date goes in the entry when you allow your IP, and a timeout from an unchanged IP means adding it again before anyone touches the key.

Every value is read off the server, never copied from another entry, and a date nobody can read stays unknown, because later work trusts a date it finds. On one new account, WordPress wasn't installed yet, so there was nothing to read. The entry stayed unfinished, and the checker failed until the agent read the site again.

Later work reads the entry instead of asking. `/migrate`, which moves a WordPress site to another server or account, takes each value from it.

## It's working if

- The agent connects with no password prompt.
- The identity check prints the URL you expected.
- The checker prints `ok` on `sites.json`.
- The entry holds the IP allowance's end date, or unknown with the reason, if your host keeps a list.
- `/migrate` runs without asking where the site is.

## Common questions

**Why no passphrase on the key?**
The agent can't type one, so it couldn't connect on its own. If you want a passphrase, set one and load the key into your SSH agent before each session.

**What if the connection fails?**
The error tells you which click to look at. A timeout means your IP allowance ran out, or the port is wrong. `Permission denied (publickey)` means the key isn't authorised yet, or your SSH settings don't point at it. `wp: command not found` means the host hasn't put WP-CLI on the path.

**Do I need cPanel?**
For the clicks as the skill writes them, yes. The rules don't need it: a key per account, a check before every write, and a registry with no secrets.
