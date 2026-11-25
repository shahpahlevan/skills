# Fixes, by check id

Shown for Apache and `.htaccess` (typical shared and cPanel hosting). On nginx, use the equivalent in the server block. Make the check again after every fix.

## WP-01 Two-factor sign-in for admins
Install a two-factor plugin (WP 2FA, Wordfence Login Security, Two Factor). Make TOTP **required** for `administrator`, `editor` and any custom admin-level role, and enrol every existing admin before launch. Close the bypass: where no integration uses Application Passwords, add `add_filter( 'wp_is_application_passwords_available', '__return_false' );` to an mu-plugin. Otherwise revoke every Application Password with no known consumer, and give each integration its own least-privilege user.

## WP-02 Login page protected
Best: restrict `/wp-login.php` and `/wp-admin/` to known addresses (at the CDN or with `Require ip`). Otherwise: a lockout plugin (Limit Login Attempts Reloaded or Wordfence) set to about 5 failures and a 15 to 30 minute lockout, with lockouts logged. Add a CDN rate-limit rule on `/wp-login.php` if there is a CDN. Make login errors generic so they do not reveal whether the username exists.

## WP-03 HSTS for one year
Turn it on only once HTTPS works on every hostname: browsers remember HSTS. At the CDN (for example Cloudflare › SSL/TLS › Edge Certificates › HSTS: 12 months, include subdomains), or:
```apache
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
```

## WP-04 Security headers
```apache
<IfModule mod_headers.c>
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "geolocation=(), camera=(), microphone=()"
  Header always set Content-Security-Policy-Report-Only "default-src 'self' https: data: 'unsafe-inline' 'unsafe-eval'"
</IfModule>
```
CSP on a page-builder site needs tuning: launch report-only, watch the violations, tighten it, then switch to enforcing `Content-Security-Policy`.

## WP-05 Cookies carry SameSite
```apache
Header always edit Set-Cookie ^(wordpress_.*)$ "$1; SameSite=Lax"
```

## WP-06 PHP version hidden
Set `expose_php = Off` in the host's PHP options (cPanel › Select PHP Version › Options, or `php.ini`). Belt and braces:
```apache
Header always unset X-Powered-By
Header unset X-Powered-By
```

## WP-07 Version files blocked
Deleting the files does not last, because core updates restore them. Block them instead:
```apache
<FilesMatch "^(readme\.html|license\.txt)$">
  Require all denied
</FilesMatch>
```

## WP-08 `wp-cron.php` closed to the public
In `wp-config.php`: `define( 'DISABLE_WP_CRON', true );`. Add a server cron job, for example every 5 minutes: `wp cron event run --due-now --path=/path/to/site`. Then block the public endpoint:
```apache
<Files "wp-cron.php">
  Require all denied
</Files>
```
Set up the server cron job **before** blocking the endpoint, or scheduled posts, emails and backups stop.

## WP-09 Usernames hidden
An mu-plugin that hides the users endpoint from signed-out visitors and stops author enumeration:
```php
<?php
add_filter( 'rest_endpoints', function ( $e ) {
    if ( ! is_user_logged_in() ) {
        unset( $e['/wp/v2/users'], $e['/wp/v2/users/(?P<id>[\d]+)'] );
    }
    return $e;
} );
add_action( 'template_redirect', function () {
    if ( is_author() || isset( $_GET['author'] ) ) {
        wp_safe_redirect( home_url( '/' ), 301 );
        exit;
    }
} );
```
This works at the WordPress level, so it covers both REST routes. A host rule on `/wp-json/` alone misses `?rest_route=`.

## WP-10 Version fingerprints removed
`remove_action( 'wp_head', 'wp_generator' );` in an mu-plugin. The `Server` version is the host's to hide; a CDN in front replaces it.

## WP-11 No directory listings or leftover files
`Options -Indexes` in `.htaccess`. Block control-panel paths at the CDN, or ask the host to stop proxying them. Delete database dumps, archives, old config copies, installers and `phpinfo` files from the web root; move any that are still needed above it, where no URL reaches them.

## WP-12 Non-live copies locked
HTTP basic auth on the staging vhost (cPanel › Directory Privacy, or `AuthType Basic` with `.htpasswd`), or a single sign-on or address gate at the CDN. A coming-soon plugin does not count: it leaves `/wp-json/`, feeds and uploads open.

## WP-13 Non-live copies hidden from search
Settings › Reading › "Discourage search engines" on the copy, plus `Header set X-Robots-Tag "noindex, nofollow"` on its host. If the live sitemap lists the copy's URLs, the live database still holds them: replace them, then regenerate the sitemap. If the copy is already indexed, lock it (WP-12) and request removal in Google Search Console.

## WP-14 Origin server refuses direct requests
Make the origin accept only the CDN: firewall it to the CDN's published address ranges, or have the CDN add a secret request header and return 403 at the origin when it is missing. On shared hosting with no firewall control, use the header method in `.htaccess`. A site with no CDN or firewall in front has nothing to fix here: the check is N/A.

## WP-15 Email authentication
Publish at the DNS host: SPF (`v=spf1 include:<mail-provider> ~all`), DKIM (the CNAME or TXT record the mail or SMTP provider gives you) and DMARC (`_dmarc` TXT: `v=DMARC1; p=none; rua=mailto:<reports-address>`). Move DMARC to `quarantine` once reports look clean. Form notifications land in spam without these.

## WP-16 DNS records clean
Delete records for retired services and old hostnames. Put any record that exposes the origin's address (for example a `direct.` or `ftp.` record that skips the CDN) behind the CDN, or remove it. If the origin's address has been public, consider asking the host for a new one.

## WP-17 HTTP redirects to HTTPS
Turn on the host's or CDN's "force HTTPS" setting (for example Cloudflare › SSL/TLS › Edge Certificates › Always Use HTTPS), or:
```apache
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://example.com/$1 [L,R=301]
```
Put the rule above the WordPress block, with the site's own hostname. A 302 or 307 fails: make the redirect a 301. Behind a proxy that ends TLS, test `%{HTTP:X-Forwarded-Proto} !https` instead, or the rule loops.

## WP-18 Only the admins who need it
List them with `wp user list --role=administrator`. For each account the owner does not confirm: lower its role (`wp user set-role <user> editor`), or delete it and hand its content to another user (`wp user delete <user> --reassign=<id>`). Give the builder's and any agency's accounts an end date.

## WP-19 Debug output off
In `wp-config.php` on the live site:
```php
define( 'WP_DEBUG', false );
define( 'WP_DEBUG_DISPLAY', false );
@ini_set( 'display_errors', 0 );
```
If logging has to stay on, keep `WP_DEBUG_DISPLAY` false and point `WP_DEBUG_LOG` at a path above the web root. Delete any `debug.log` already in `wp-content/`, or block it:
```apache
<Files "debug.log">
  Require all denied
</Files>
```
