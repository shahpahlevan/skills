#!/usr/bin/env bash
#
# go-live-check.sh: a read-only pre-launch check for a WordPress site.
#
# Two passes, kept apart so the security results stay legible on their own:
#   SETUP     sitemap, 404 page, homepage title, staging leaks, search
#             engine visibility, analytics tag, domain aliases
#   SECURITY  the hardening checks a plain HTTP request can answer
#
# Every check is a GET, a HEAD or a WP-CLI read, except one POST with a body to
# wp-cron.php, which WordPress drops before it runs cron. Nothing is written and
# no cron job runs, so it is safe to run against a live site. A check that needs something you did not
# give it (WP-CLI access, a staging URL, an alias) reports SKIP or INFO.
#
# Usage:
#   go-live-check.sh https://example.com
#   go-live-check.sh https://example.com --wp-path /path/to/wordpress --staging https://staging.example.com
#   go-live-check.sh https://example.com --ssh mysite --wp-path /path/to/wordpress --alias www.example.com
#
# Options:
#   --wp-path <path>     WordPress root, for the WP-CLI reads
#   --ssh <alias>        run the WP-CLI reads over `ssh <alias>` (use with --wp-path)
#   --staging <url>      staging URL, for a WP-CLI search-replace dry run
#   --alias <host|url>   a domain that should 301 to the site (repeatable)
#   --timeout <secs>     per-request timeout (default 15)
#   -h, --help           show this help
#
# Exit status: 0 when every check passes, 2 when at least one fails, 1 on a
# usage error. The checks here are a subset: the rest of the pre-launch
# checklist needs a person.

set -u

SITE_URL=""
WP_PATH=""
SSH_ALIAS=""
STAGING_URL=""
TIMEOUT=15
ALIASES=""
UA="Mozilla/5.0 (compatible; go-live-check/1.0; read-only)"

usage() {
  sed -n '3,30p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --wp-path)  WP_PATH="${2:-}"; shift 2 ;;
    --ssh)      SSH_ALIAS="${2:-}"; shift 2 ;;
    --staging)  STAGING_URL="${2:-}"; shift 2 ;;
    --alias)    ALIASES="$ALIASES ${2:-}"; shift 2 ;;
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
with_scheme() { case "$1" in *://*) printf '%s' "$1" ;; *) printf '%s%s' "$HTTPS" "$1" ;; esac; }

# Normalise the URL: add a scheme, drop a trailing slash, take the host.
SITE_URL=$(with_scheme "$SITE_URL")
SITE_URL="${SITE_URL%/}"
HOST=$(printf '%s' "$SITE_URL" | sed -E 's#^https?://##; s#/.*##')

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
  C_PASS=$'\033[0;32m'; C_FAIL=$'\033[0;31m'; C_SKIP=$'\033[0;33m'
  C_HEAD=$'\033[1m'; C_RST=$'\033[0m'
else
  C_PASS=""; C_FAIL=""; C_SKIP=""; C_HEAD=""; C_RST=""
fi

# Tallies, one per pass and outcome: tally setup FAIL, tally security PASS, ...
# An INFO line counts as a SKIP.
tally() { eval "printf '%d' \"\${tally_$1_$2:-0}\""; }

report() { # pass(setup|security) name status evidence
  local col="" outcome=SKIP
  case "$3" in
    PASS) col="$C_PASS"; outcome=PASS ;; FAIL) col="$C_FAIL"; outcome=FAIL ;; SKIP|INFO) col="$C_SKIP" ;;
  esac
  printf '  %s%-4s%s  %-30s %s\n' "$col" "$3" "$C_RST" "$2" "$4"
  local next=$(( $(tally "$1" "$outcome") + 1 ))
  eval "tally_$1_$outcome=$next"
}

header() { printf '\n%s%s%s\n' "$C_HEAD" "$1" "$C_RST"; }

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
header_line() { printf '%s' "$1" | grep -i "^$2:" | head -1; }
blocked() { printf '%s' "$1" | grep -qE '^(401|403|404)$'; }

