#!/usr/bin/env bash
#
# Cam Depot for CloudTAK - installer
#
# Usage, from a clone of https://github.com/dfndr13/cloudtak-plugin-cam-depot:
#     bash install.sh <path-to-your-CloudTAK-checkout>
#
# What it does (each step is skipped if already done, so it is safe to re-run):
#   1. copies plugin/ (and this README) to app/plugins/cam-depot
#   2. copies the server route to api/stateless/routes/plugin-cam-depot.ts
#   3. applies the video pane change that lets pictures open in CloudTAK's
#      video pane (patches/floating-video-stills.patch)
#   4. adds the .dockerignore / app/.gitignore exceptions for the plugin folder
#   5. adds the plugin's routes to api/test/fixtures/get_schema.json (needs python3)
#
# It changes files only. Rebuild CloudTAK afterwards:
#     docker compose up -d --build api
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CT="${1:-}"

if [ -z "$CT" ]; then
    echo "Usage: bash $0 <path-to-your-CloudTAK-checkout>" >&2
    exit 1
fi
CT="$(cd "$CT" && pwd)"

if [ ! -f "$CT/app/plugin.ts" ] || [ ! -d "$CT/api/stateless/routes" ]; then
    echo "ERROR: $CT does not look like a CloudTAK checkout (no app/plugin.ts)." >&2
    exit 1
fi

say() { printf '  %-28s %s\n' "$1" "$2"; }
echo "Installing Cam Depot for CloudTAK into $CT"

# 1. Plugin folder (browser part only - the server route must not sit under
#    app/plugins, where CloudTAK's web-app type check would pick it up)
DEST="$CT/app/plugins/cam-depot"
mkdir -p "$DEST"
cp -r "$HERE"/plugin/. "$DEST"/
cp "$HERE/README.md" "$DEST/README.md"
say "plugin folder" "copied" 

# 2. Server route
ROUTE="$CT/api/stateless/routes/plugin-cam-depot.ts"
if [ -f "$ROUTE" ] && cmp -s "$HERE/server/plugin-cam-depot.ts" "$ROUTE"; then
    say "server route" "already up to date"
else
    cp "$HERE/server/plugin-cam-depot.ts" "$ROUTE"
    say "server route" "copied"
fi

# 3. Video pane change for pictures
VIDEO="$CT/app/src/components/CloudTAK/util/FloatingVideo.vue"
if grep -q "isImageLink" "$VIDEO"; then
    say "video pane (pictures)" "already supports pictures"
elif (cd "$CT" && git apply --check "$HERE/patches/floating-video-stills.patch" 2>/dev/null); then
    (cd "$CT" && git apply "$HERE/patches/floating-video-stills.patch")
    say "video pane (pictures)" "patched"
else
    say "video pane (pictures)" "NOT PATCHED"
    echo "    The patch does not apply to this CloudTAK version. Live video will" >&2
    echo "    work, but picture-only cameras won't open. Apply" >&2
    echo "    patches/floating-video-stills.patch by hand." >&2
fi

# 4. Ignore-file exceptions (CloudTAK leaves app/plugins/* out of the image)
if [ -f "$CT/.dockerignore" ] && grep -q '^app/plugins/\*' "$CT/.dockerignore"; then
    if grep -qx '!app/plugins/cam-depot' "$CT/.dockerignore"; then
        say ".dockerignore" "already allows the plugin"
    else
        printf '!app/plugins/cam-depot\n' >> "$CT/.dockerignore"
        say ".dockerignore" "plugin allowed"
    fi
else
    say ".dockerignore" "no change needed"
fi

if [ -f "$CT/app/.gitignore" ] && grep -q '^plugins/\*' "$CT/app/.gitignore"; then
    if grep -qx '!plugins/cam-depot/' "$CT/app/.gitignore"; then
        say "app/.gitignore" "already tracks the plugin"
    else
        printf '!plugins/cam-depot/\n' >> "$CT/app/.gitignore"
        say "app/.gitignore" "plugin tracked"
    fi
else
    say "app/.gitignore" "no change needed"
fi

# 5. API route list used by CloudTAK's tests
FIXTURE="$CT/api/test/fixtures/get_schema.json"
if [ -f "$FIXTURE" ] && command -v python3 >/dev/null 2>&1; then
    python3 - "$FIXTURE" <<'PY'
import json, sys
path = sys.argv[1]
raw = open(path).read()
data = json.loads(raw)
routes = {
    "GET /cam-depot/states": {"body": False, "query": False, "res": True},
    "GET /cam-depot/cameras": {"body": False, "query": True, "res": True},
    "POST /cam-depot/sync": {"body": False, "query": False, "res": True},
    "GET /cam-depot/status": {"body": False, "query": True, "res": True},
    "GET /cam-depot/still/:camera.jpg": {"body": False, "query": False, "res": False},
}
# Routes of earlier versions of this plugin
retired = [k for k in ("GET /cam-depot/hls/:camera/:type.m3u8",) if k in data]
for k in retired:
    del data[k]
added = [k for k in routes if k not in data]
for k in added:
    data[k] = routes[k]
if added or retired:
    out = json.dumps(data, indent=4)
    if raw.endswith("\n"):
        out += "\n"
    open(path, "w").write(out)
print("  %-28s %s" % ("test route list", "routes updated" if (added or retired) else "already listed"))
PY
else
    say "test route list" "skipped (no python3 or no fixture)"
fi

echo
echo "Done. Rebuild CloudTAK to load it:"
echo "    cd $CT && docker compose up -d --build api"
