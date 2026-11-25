#!/usr/bin/env bash
#
# check.sh: an outside-in security check for a WordPress site about to launch.
#
# Prints one line per check, WP-01 to WP-19:
#   <ID> <PASS|FAIL|MANUAL|N/A> <evidence>
# then a `SECURITY PASS n FAIL n SKIP n` summary line. MANUAL means a person
# settles the check with SKILL.md; MANUAL and N/A both count as SKIP.
#
# Every request is a GET or a HEAD, plus DNS lookups, except one POST with a
# body to wp-cron.php, which WordPress drops before it runs cron. Nothing is
# written and no cron job runs, so it is safe to run against a live site.
#
# Usage:
#   check.sh https://example.com --no-cdn
#   check.sh https://example.com --origin <ip>
#
# Options:
#   --origin <ip>      the origin server's address, when a CDN or firewall
#                      fronts the site: tests that it refuses direct requests
#   --no-cdn           the site has no CDN or firewall in front: WP-14 is N/A
#   --timeout <secs>   per-request timeout (default 15)
#   -h, --help         show this help
#
# Exit status: 0 when no check fails, 2 when at least one fails, 1 on a usage
# error or when the site cannot be reached.

set -u

SITE_URL=""
ORIGIN_IP=""
NO_CDN="no"
TIMEOUT=15
UA="Mozilla/5.0 (compatible; launch-security-check/1.0; read-only)"

usage() {
  sed -n '3,27p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --origin)   ORIGIN_IP="${2:-}"; shift 2 ;;
    --no-cdn)   NO_CDN="yes"; shift ;;
    --timeout)  TIMEOUT="${2:-15}"; shift 2 ;;
    -h|--help)  usage 0 ;;
    -*)         echo "Unknown option: $1" >&2; usage 1 >&2 ;;
    *)          [ -z "$SITE_URL" ] && SITE_URL="$1"; shift ;;
  esac
done

if [ -z "$SITE_URL" ]; then
  echo "Error: give the site URL, such as https://example.com" >&2
  exit 1
fi

# Schemes live in variables so a URL is always built as "$HTTPS$host".
HTTP='http://'
HTTPS='https://'

# Normalise the URL: add a scheme, drop a trailing slash, take the host.
case "$SITE_URL" in *://*) ;; *) SITE_URL="$HTTPS$SITE_URL" ;; esac
SITE_URL="${SITE_URL%/}"
HOST=$(printf '%s' "$SITE_URL" | sed -E 's#^https?://##; s#/.*##')
HOSTNAME_ONLY="${HOST%%:*}"

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
N_PASS=0; N_FAIL=0; N_SKIP=0

say() { # id status evidence
  case "$2" in
    PASS) N_PASS=$((N_PASS + 1)) ;;
    FAIL) N_FAIL=$((N_FAIL + 1)) ;;
    *)    N_SKIP=$((N_SKIP + 1)) ;;
  esac
  printf '%-6s %-6s %s\n' "$1" "$2" "$3"
}

# ---------------------------------------------------------------------------
# Read-only requests
# ---------------------------------------------------------------------------
fetch() { curl -sS -A "$UA" --max-time "$TIMEOUT" "$@" 2>/dev/null; }
status() { fetch -o /dev/null -w '%{http_code}' "$1"; }            # no redirects
final_status() { fetch -L -o /dev/null -w '%{http_code}' "$1"; }
final_url() { fetch -L -o /dev/null -w '%{url_effective}' "$1"; }
location() { fetch -I "$1" | tr -d '\r' | grep -i '^location:' | head -1 | sed 's/^[Ll]ocation: *//'; }
final_headers() { # header block of the last response only
  fetch -L -D - -o /dev/null "$1" | tr -d '\r' \
    | awk '/^HTTP\//{blk=""} {blk=blk $0 "\n"} END{printf "%s", blk}'
}
hdr() { printf '%s\n' "$HOME_HEADERS" | grep -i "^$1:" | head -1 | cut -d: -f2- | sed 's/^ *//'; }
blocked() { printf '%s' "$1" | grep -qE '^(401|403|404)$'; }

HOME_HEADERS=$(final_headers "$SITE_URL/")
if [ -z "$HOME_HEADERS" ]; then
  echo "Error: could not reach $SITE_URL" >&2
  exit 1
fi
HOME_HTML=$(fetch -L "$SITE_URL/")

