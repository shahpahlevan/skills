# Skills

Skills I use to build and look after WordPress sites with an AI agent. Each one is
written for any hosting account and any site.

## Skills

| Skill | What it does |
| --- | --- |
| `register-site` | Make a hosting account ready for agent work over SSH and record it in a sites.json registry. Use when an agent needs SSH access to a new WordPress site, or when adding a site or environment to sites.json. |
| `wp-cli-safely` | Write-safety rules for running WP-CLI against a live WordPress site. Use before any write to a production or client site over SSH, any bulk write through `wp eval` or `$wpdb`, a database export, or a command you hand to the human to run. |
| `migrate` | Move a WordPress site to another host or account with plain wp, rsync and ssh, behind four guards. Use when moving or copying a WordPress site to another server or account. |
| `launch-check` | Go/no-go check that a WordPress site is ready to launch. Runs a read-only setup script, then walks the launch checklist with the site owner, from staging URLs and redirects to forms and a restore drill. Use when a WordPress site is about to go live, move host or cut over DNS. Run launch-security-check first, and the site is ready when both say GO. |
| `launch-security-check` | Go/no-go security check for a WordPress site, run from the outside. Runs a read-only script, then works 19 checks, each with a fix, from two-factor sign-in and security headers to locked staging copies and DNS. Use before a WordPress site launches, right after DNS cutover, or after a host or CDN move. Run launch-check after it, and the site is ready when both say GO. |

The two launch skills run as a pair. Run `launch-security-check` first: it works
from outside the site and needs no owner. Then run `launch-check`, which reuses its
host list. Each gives its own GO or NO-GO, and a site is ready when both say GO.

## Install

Install one skill with:

```sh
npx skills add shahpahlevan/skills --skill <name>
```

In Claude Code, add all five as one plugin:

```text
/plugin marketplace add shahpahlevan/skills
/plugin install wordpress-agent-skills@shahpahlevan-skills
```

## Layout

Each skill lives in its own folder: `skills/<name>/SKILL.md`, with any scripts it
runs in `skills/<name>/scripts/`. Every `SKILL.md` carries `name`, `description`
and `version` in its frontmatter.

## Releases

The version lives in `.claude-plugin/plugin.json`. When a push to `main` carries
a version with no matching tag, the release workflow tags `v<version>`, publishes
a GitHub release and calls the website's deploy hook to rebuild it. Nothing is
released until the scrub check and the tests pass. A push that leaves the
version alone does nothing. If the rebuild fails, run the release workflow by
hand on `main`: it calls the deploy hook again for the current release. Each
`SKILL.md` keeps its own `version`.

## Checks

- `npm run scrub` fails if any file holds an IP address (v4 or v6), a hostname
  other than `example.com`, a private document id, a wikilink, a home-folder
  path, or a term from a private list kept outside this repo. Point a clone at
  that list with `git config skills.privateList <path>` (one term per line); CI
  reads it from the `SCRUB_PRIVATE_TERMS` secret. It runs in CI on every push
  and pull request.
- `npm test` proves the scrub check against its fixtures and the pre-push hook
  against a throwaway clone.
- `hooks/pre-push` refuses a push that names a client. It reads its list from a
  file outside this repo, and refuses every push if that file is missing. Set it
  up in a clone with `hooks/install.sh <path to the list>`.

## Licence

MIT. See [LICENSE](LICENSE).
