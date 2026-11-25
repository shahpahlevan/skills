#!/usr/bin/env bash
#
# go-live-check.sh: a read-only launch check for a WordPress site.
#
# One pass, SETUP: sitemap, 404 page, homepage title, staging leaks, search
# engine visibility, analytics tag, domain aliases.
#
# Every check is a GET, a HEAD or a WP-CLI read. Nothing is written, so it is
# safe to run against a live site. A check that needs something you did not
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
# usage error. The checks here are a subset: the rest of the launch checklist
# needs a person.

set -u

SITE_URL=""
WP_PATH=""
SSH_ALIAS=""
STAGING_URL=""
TIMEOUT=15
ALIASES=""
UA="Mozilla/5.0 (compatible; go-live-check/1.0; read-only)"

usage() {
  sed -n '3,27p' "$0" | sed 's/^# \{0,1\}//'
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

# The scheme lives in a variable so a URL is always built as "$HTTPS$host".
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

# Tallies, one per outcome. An INFO line counts as a SKIP.
N_PASS=0; N_FAIL=0; N_SKIP=0

report() { # name status evidence
  local col=""
  case "$2" in
    PASS) col="$C_PASS"; N_PASS=$((N_PASS + 1)) ;;
    FAIL) col="$C_FAIL"; N_FAIL=$((N_FAIL + 1)) ;;
    *)    col="$C_SKIP"; N_SKIP=$((N_SKIP + 1)) ;;
  esac
  printf '  %s%-4s%s  %-30s %s\n' "$col" "$2" "$C_RST" "$1" "$3"
}

header() { printf '\n%s%s%s\n' "$C_HEAD" "$1" "$C_RST"; }

# ---------------------------------------------------------------------------
# Read-only requests
# ---------------------------------------------------------------------------
fetch() { curl -sS -A "$UA" --max-time "$TIMEOUT" "$@" 2>/dev/null; }
status() { fetch -o /dev/null -w '%{http_code}' "$1"; }            # no redirects
final_status() { fetch -L -o /dev/null -w '%{http_code}' "$1"; }
location() { fetch -I "$1" | tr -d '\r' | grep -i '^location:' | head -1 | sed 's/^[Ll]ocation: *//'; }

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
  report "XML sitemap" PASS "$sitemap is a valid sitemap"
else
  report "XML sitemap" FAIL "no sitemap at /sitemap_index.xml, /sitemap.xml or /wp-sitemap.xml"
fi

# 404 page
probe="go-live-404-probe-$$"
code=$(status "$SITE_URL/$probe")
size=$(fetch "$SITE_URL/$probe" | wc -c | tr -d ' ')
if [ "$code" = "404" ] && [ "${size:-0}" -gt 500 ]; then
  report "404 page" PASS "a made-up path returns 404 with a full page ($size bytes)"
elif [ "$code" = "404" ]; then
  report "404 page" FAIL "returns 404 but the page is nearly empty ($size bytes)"
else
  report "404 page" FAIL "a made-up path returned $code, not 404"
fi

# Homepage title
title=$(tr '\n' ' ' < "$HOME_HTML" 2>/dev/null | grep -oiE '<title[^>]*>[^<]*</title>' | head -1 \
  | sed -E 's/<[^>]+>//g; s/^ +| +$//g')
if [ -z "$title" ]; then
  report "Homepage title" FAIL "no <title> on the homepage"
elif printf '%s' "$title" | grep -qiE 'just another wordpress site|untitled|placeholder|coming soon'; then
  report "Homepage title" FAIL "placeholder title: \"$title\""
else
  report "Homepage title" PASS "\"$title\""
fi

# Staging URLs left behind
if [ "$WP_AVAILABLE" = yes ] && [ -n "$STAGING_URL" ]; then
  if ! out=$(wp_read "search-replace '$STAGING_URL' '$SITE_URL' --dry-run --all-tables --report-changed-only"); then
    report "No staging URLs" FAIL "the WP-CLI search-replace dry run failed; run it by hand"
  elif n=$(printf '%s' "$out" | grep -oiE '[0-9]+ replacement' | grep -oE '[0-9]+' | awk '{s+=$1} END{print s+0}')
    [ "$n" -eq 0 ]; then
    report "No staging URLs" PASS "dry run: nothing in the database still names $STAGING_URL"
  else
    report "No staging URLs" FAIL "dry run: $n values still name $STAGING_URL"
  fi
else
  hits=$(grep -oiE 'https?://[a-z0-9.-]*(staging|localhost|\.local|\.test)[a-z0-9./-]*' "$HOME_HTML" 2>/dev/null | sort -u | head -5 | tr '\n' ' ')
  if [ -n "$hits" ]; then
    report "No staging URLs" FAIL "the homepage links to: $hits"
  else
    report "No staging URLs" INFO "homepage is clean; give --wp-path and --staging to check the database"
  fi
fi

# Search engines allowed
if [ "$WP_AVAILABLE" = yes ]; then
  bp=$(wp_read option get blog_public)
  if [ "$bp" = "1" ]; then
    report "Search engines allowed" PASS "blog_public is 1"
  else
    report "Search engines allowed" FAIL "blog_public is '$bp': 'Discourage search engines' is ticked"
  fi
elif tr '\n' ' ' < "$HOME_HTML" 2>/dev/null | grep -oiE '<meta[^>]+name=["'"'"']robots["'"'"'][^>]*>' | grep -qi noindex; then
  report "Search engines allowed" FAIL "the homepage says noindex"
elif fetch -L "$SITE_URL/robots.txt" | tr -d '\r' | grep -qiE '^Disallow:[[:space:]]*/[[:space:]]*$'; then
  report "Search engines allowed" FAIL "robots.txt disallows the whole site"
else
  report "Search engines allowed" PASS "no noindex and no blanket disallow"
fi

# Analytics tag
tag=$(grep -oiE 'googletagmanager|gtag\(|G-[A-Z0-9]{6,}|google-analytics|google-site-kit|plausible|matomo|fathom' "$HOME_HTML" 2>/dev/null | sort -u | head -3 | tr '\n' ' ')
if [ -n "$tag" ]; then
  report "Analytics tag" PASS "found: $tag"
else
  report "Analytics tag" FAIL "no analytics tag on the homepage"
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
          report "Alias $a" PASS "$code to $loc"
        else
          report "Alias $a" FAIL "$code, but to '$target', not '$HOST'"
        fi ;;
      302|307) report "Alias $a" FAIL "temporary $code redirect; make it 301" ;;
      *)       report "Alias $a" FAIL "returned $code, no permanent redirect to $HOST" ;;
    esac
  done
else
  report "Domain aliases" SKIP "no --alias given"
fi

# ===========================================================================
# SUMMARY
# ===========================================================================
header "SUMMARY"
printf '  %-10s PASS %d   FAIL %d   SKIP %d\n' SETUP "$N_PASS" "$N_FAIL" "$N_SKIP"
printf '\n  These checks are a subset. The rest of the checklist needs a person.\n'

[ "$N_FAIL" -gt 0 ] && exit 2
exit 0