# WP-CLI reads, only when --wp-path or --ssh was given.
WP_AVAILABLE="no"
wp_read() {
  local path_arg=""
  [ -n "$WP_PATH" ] && path_arg="--path='$WP_PATH'"
  if [ -n "$SSH_ALIAS" ]; then
    ssh -o BatchMode=yes "$SSH_ALIAS" "wp $path_arg --skip-plugins --skip-themes $*" 2>/dev/null
  elif [ -n "$WP_PATH" ] && command -v wp >/dev/null 2>&1; then
    eval "wp $path_arg --skip-plugins --skip-themes $*" 2>/dev/null
  else
    return 1
  fi
}
if [ -n "$SSH_ALIAS$WP_PATH" ] && [ -n "$(wp_read option get siteurl)" ]; then
  WP_AVAILABLE="yes"
fi

TMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t golive)
trap 'rm -rf "$TMP_DIR"' EXIT
HOME_HTML="$TMP_DIR/home.html"
fetch -L -o "$HOME_HTML" "$SITE_URL/" || :
HOME_HEADERS=$(final_headers "$SITE_URL/")

printf '%sGo-live check: %s%s\n' "$C_HEAD" "$SITE_URL" "$C_RST"
printf '  Run %s. Read-only. WP-CLI reads: %s\n' "$(date '+%Y-%m-%d %H:%M')" "$WP_AVAILABLE"

# ===========================================================================
# SETUP
# ===========================================================================
header "SETUP"

# Sitemap
sitemap=""
for p in /sitemap_index.xml /sitemap.xml /wp-sitemap.xml; do
  if [ "$(final_status "$SITE_URL$p")" = "200" ] \
    && fetch -L "$SITE_URL$p" | grep -qiE '<(urlset|sitemapindex)'; then
    sitemap="$p"; break
  fi
done
if [ -n "$sitemap" ]; then
  report setup "XML sitemap" PASS "$sitemap is a valid sitemap"
else
  report setup "XML sitemap" FAIL "no sitemap at /sitemap_index.xml, /sitemap.xml or /wp-sitemap.xml"
fi

# 404 page
probe="go-live-404-probe-$$"
code=$(status "$SITE_URL/$probe")
size=$(fetch "$SITE_URL/$probe" | wc -c | tr -d ' ')
if [ "$code" = "404" ] && [ "${size:-0}" -gt 500 ]; then
  report setup "404 page" PASS "a made-up path returns 404 with a full page ($size bytes)"
elif [ "$code" = "404" ]; then
  report setup "404 page" FAIL "returns 404 but the page is nearly empty ($size bytes)"
else
  report setup "404 page" FAIL "a made-up path returned $code, not 404"
fi

# Homepage title
title=$(tr '\n' ' ' < "$HOME_HTML" 2>/dev/null | grep -oiE '<title[^>]*>[^<]*</title>' | head -1 \
  | sed -E 's/<[^>]+>//g; s/^ +| +$//g')
if [ -z "$title" ]; then
  report setup "Homepage title" FAIL "no <title> on the homepage"
elif printf '%s' "$title" | grep -qiE 'just another wordpress site|untitled|placeholder|coming soon'; then
  report setup "Homepage title" FAIL "placeholder title: \"$title\""
else
  report setup "Homepage title" PASS "\"$title\""
fi

# Staging URLs left behind
if [ "$WP_AVAILABLE" = yes ] && [ -n "$STAGING_URL" ]; then
  if ! out=$(wp_read "search-replace '$STAGING_URL' '$SITE_URL' --dry-run --all-tables --report-changed-only"); then
    report setup "No staging URLs" FAIL "the WP-CLI search-replace dry run failed; run it by hand"
  elif n=$(printf '%s' "$out" | grep -oiE '[0-9]+ replacement' | grep -oE '[0-9]+' | awk '{s+=$1} END{print s+0}')
    [ "$n" -eq 0 ]; then
    report setup "No staging URLs" PASS "dry run: nothing in the database still names $STAGING_URL"
  else
    report setup "No staging URLs" FAIL "dry run: $n values still name $STAGING_URL"
  fi
else
  hits=$(grep -oiE 'https?://[a-z0-9.-]*(staging|localhost|\.local|\.test)[a-z0-9./-]*' "$HOME_HTML" 2>/dev/null | sort -u | head -5 | tr '\n' ' ')
  if [ -n "$hits" ]; then
    report setup "No staging URLs" FAIL "the homepage links to: $hits"
  else
    report setup "No staging URLs" INFO "homepage is clean; give --wp-path and --staging to check the database"
  fi