# A site that answers 200 to a made-up path would make every guessed file name
# look present, so the guessed names only count when a made-up one is refused.
SOFT_404=$(status "$SITE_URL/launch-security-check-probe-$$")
present() { [ "$SOFT_404" != "200" ] && [ "$(status "$SITE_URL$1")" = "200" ]; }

printf 'Launch security check: %s\n\n' "$SITE_URL"

say WP-01 MANUAL "sign in as an admin and confirm the second factor; see SKILL.md"

# WP-02 login surface
login=$(final_status "$SITE_URL/wp-login.php")
case "$login" in
  401|403) say WP-02 PASS "wp-login.php returns $login (gated)" ;;
  *)       say WP-02 MANUAL "wp-login.php returns $login; confirm the lockout by hand" ;;
esac

# WP-03 HSTS
hsts=$(hdr strict-transport-security)
age=$(printf '%s' "$hsts" | grep -oiE 'max-age=[0-9]+' | grep -oE '[0-9]+' | head -1)
if [ "${age:-0}" -ge 31536000 ]; then say WP-03 PASS "HSTS: $hsts"
else say WP-03 FAIL "HSTS: ${hsts:-missing} (need max-age of 31536000 or more)"; fi

# WP-04 security headers
csp=$(hdr content-security-policy)
missing=""
{ [ -n "$(hdr x-frame-options)" ] || printf '%s' "$csp" | grep -qi 'frame-ancestors'; } || missing="$missing X-Frame-Options"
hdr x-content-type-options | grep -qi nosniff || missing="$missing X-Content-Type-Options"
[ -n "$(hdr referrer-policy)" ]    || missing="$missing Referrer-Policy"
[ -n "$(hdr permissions-policy)" ] || missing="$missing Permissions-Policy"
[ -n "$csp$(hdr content-security-policy-report-only)" ] || missing="$missing Content-Security-Policy"
if [ -z "$missing" ]; then say WP-04 PASS "all five security headers present"
else say WP-04 FAIL "missing:$missing"; fi

say WP-05 MANUAL "sign in and read the cookies in the browser's developer tools; see SKILL.md"

# WP-06 PHP version
xpb=$(hdr x-powered-by)
if printf '%s' "$xpb" | grep -qiE 'php/?[0-9]'; then say WP-06 FAIL "X-Powered-By: $xpb"
else say WP-06 PASS "no PHP version in the headers"; fi

# WP-07 version files
r=$(status "$SITE_URL/readme.html"); l=$(status "$SITE_URL/license.txt")
if [ "$r" = "200" ] || [ "$l" = "200" ]; then say WP-07 FAIL "readme.html=$r license.txt=$l"
else say WP-07 PASS "readme.html=$r license.txt=$l"; fi

# WP-08 wp-cron.php. WordPress runs cron on any request to wp-cron.php except a
# POST with a body, which it drops before cron starts; so this check sends one.
cron=$(fetch -o /dev/null -w '%{http_code}' --data 'launch-security-check=1' "$SITE_URL/wp-cron.php")
if blocked "$cron"; then say WP-08 PASS "wp-cron.php=$cron"
elif [ "$cron" = "200" ]; then say WP-08 FAIL "wp-cron.php=$cron (anyone can trigger it)"
else say WP-08 MANUAL "wp-cron.php=$cron; check by hand"; fi

# WP-09 usernames: both REST routes, plus the author redirect
leak=""
fetch -L "$SITE_URL/wp-json/wp/v2/users" | grep -q '"slug"' && leak="$leak /wp-json/wp/v2/users"
fetch -L "$SITE_URL/?rest_route=/wp/v2/users" | grep -q '"slug"' && leak="$leak /?rest_route=/wp/v2/users"
author=$(location "$SITE_URL/?author=1")
printf '%s' "$author" | grep -qiE '/author/[a-z0-9]' && leak="$leak ?author=1 -> $author"
if [ -z "$leak" ]; then say WP-09 PASS "no usernames exposed"
else say WP-09 FAIL "usernames exposed via:$leak"; fi

# WP-10 server version and generator tag
srv=$(hdr server)
gen=$(printf '%s' "$HOME_HTML" | grep -oiE '<meta[^>]+name=["'"'"']generator["'"'"'][^>]*>' | grep -oiE 'wordpress[^"'"'"'/>]*' | head -1)
if printf '%s' "$srv" | grep -qE '[0-9]+\.[0-9]+' || [ -n "$gen" ]; then
  say WP-10 FAIL "Server: ${srv:-none}${gen:+, generator tag: $gen}"
