---
name: register-site
description: Make a hosting account ready for agent work over SSH and record it in a sites.json registry. Use when an agent needs SSH access to a new WordPress site, or when adding a site or environment to sites.json.
version: 1.0.0
---

# Register a site

Registering a site gives an agent two things: SSH that connects with the account's own key, and a `sites.json` entry holding the site's real connection facts, read off the server. Later work reads the registry instead of guessing.

This is not one command. Part 2 is three steps only the human can do in cPanel, and the job waits on them.

## Inputs

Ask the human for whatever is missing:

- **slug**: a short lower-case name for the site, such as `example-shop`. It names the key and the SSH alias.
- **environment**: `staging`, `production` or another name.
- **site URL**: the address the site answers on.
- **SSH host, port and user**, as cPanel shows them (on the account's home page or under SSH Access). Take the port the host states; many hosts use one other than 22.
- **where `sites.json` lives**: the project root unless the human says otherwise.

If SSH to this account already works with its own key, go straight to Part 3.

## Part 1: Prepare the key

1. Generate a key for this hosting account alone:

   ```sh
   ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_<slug> -N "" -C "<slug>"
   ```

   One key per account means a leaked key exposes one account, and that account can be revoked without re-keying the rest. The empty passphrase is what lets an agent connect unattended. Tell the human that trade-off; if they want a passphrase, they set one and load the key into `ssh-agent` before each session.

2. Append two blocks to `~/.ssh/config`, leaving every existing block exactly as it is:

   ```
   # <slug> <environment> (<site URL>)
   Host <slug>-<environment>
       HostName <ssh host>
       User <ssh user>
       Port <ssh port>
       IdentityFile ~/.ssh/id_ed25519_<slug>
       IdentitiesOnly yes

   Host <ssh host>
       HostName <ssh host>
       User <ssh user>
       Port <ssh port>
       IdentityFile ~/.ssh/id_ed25519_<slug>
       IdentitiesOnly yes
   ```

   The second block is keyed on the host name because tools that read `ssh_host` from the registry connect by host name, and an alias block never matches it. Without it, SSH falls back to its default keys and is refused, which looks exactly like a bad key. `Host` patterns are case-sensitive, so copy the host name in the exact case cPanel shows, here and in `sites.json`. If a block for that host name already exists, keep it and tell the human.

   Check both with `ssh -G <slug>-<environment>` and `ssh -G <ssh host>`: each must show the right `user`, `port` and `identityfile`.

3. Hold off connecting until the human confirms Part 2. Before then the key is not authorised, so a failure carries no information and reads like a real fault.

4. Give the human the public key as one clean line: print `~/.ssh/id_ed25519_<slug>.pub`, or on macOS put it on the clipboard with `tr -d '\n' < ~/.ssh/id_ed25519_<slug>.pub | pbcopy`. Then hand over Part 2 and wait.

## Part 2: Human steps in cPanel

Give these to the human as written. Only they can do them.

1. **Import the key.** In cPanel open SSH Access, then Manage SSH Keys, then Import Key. Paste the public key and name it.
2. **Authorise the key.** Back on Manage SSH Keys, find the key under Public Keys and click Manage, then Authorize. This is a separate click from the import. An imported key that is not authorised is refused with an error that looks like a wrong user name.
3. **Allow your IP address, if the host asks for it.** Some hosts accept SSH only from listed addresses. Add the public address of the machine the agent runs on. Note the date you added it and how long the host keeps an entry; its SSH page or help usually says. A lapsed entry shows up months later as a connection timeout, not as a refused key.

Ask the human to say when all three are done, and to give the date they added the address and the host's window, if the host has an allow-list.

## Part 3: Check identity and read the values

Everything here reads; nothing changes the site.

1. **Find the WordPress root.** It is not always `public_html`: it varies between accounts, even on one host. Look for `wp-config.php` under the home directory (`ssh <slug>-<environment> 'ls ~'`), or ask cPanel for the domain's document root:

   ```sh
   ssh <slug>-<environment> "uapi --output=jsonpretty DomainInfo single_domain_data domain=<domain>"
   ```

2. **Run the identity check.** This must print the site URL:

   ```sh
   ssh <slug>-<environment> "wp --path=<wp_root> option get siteurl"
   ```

   One command proves SSH works, WP-CLI is there and the path is the right site. Several sites often share one account, so a mismatch means stop and tell the human: a write against the wrong path lands on another site. Read a failure by its symptom:

   - a timeout: the address allow-list, or the wrong port.
   - `Permission denied (publickey)`: the key is not authorised, or the config block does not match.
   - `wp: command not found`: WP-CLI is missing or off the path; ask the human how this host provides it.

3. **Read the values off the server.** Never copy them from another site's entry:

   ```sh
   ssh <slug>-<environment> "cd <wp_root> && wp config get DB_NAME && wp config get DB_USER && wp config get table_prefix && wp core version && wp option get stylesheet && php -r 'echo PHP_VERSION;'"
   ```

## Part 4: Write and check `sites.json`

Add or replace this environment's entry under `environments`, keeping every other entry as it is. A new file starts like this:

```json
{
  "schema_version": 1,
  "environments": {
    "production": {
      "site_url": "https://example.com",
      "ssh_alias": "example-shop-production",
      "ssh_host": "server1.example.com",
      "ssh_port": 22,
      "ssh_user": "exampleuser",
      "wp_root": "/home/exampleuser/public_html",
      "db_name": "exampleuser_wp",
      "db_user": "exampleuser_wpuser",
      "table_prefix": "wp_",
      "wp_version": "6.8.3",
      "php_version": "8.3.14",
      "active_theme": "twentytwentyfive",
      "ip_allowlist_expiry": "2026-12-04",
      "note": "Identity check before any write: wp --path=<wp_root> option get siteurl must equal site_url. Stop on a mismatch."
    }
  }
}
```

- **Secrets stay out.** The file is meant to be committed, so it holds no password, token or key. A task that needs the database password reads it on the server with `wp config get DB_PASSWORD`.
- **Real values only.** Write what Part 3 read. A value you could not read stays unwritten, and you tell the human which.
- **`ip_allowlist_expiry`** is the date the address was added plus the host's window, as `YYYY-MM-DD`. If the add date is unknown (some hosts answer "already allowed" without saying since when), write `"UNKNOWN: <why>"`: a guessed date is worse than an honest unknown, because later checks trust it. Leave the field out when the host has no allow-list. The address itself is never recorded.
- **`note`** carries the identity check, so the guard travels with the entry.

Then validate with the script in this skill's `scripts/` folder:

```sh
node <this skill's folder>/scripts/validate-sites.mjs <path>/sites.json
```

Fix each line it prints and run it again. The step is done when it prints `ok`.

## Report

Tell the human the WordPress root you found, the values you wrote, the SSH host, whether the allow-list expiry is a date or unknown, and that the validator passed. The site is now registered: any work that reads `sites.json` can reach it, and every write starts with the identity check in its `note`.
