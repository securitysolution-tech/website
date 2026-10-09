#!/usr/bin/env bash
# Outside-in check of the live site's security posture: response headers,
# redirects, TLS, DNSSEC, email authentication, the contact endpoint, the
# records printed on the home page, the outbound links and the published
# policies.
# Runs daily from .github/workflows/posture.yml, which opens an issue when
# anything regresses. Needs bash, curl, jq, openssl and GNU date.
#
#   bash scripts/posture.sh
#   DOMAIN=example.com bash scripts/posture.sh
#
# Prints one line per check and exits 1 if any check failed. SKIP means a
# third-party API could not be reached, not that the check passed.

set -uo pipefail

DOMAIN=${DOMAIN:-securitysolution.tech}
SITE="https://$DOMAIN"
# Certificates and security.txt fail this many days before they expire.
MIN_DAYS=${MIN_DAYS:-21}
DKIM_SELECTOR=${DKIM_SELECTOR:-cf2024-1}
# A GitHub Pages address. The origin certificate is checked directly because
# Cloudflare (Full strict) starts failing as soon as it expires.
ORIGIN_IP=${ORIGIN_IP:-185.199.108.153}

CURL=(curl -sS --max-time 20 --retry 3 --retry-all-errors --retry-delay 5)
NOW=$(date +%s)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
failures=0

report() { # status, message
  printf '%-4s  %s\n' "$1" "$2"
  if [ "$1" = FAIL ]; then failures=$((failures + 1)); fi
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf -- '- **%s** %s\n' "$1" "$2" >>"$GITHUB_STEP_SUMMARY"
  fi
}
verdict() { # name, detail, condition...
  local name=$1 detail=$2
  shift 2
  if "$@"; then report PASS "$name"; else report FAIL "$name: $detail"; fi
}
days_until() { date -d "$1" +%s 2>/dev/null | awk -v now="$NOW" '{ print int(($1 - now) / 86400) }'; }

# DNS over HTTPS, so the AD (DNSSEC validated) flag comes back with answers.
doh() { "${CURL[@]}" -H 'accept: application/dns-json' "https://cloudflare-dns.com/dns-query?name=$1&type=$2"; }
records() { # name, type, numeric type
  doh "$1" "$2" | jq -r --argjson t "$3" '.Answer[]? | select(.type == $t) | .data'
}
txt() { # TXT strings joined, quotes removed
  records "$1" TXT 16 | sed -e 's/" "//g' -e 's/^"//' -e 's/"$//'
}

# TLS certificate presented for $2 when connecting to $1. Prints days left,
# or nothing when the chain or hostname does not verify.
cert_days() {
  local end
  end=$(openssl s_client -connect "$1:443" -servername "$2" -verify_hostname "$2" -verify_return_error </dev/null 2>/dev/null |
    openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -n "$end" ]; then days_until "$end"; fi
}
check_cert() { # label, connect host, server name
  local days
  days=$(cert_days "$2" "$3")
  if [ -z "$days" ]; then
    report FAIL "$1 certificate: invalid or unreachable"
  elif [ "$days" -lt "$MIN_DAYS" ]; then
    report FAIL "$1 certificate: expires in $days days"
  else
    report PASS "$1 certificate: valid, $days days left"
  fi
}

# --- Response headers -------------------------------------------------------

headers=$("${CURL[@]}" -o /dev/null -D - "$SITE/" | tr -d '\r')
header() { # first value of a response header, name matched case-insensitively
  awk -v want="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" '{
    name = tolower(substr($0, 1, index($0, ":") - 1))
    if (name == want) { sub(/^[^:]*:[ \t]*/, ""); print; exit }
  }' <<<"$headers"
}
has_header() { # header, required parts...
  local value part
  value=$(header "$1")
  shift
  [ -n "$value" ] || return 1
  for part in "$@"; do [[ $value == *"$part"* ]] || return 1; done
}

status=$(head -1 <<<"$headers" | awk '{ print $2 }')
verdict "homepage responds over HTTPS" "status ${status:-none}" [ "$status" = 200 ]

hsts=$(header strict-transport-security)
max_age=$(sed -n 's/.*max-age=\([0-9]*\).*/\1/p' <<<"$hsts")
verdict "HSTS: one year, subdomains, preload" "got '${hsts:-absent}'" \
  [ "${max_age:-0}" -ge 31536000 -a -n "$(grep includeSubDomains <<<"$hsts" | grep preload)" ]

csp=$(header content-security-policy)
verdict "CSP: locked down, Trusted Types enforced" "got '${csp:-absent}'" \
  has_header content-security-policy "default-src 'none'" "script-src 'self'" "style-src 'self'" \
  "base-uri 'none'" "form-action 'self'" "frame-ancestors 'none'" "require-trusted-types-for 'script'"