fi

# Search engines allowed
if [ "$WP_AVAILABLE" = yes ]; then
  bp=$(wp_read option get blog_public)
  if [ "$bp" = "1" ]; then
    report setup "Search engines allowed" PASS "blog_public is 1"
  else
    report setup "Search engines allowed" FAIL "blog_public is '$bp': 'Discourage search engines' is ticked"
  fi
elif tr '\n' ' ' < "$HOME_HTML" 2>/dev/null | grep -oiE '<meta[^>]+name=["'"'"']robots["'"'"'][^>]*>' | grep -qi noindex; then
  report setup "Search engines allowed" FAIL "the homepage says noindex"
elif fetch -L "$SITE_URL/robots.txt" | tr -d '\r' | grep -qiE '^Disallow:[[:space:]]*/[[:space:]]*$'; then
  report setup "Search engines allowed" FAIL "robots.txt disallows the whole site"
else
  report setup "Search engines allowed" PASS "no noindex and no blanket disallow"
fi

# Analytics tag
tag=$(grep -oiE 'googletagmanager|gtag\(|G-[A-Z0-9]{6,}|google-analytics|google-site-kit|plausible|matomo|fathom' "$HOME_HTML" 2>/dev/null | sort -u | head -3 | tr '\n' ' ')
if [ -n "$tag" ]; then
  report setup "Analytics tag" PASS "found: $tag"
else
  report setup "Analytics tag" FAIL "no analytics tag on the homepage"
fi

# Domain aliases
if [ -n "$(printf '%s' "$ALIASES" | tr -d ' ')" ]; then
  for a in $ALIASES; do
    au=$(with_scheme "$a")
    code=$(status "$au/")
    loc=$(location "$au/")
    target=$(printf '%s' "$loc" | sed -E 's#^https?://##; s#/.*##')
    case "$code" in
      301|308)
        if [ "$target" = "$HOST" ]; then
          report setup "Alias $a" PASS "$code to $loc"
        else
          report setup "Alias $a" FAIL "$code, but to '$target', not '$HOST'"
        fi ;;
      302|307) report setup "Alias $a" FAIL "temporary $code redirect; make it 301" ;;
      *)       report setup "Alias $a" FAIL "returned $code, no permanent redirect to $HOST" ;;
    esac
  done
else
  report setup "Domain aliases" SKIP "no --alias given"
fi

# ===========================================================================
# SECURITY
# ===========================================================================
header "SECURITY"

# HTTPS redirect
code=$(status "$HTTP$HOST/")
landed=$(final_url "$HTTP$HOST/")
case "${landed%%:*}:$code" in
  https:302|https:307) report security "HTTPS redirect" FAIL "http:// redirects with a temporary $code; make it 301" ;;
  https:*)            report security "HTTPS redirect" PASS "http:// lands on $landed" ;;
  *)                  report security "HTTPS redirect" FAIL "http:// stays on plain HTTP (landed on $landed)" ;;
esac

# HSTS
hsts=$(header_line "$HOME_HEADERS" "strict-transport-security")
maxage=$(printf '%s' "$hsts" | grep -oiE 'max-age=[0-9]+' | grep -oE '[0-9]+' | head -1)
if [ -z "$hsts" ]; then
  report security "HSTS" FAIL "no Strict-Transport-Security header"
elif [ "${maxage:-0}" -ge 31536000 ]; then
  report security "HSTS" PASS "max-age=$maxage"
else
  report security "HSTS" FAIL "max-age=${maxage:-0}, under one year (31536000)"
fi

# Security headers
csp=$(header_line "$HOME_HEADERS" "content-security-policy")
csp_ro=$(header_line "$HOME_HEADERS" "content-security-policy-report-only")
missing=""
[ -z "$(header_line "$HOME_HEADERS" "x-frame-options")" ] && ! printf '%s' "$csp" | grep -qi frame-ancestors \
  && missing="$missing X-Frame-Options"
[ -z "$(header_line "$HOME_HEADERS" "referrer-policy")" ] && missing="$missing Referrer-Policy"
[ -z "$(header_line "$HOME_HEADERS" "permissions-policy")" ] && missing="$missing Permissions-Policy"
header_line "$HOME_HEADERS" "x-content-type-options" | grep -qi nosniff || missing="$missing X-Content-Type-Options"
[ -z "$csp$csp_ro" ] && missing="$missing Content-Security-Policy"
if [ -z "$missing" ]; then
  report security "Security headers" PASS "all five present"
