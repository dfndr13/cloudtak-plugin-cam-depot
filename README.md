# Cam Depot for CloudTAK

Public traffic cameras on the CloudTAK map. Find a camera in the side panel or on the map, then see its latest picture or play live video in CloudTAK's video pane.

> An independent CloudTAK plugin inspired by takwerx's [Cam Depot](https://github.com/takwerx/cam-depot) for ATAK. **Not made or supported by takwerx.** It shares no code with Cam Depot. Camera data comes from the Cam Depot catalog published by TAKWERX, used with their permission ([cam-depot#9](https://github.com/takwerx/cam-depot/issues/9)). The cameras belong to the agencies shown on each camera.

## What it does

- **Side panel** (main menu → Cam Depot): pick one or more states and Canadian provinces, show or hide the cameras, search by name, "on screen only", and a picture or play button per camera with its provider.
- **Sync** (the refresh button): asks the server to check the camera catalog for changes and reloads the lists.
- **Camera markers** on the map: real CoT markers of the camera type `b-m-p-s-p-loc` with CloudTAK's built-in camera icon (same as a TAK camera feed), coloured green = live video, blue = picture only (gray = offline arrives with the catalog status feed, next step). Click one for CloudTAK's radial menu; its play button opens the camera.
- **Pictures** open in CloudTAK's video pane (from the panel or the radial play button) and refresh every 15 seconds (the most some providers allow).
- **Live video** plays through a temporary CloudTAK video lease.
- The markers are local to each browser: added like CoT received from the server, never archived, so CloudTAK never sends them to TAK Server. They carry a 15-minute stale time and are refreshed every 5 minutes.

## Where the cameras come from

CloudTAK's own server fetches every list (`server/plugin-cam-depot.ts`, installed as `api/stateless/routes/plugin-cam-depot.ts`). The browser only talks to CloudTAK, so no Content-Security-Policy changes are needed.

Every state and province comes from the Cam Depot catalog by TAKWERX (`mapdepot.takwerx.org/camdepot/catalog.json`): 42 US states and 13 Canadian provinces and territories as of November 2026.

Catalog rules (TAKWERX's terms): the catalog is read at most once a day with its ETag, or on Sync (at most once per 10 minutes per server); each state's file is downloaded only when someone picks that state and kept until the catalog changes; every host and stream address comes from the catalog; if the catalog's format isn't one this plugin knows, the catalog is skipped quietly. Credit shown in the panel and on each camera: "Camera data: Cam Depot (TAKWERX)", the camera's provider, and the provider's attribution and license where the catalog gives one.

- **Video** uses the stream link the catalog gives (some go through TAKWERX's relay, which handles expiring tokens). A stream is opened only when someone picks a camera, and CloudTAK closes it when the video pane closes. MJPEG links can't be played by CloudTAK, so those cameras show as picture only.
- **Pictures** without their own link (mostly ALERT West cameras) come from the catalog's live picture lookup through `/api/cam-depot/still/<camera>.jpg`, at most one fetch per camera per 15 seconds for the whole server. That route has no login (the video pane loads it as an image) and only answers for cameras in the catalog.

## Requirements

- **Pictures need a small CloudTAK change:** the video pane (`app/src/components/CloudTAK/util/FloatingVideo.vue`) showing image links as a refreshing picture through CloudTAK's image proxy. The installer applies it (`patches/floating-video-stills.patch`; already in the `dfndr13/CloudTAK` fork).
- CloudTAK with the image proxy (`/api/proxy/image`, upstream since October 2026). Tested on v13.121.1.
- CloudTAK's server needs outbound HTTPS to the catalog and the picture hosts, and CloudTAK's media server needs outbound HTTPS to the stream hosts.

## Install

Clone this repository, run the installer against your CloudTAK checkout, and rebuild:

```sh
git clone https://github.com/dfndr13/cloudtak-plugin-cam-depot.git
bash cloudtak-plugin-cam-depot/install.sh /path/to/CloudTAK
cd /path/to/CloudTAK && docker compose up -d --build api
```

The installer only changes files, and each step is skipped if it's already done, so it's safe to run again (for example after a CloudTAK upgrade). It:

1. copies `plugin/` to `app/plugins/cam-depot`;
2. copies the server route (`server/plugin-cam-depot.ts`) to `api/stateless/routes/`;
3. applies the video pane change for pictures (`patches/floating-video-stills.patch`). If your CloudTAK version doesn't take the patch, it says so: video still works, pictures need the change applied by hand;
4. adds `!app/plugins/cam-depot` to `.dockerignore` (standard CloudTAK leaves plugin folders out of the image) and to `app/.gitignore` where needed;
5. adds the plugin's three routes to `api/test/fixtures/get_schema.json`, so CloudTAK's API tests still pass.

Don't install or update it through the TAK Portal marketplace.

## Repository layout

| Path | Installed to |
|---|---|
| `plugin/` | `app/plugins/cam-depot/` (browser part) |
| `server/plugin-cam-depot.ts` | `api/stateless/routes/plugin-cam-depot.ts` |
| `patches/floating-video-stills.patch` | applied to `app/src/components/CloudTAK/util/FloatingVideo.vue` |
| `install.sh` | run once per CloudTAK checkout |

## License

AGPL-3.0, like CloudTAK.