verdict "CSP: no unsafe-inline or unsafe-eval" "got '$csp'" [ -n "$csp" -a -z "$(grep -o 'unsafe-' <<<"$csp")" ]

verdict "X-Content-Type-Options: nosniff" "got '$(header x-content-type-options)'" has_header x-content-type-options nosniff
verdict "X-Frame-Options: DENY" "got '$(header x-frame-options)'" has_header x-frame-options DENY
verdict "Referrer-Policy: strict-origin-when-cross-origin" "got '$(header referrer-policy)'" \
  has_header referrer-policy strict-origin-when-cross-origin
verdict "Permissions-Policy: camera, microphone, geolocation off" "got '$(header permissions-policy)'" \
  has_header permissions-policy 'camera=()' 'microphone=()' 'geolocation=()'
verdict "Cross-Origin-Opener-Policy: same-origin" "got '$(header cross-origin-opener-policy)'" \
  has_header cross-origin-opener-policy same-origin
verdict "Cross-Origin-Resource-Policy: same-origin" "got '$(header cross-origin-resource-policy)'" \
  has_header cross-origin-resource-policy same-origin

leaked=""
for name in access-control-allow-origin via x-github-request-id x-fastly-request-id x-served-by \
  x-cache x-cache-hits x-timer x-proxy-cache x-powered-by; do
  if [ -n "$(header "$name")" ]; then leaked="$leaked $name"; fi
done
verdict "no origin or CDN headers leak" "found:$leaked" [ -z "$leaked" ]

# Cloudflare features such as Web Analytics, email obfuscation or Rocket
# Loader inject scripts that the CSP blocks. Only our own bundles may load.
html=$("${CURL[@]}" "$SITE/")
foreign=$(grep -o '<script[^>]*src="[^"]*"' <<<"$html" | sed 's/.*src="//; s/"$//' | grep -v '^/_astro/')
injected=$(grep -o 'cdn-cgi/[a-z-]*' <<<"$html" | sort -u | tr '\n' ' ')
verdict "no injected or third-party scripts" "found: $foreign $injected" [ -z "$foreign" -a -z "$injected" ]

# --- Redirects --------------------------------------------------------------

redirect() { "${CURL[@]}" -o /dev/null -w '%{http_code} %{redirect_url}' "$1"; }
got=$(redirect "http://$DOMAIN/")
verdict "http redirects to https" "got '$got'" [ "$got" = "301 $SITE/" ]
got=$(redirect "https://www.$DOMAIN/")
verdict "www redirects to the apex" "got '$got'" [ "$got" = "301 $SITE/" ]

# --- TLS --------------------------------------------------------------------

check_cert "edge" "$DOMAIN" "$DOMAIN"
check_cert "origin (GitHub Pages)" "$ORIGIN_IP" "$DOMAIN"
check_cert "mta-sts host" "mta-sts.$DOMAIN" "mta-sts.$DOMAIN"