else say WP-10 PASS "Server: ${srv:-none}, no WordPress generator tag"; fi

# WP-11 directory listings, control-panel paths and leftover files
found=""
for p in /wp-content/uploads/ "/wp-content/uploads/$(date +%Y)/$(date +%m)/"; do
  fetch -L "$SITE_URL$p" | grep -qi 'index of' && { found="$found listing at $p;"; break; }
done
for p in /cpanel /webmail /whm /phpinfo.php /info.php /wp-config.php.bak /wp-config.old; do
  present "$p" && found="$found $p;"
done
for name in backup database dump; do
  for ext in sql zip; do present "/$name.$ext" && found="$found /$name.$ext;"; done
done
if [ -z "$found" ]; then say WP-11 PASS "no directory listing, no common leftover file; list the web root by hand for the rest"
else say WP-11 FAIL "$found"; fi

say WP-12 MANUAL "open each non-live copy in a private window; see SKILL.md"
say WP-13 MANUAL "check each non-live copy for noindex and the live sitemap for its URLs; see SKILL.md"

# WP-14 origin not reachable
if [ "$NO_CDN" = yes ]; then
  say WP-14 N/A "no CDN or firewall in front of the site"
elif [ -n "$ORIGIN_IP" ]; then
  o=$(fetch -o /dev/null -w '%{http_code}' --resolve "$HOSTNAME_ONLY:443:$ORIGIN_IP" "$HTTPS$HOSTNAME_ONLY/")
  if [ "$o" = "200" ]; then say WP-14 FAIL "the origin $ORIGIN_IP serves the site directly ($o)"
  else say WP-14 PASS "the origin $ORIGIN_IP returned $o"; fi
else
  say WP-14 MANUAL "give --origin <ip> to test it, or --no-cdn when nothing fronts the site"
fi

# WP-15 email authentication
DOMAIN="${HOSTNAME_ONLY#www.}"
if command -v dig >/dev/null 2>&1; then
  spf=$(dig +short +time=5 +tries=1 TXT "$DOMAIN" 2>/dev/null | grep -i 'v=spf1')
  dmarc=$(dig +short +time=5 +tries=1 TXT "_dmarc.$DOMAIN" 2>/dev/null | grep -i 'v=dmarc1')
  if [ -n "$spf" ] && [ -n "$dmarc" ]; then say WP-15 PASS "SPF and DMARC published; confirm DKIM with the mail provider's selector"
  else say WP-15 FAIL "SPF=${spf:+yes}${spf:-missing} DMARC=${dmarc:+yes}${dmarc:-missing}"; fi
else
  say WP-15 MANUAL "dig is not installed; look up the SPF, DKIM and DMARC records by hand"
fi

say WP-16 MANUAL "review the DNS zone with the owner; see SKILL.md"

# WP-17 HTTP redirects to HTTPS
code=$(status "$HTTP$HOST/")
landed=$(final_url "$HTTP$HOST/")
case "${landed%%:*}:$code" in
  https:302|https:307) say WP-17 FAIL "plain HTTP redirects with a temporary $code; make it 301" ;;
  https:*)             say WP-17 PASS "plain HTTP lands on $landed ($code)" ;;
  *)                   say WP-17 FAIL "plain HTTP stays on plain HTTP ($code, landed on $landed)" ;;
esac

say WP-18 MANUAL "list the administrators and ask the owner about each; see SKILL.md"

# WP-19 debug output
shown=$(printf '%s' "$HOME_HTML" | grep -oiE '<b>(Notice|Warning|Deprecated|Fatal error|Parse error)</b>:' | head -1)
debug=""
[ -n "$shown" ] && debug="$debug the homepage shows a PHP message ($shown);"
present /wp-content/debug.log && debug="$debug /wp-content/debug.log is public;"
if [ -n "$debug" ]; then say WP-19 FAIL "$debug"
else say WP-19 MANUAL "no PHP message on the homepage; confirm WP_DEBUG_DISPLAY is false and browse the other pages"; fi

printf '\nSECURITY   PASS %d   FAIL %d   SKIP %d\n' "$N_PASS" "$N_FAIL" "$N_SKIP"
printf 'MANUAL lines need a person: work them with SKILL.md. Fixes are in FIXES.md.\n'

[ "$N_FAIL" -gt 0 ] && exit 2
exit 0