else
  report security "Security headers" FAIL "missing:$missing"
fi

# PHP version
xpb=$(header_line "$HOME_HEADERS" "x-powered-by")
if printf '%s' "$xpb" | grep -qiE 'php/?[0-9]'; then
  report security "PHP version hidden" FAIL "$xpb"
else
  report security "PHP version hidden" PASS "no PHP version in X-Powered-By"
fi

# Version fingerprints
srv=$(header_line "$HOME_HEADERS" "server")
gen=$(grep -oiE '<meta[^>]+name=["'"'"']generator["'"'"'][^>]*>' "$HOME_HTML" 2>/dev/null | grep -oiE 'wordpress[^"'"'"'/>]*' | head -1)
readme=$(status "$SITE_URL/readme.html")
licence=$(status "$SITE_URL/license.txt")
found=""
printf '%s' "$srv" | grep -qE '[0-9]+\.[0-9]+' && found="$found Server header ($srv);"
[ -n "$gen" ] && found="$found generator tag ($gen);"
blocked "$readme" || found="$found readme.html=$readme;"
blocked "$licence" || found="$found license.txt=$licence;"
if [ -z "$found" ]; then
  report security "Version fingerprints" PASS "no version in headers, no generator tag, readme and licence blocked"
else
  report security "Version fingerprints" FAIL "$found"
fi

# wp-cron.php. WordPress runs cron on any request to wp-cron.php except a POST
# with a body, which it drops before cron starts; so this check sends one.
cron=$(fetch -o /dev/null -w '%{http_code}' --data 'go-live-check=1' "$SITE_URL/wp-cron.php")
if blocked "$cron"; then
  report security "wp-cron.php blocked" PASS "returns $cron"
elif [ "$cron" = "200" ]; then
  report security "wp-cron.php blocked" FAIL "anyone can trigger it (200)"
else
  report security "wp-cron.php blocked" INFO "returns $cron; check by hand"
fi

# User enumeration
users=$(fetch "$SITE_URL/wp-json/wp/v2/users")
author=$(location "$SITE_URL/?author=1")
found=""
[ "$(status "$SITE_URL/wp-json/wp/v2/users")" = "200" ] && printf '%s' "$users" | grep -qE '"slug"' \
  && found="$found the REST API lists users;"
printf '%s' "$author" | grep -qiE '/author/[a-z0-9]' && found="$found ?author=1 redirects to $author;"
if [ -z "$found" ]; then
  report security "User enumeration" PASS "no user list, no author redirect"
else
  report security "User enumeration" FAIL "$found"
fi

# Uploads listing
listing=""
for p in /wp-content/uploads/ "/wp-content/uploads/$(date +%Y)/"; do
  if [ "$(status "$SITE_URL$p")" = "200" ] && fetch -L "$SITE_URL$p" | grep -qi 'index of'; then
    listing="$p"; break
  fi
done
if [ -n "$listing" ]; then
  report security "Uploads not browsable" FAIL "directory listing at $listing"
else
  report security "Uploads not browsable" PASS "no directory listing under /wp-content/uploads/"
fi

# Login surface
login=$(final_status "$SITE_URL/wp-login.php")
case "$login" in
  401|403) report security "Login surface" PASS "wp-login.php returns $login (gated)" ;;
  *)       report security "Login surface" INFO "wp-login.php returns $login; confirm two-factor and lockout by hand" ;;
esac

# ===========================================================================
# SUMMARY
# ===========================================================================
header "SUMMARY"
for pass in setup security; do
  printf '  %-10s PASS %d   FAIL %d   SKIP %d\n' "$(printf '%s' "$pass" | tr a-z A-Z)" \
    "$(tally "$pass" PASS)" "$(tally "$pass" FAIL)" "$(tally "$pass" SKIP)"
done
printf '\n  These checks are a subset. The rest of the checklist needs a person.\n'

if [ "$(tally setup FAIL)" -gt 0 ] || [ "$(tally security FAIL)" -gt 0 ]; then
  exit 2
fi
exit 0