if out=$(openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" -tls1_1 -cipher 'DEFAULT@SECLEVEL=0' </dev/null 2>&1); then
  report FAIL "TLS 1.1 refused: the handshake succeeded"
elif grep -qi 'alert protocol version' <<<"$out"; then
  report PASS "TLS 1.1 refused"
else
  report SKIP "TLS 1.1 refused: this OpenSSL cannot offer TLS 1.1"
fi

# --- DNS --------------------------------------------------------------------

ad=$(doh "$DOMAIN" A | jq -r '.AD')
ds=$(records "$DOMAIN" DS 43)
verdict "DNSSEC: signed and validating" "AD=$ad, DS='${ds:-none}'" [ "$ad" = true -a -n "$ds" ]

caa=$(records "$DOMAIN" CAA 257)
verdict "CAA: restricts issuers, allows Let's Encrypt for the origin" "got '$(tr '\n' ' ' <<<"$caa")'" \
  [ -n "$(grep 'issue "letsencrypt.org"' <<<"$caa")" -a -n "$(grep iodef <<<"$caa")" ]

# --- Email ------------------------------------------------------------------

spf=$(txt "$DOMAIN" | grep -i '^v=spf1')
verdict "SPF: one record ending in ~all or -all" "got '$spf'" \
  [ "$(grep -c . <<<"$spf")" = 1 -a -n "$(grep -E ' [~-]all$' <<<"$spf")" ]

dmarc=$(txt "_dmarc.$DOMAIN")
verdict "DMARC: p=reject" "got '${dmarc:-absent}'" [ -n "$(grep -E '^v=DMARC1;.*\bp=reject' <<<"$dmarc")" ]

dkim=$(txt "$DKIM_SELECTOR._domainkey.$DOMAIN")
verdict "DKIM: $DKIM_SELECTOR key published" "got '${dkim:0:40}'" [ -n "$(grep -E 'p=[A-Za-z0-9+/]' <<<"$dkim")" ]

sts=$(txt "_mta-sts.$DOMAIN")
verdict "MTA-STS: record published" "got '${sts:-absent}'" [ -n "$(grep -E '^v=STSv1; *id=[A-Za-z0-9]+' <<<"$sts")" ]

tlsrpt=$(txt "_smtp._tls.$DOMAIN")
verdict "TLS-RPT: reporting address published" "got '${tlsrpt:-absent}'" \
  [ -n "$(grep -E '^v=TLSRPTv1; *rua=' <<<"$tlsrpt")" ]

: >"$TMP/policy"
got=$("${CURL[@]}" -o "$TMP/policy" -w '%{http_code} %{content_type}' "https://mta-sts.$DOMAIN/.well-known/mta-sts.txt" 2>/dev/null)
tr -d '\r' <"$TMP/policy" >"$TMP/policy.txt"
mode=$(sed -n 's/^mode: *//p' "$TMP/policy.txt")
verdict "MTA-STS: policy served as text/plain" "got '$got', mode '${mode:-none}'" \
  [ "${got%% *}" = 200 -a -n "$(grep -i 'text/plain' <<<"$got")" -a -n "$(grep -x 'version: STSv1' "$TMP/policy.txt")" -a -n "$mode" ]

# Every MX host must match the policy, or senders that enforce it drop mail.
# A leading "*." matches exactly one label (RFC 8461, section 4.1).
sed -n 's/^mx: *//p' "$TMP/policy.txt" >"$TMP/patterns"
unmatched=""
while IFS= read -r host; do
  matched=""
  while IFS= read -r pattern; do
    case $pattern in
      '*.'*) [ "${host#*.}" = "${pattern:2}" ] && matched=yes ;;
      *) [ "$host" = "$pattern" ] && matched=yes ;;
    esac
  done <"$TMP/patterns"
  [ -n "$matched" ] || unmatched="$unmatched $host"
done < <(records "$DOMAIN" MX 15 | awk '{ sub(/\.$/, "", $2); print $2 }')
verdict "MTA-STS: policy covers every MX host" "not covered:${unmatched:- (no policy)}" \
  [ -z "$unmatched" -a -s "$TMP/patterns" ]

# --- Contact endpoint -------------------------------------------------------
# A Worker on this one route (workers/contact). Until it is deployed, the path
# is the GitHub Pages 404 page and the checks are skipped.

got=$("${CURL[@]}" -o /dev/null -D "$TMP/contact.h" -w '%{http_code}' "$SITE/api/contact")
if [ "$got" = 404 ] && ! grep -qi '^content-type: *application/json' "$TMP/contact.h"; then
  report SKIP "contact endpoint: not deployed"
else
  verdict "contact endpoint: GET refused" "status $got" [ "$got" = 405 ]
  cc=$(tr -d '\r' <"$TMP/contact.h" | awk 'tolower($1) == "cache-control:" { print tolower($0) }')
  verdict "contact endpoint: responses not cached" "got '${cc:-absent}'" [ -n "$(grep no-store <<<"$cc")" ]
  got=$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' \
    -H 'origin: https://evil.example' --data '{}' "$SITE/api/contact")
  verdict "contact endpoint: cross-origin POST refused" "status $got" [ "$got" = 403 ]
  got=$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' \
    -H "origin: $SITE" --data '{}' "$SITE/api/contact")
  verdict "contact endpoint: empty request rejected" "status $got" [ "$got" = 400 ]
fi

# --- Visit counter ----------------------------------------------------------
# A Worker on /api/hit and /api/visits (workers/visits). Until it is deployed, the
# paths are the GitHub Pages 404 page and the checks are skipped. Every request here
# is refused before anything is counted, so the check never adds a visit.

got=$("${CURL[@]}" -o /dev/null -D "$TMP/hit.h" -w '%{http_code}' "$SITE/api/hit")
if [ "$got" = 404 ] && ! grep -qi '^content-type: *application/json' "$TMP/hit.h"; then
  report SKIP "visit counter: not deployed"
