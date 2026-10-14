# App Store screenshot capture

Renders the App Store screenshots from solomindlm.com as the iOS shell shows it (`__IS_NATIVE_SHELL__`,
so no purchase UI), composites the native status-bar inset (`#F5F1E6`), then frames each screen with a
caption on a folder-pastel background (`themes.cjs`).

| Folder | Slot in App Store Connect | Size |
| --- | --- | --- |
| `../iphone-6.3` | iPhone with Dynamic Island (medium display) | 1179 × 2556 |
| `../ipad-13-landscape` | iPad 13" display | 2752 × 2064 |
| `../iphone-duo` | iPhone Duo (unfolded, landscape) | 2853 × 2007 |
| `../header-and-search` | Product page header / search results asset | 3840 × 1646, 3840 × 2560 |
| `../raw/*` | Same screens without caption frames | — |

Run from the repo root after `bun install` (the scripts use the root `playwright-core`):

1. `node archive/app-store/screenshots/capture/login.cjs`: Chromium on a persistent profile
   (`capture/profile`, never commit it); sign in.
2. `node .../refresh.cjs`: refreshes the session (shell mode reads the JWT but cannot refresh it). Run it
   before each device.
3. `SHOT_NB_CODING=… SHOT_NB_CPSC=… SHOT_NB_AZ=… SHOT_NB_AGENTS=… node .../capture2.cjs iphone|ipadl|duol [shot-name]`.
   The notebook ids point at notebooks in the capturing account; the shots also open specific threads and
   Studio items in them by title, so another account needs those titles edited in `capture2.cjs`.
4. `node .../hero.cjs`: the header and search-results assets, built from `../raw/iphone-6.3`.

`capture2.cjs` writes to `capture/out2/<device>/{raw,framed}`; copy the results into the folders above.