else
  verdict "visit counter: GET refused" "status $got" [ "$got" = 405 ]
  got=$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' \
    -H 'origin: https://evil.example' --data '{}' "$SITE/api/hit")
  verdict "visit counter: cross-origin POST refused" "status $got" [ "$got" = 403 ]
  got=$("${CURL[@]}" -o /dev/null -D "$TMP/visits.h" -w '%{http_code}' "$SITE/api/visits")
  verdict "visit counter: dashboard asks for a password" "status $got" [ "$got" = 401 ]
  scheme=$(tr -d '\r' <"$TMP/visits.h" | awk 'tolower($1) == "www-authenticate:" { print tolower($2) }')
  verdict "visit counter: dashboard offers Basic sign-in only" "got '${scheme:-absent}'" [ "$scheme" = basic ]
  cc=$(tr -d '\r' <"$TMP/visits.h" | awk 'tolower($1) == "cache-control:" { print tolower($0) }')
  verdict "visit counter: dashboard not cached" "got '${cc:-absent}'" [ -n "$(grep no-store <<<"$cc")" ]
fi

# --- The home page against live DNS ----------------------------------------
# The hero prints six real records. When one is changed in DNS and not in the
# page, the page quietly lies; this catches it. Values are compared as
# prefixes, since the page shortens long ones.

home=$("${CURL[@]}" "$SITE/")
printed=$(grep -o 'data-r="[^"]*"' <<<"$home" | sed -e 's/^data-r="//' -e 's/"$//' -e 's/&quot;/"/g')
drift=""
count=0
while IFS= read -r line; do
  [ -n "$line" ] || continue
  count=$((count + 1))
  name=$(awk '{ print $1 }' <<<"$line")
  type=$(awk '{ print $2 }' <<<"$line")
  value=$(sed -E 's/^[^ ]+ +[^ ]+ +//' <<<"$line")
  case $type in
    TXT) live=$(txt "${name%.}") ; value=$(sed -e 's/^"//' -e 's/"$//' <<<"$value") ;;
    MX) live=$(records "${name%.}" MX 15) ;;
    DS) live=$(records "${name%.}" DS 43) ;;
    CAA) live=$(records "${name%.}" CAA 257) ;;
    *) live="" ;;
  esac
  # Resolvers print DS digests in lower case; the page prints them as published.
  if [ -z "$(grep -iF "$value" <<<"$live")" ]; then drift="$drift [$type $name]"; fi
done <<<"$printed"
verdict "home page: the printed records match live DNS ($count checked)" "drifted:$drift" [ "$count" -ge 4 -a -z "$drift" ]

# --- External links ---------------------------------------------------------
# Every outbound link on the public pages must still answer. LinkedIn answers
# 999 to anything that is not a browser, which counts as reachable.

broken=""
for path in / /services/offensive-testing/ /services/defensive-operations/ /services/governance-compliance/ /services/ai-cloud-security/ /privacy/ /security/; do
  page=$("${CURL[@]}" "$SITE$path")
  for url in $(grep -o 'href="https\?://[^"]*"' <<<"$page" | sed -e 's/^href="//' -e 's/"$//' -e 's/&amp;/\&/g' | grep -v "^$SITE" | sort -u); do
    code=$(curl -sS -o /dev/null --max-time 20 -L -A 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130' -w '%{http_code}' "$url" || echo 000)
    case $code in
      2* | 3* | 999) ;;
      *) broken="$broken $url($code)" ;;
    esac
  done
done
verdict "external links answer" "broken:$broken" [ -z "$broken" ]

# --- Published policies -----------------------------------------------------

got=$("${CURL[@]}" -o "$TMP/security.txt" -w '%{http_code}' "$SITE/.well-known/security.txt")
expires=$(tr -d '\r' <"$TMP/security.txt" | sed -n 's/^Expires: *//p')
left=$(days_until "$expires")
verdict "security.txt: contact listed and not expiring" "status $got, Expires '${expires:-none}'" \
  [ "$got" = 200 -a -n "$(grep -i '^Contact: ' "$TMP/security.txt")" -a "${left:-0}" -ge 30 ]

preload=$("${CURL[@]}" "https://hstspreload.org/api/v2/status?domain=$DOMAIN" 2>/dev/null | jq -r '.status // empty' 2>/dev/null)
case $preload in
  preloaded | pending) report PASS "HSTS preload list: $preload" ;;
  "") report SKIP "HSTS preload list: hstspreload.org unavailable" ;;
  *) report FAIL "HSTS preload list: status '$preload'" ;;
esac

observatory=$("${CURL[@]}" -X POST "https://observatory-api.mdn.mozilla.net/api/v2/scan?host=$DOMAIN" 2>/dev/null)
grade=$(jq -r '.grade // empty' <<<"$observatory" 2>/dev/null)
score=$(jq -r '.score // empty' <<<"$observatory" 2>/dev/null)
case $grade in
  A+) report PASS "Mozilla Observatory: A+ ($score)" ;;
  "") report SKIP "Mozilla Observatory: API unavailable" ;;
  *) report FAIL "Mozilla Observatory: $grade ($score)" ;;
esac

echo
if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed."
  exit 1
fi
echo "All checks passed."
