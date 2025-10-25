# Pokemon Run&Bun — Interactive World Map

A static website to browse the Pokemon world map and jump into interiors. No server, no build step, no Python required.

Use it in two ways:

- I only want to use the website: open `index.html` and explore.
- I want to tweak things: download from GitHub, edit images/layout, and host your own copy (GitHub Pages or any static host).


## What’s in this repo

- `index.html` — the site entrypoint
- `styles.css` — layout and UI
- `app.js` — interactive logic (world view, markers, editing, save)
- `data/maps.json` — list of all maps with their image paths and sizes
- `data/maps.js` — same as maps.json but pre-bundled as JS for file:// usage
- `data/world-atlas.json` — optional stitched “world view” layout (map positions)
- `data/world-atlas.js` — same as world-atlas.json but pre-bundled as JS
- `exports/` — PNGs for all maps (used for single/interior map view)
- `exports/atlas/` — PNGs used by the stitched world view

Notes

- The viewer prefers JSON files (maps.json/world-atlas.json). When you open via file://, some browsers block fetch; in that case the JS fallbacks (maps.js/world-atlas.js) are used.
- The folder `exports/All maps (borderless, for stitching together)/` is not used by the website. It’s only for offline stitching workflows; you can ignore it for the site.


## Use the website locally (no cloning needed)

Option A — Double-click index.html

- Download the project as a ZIP from GitHub and extract it, or use your local copy.
- Double-click `index.html` to open in your browser.
- If your browser blocks data loading on file://, try Option B.

Option B — Serve locally (any static server)

- Use your favorite static server and open the folder root. Examples:
  - VS Code “Live Server” extension
  - Node: `npx serve` (or any static host)
  - Python (only as a generic local server): `python -m http.server` (no project Python needed)


## Download from GitHub to edit

Option 1 — Download ZIP

1) Go to your GitHub repo page.
2) Click “Code” → “Download ZIP”.
3) Extract the ZIP somewhere on your machine.

Option 2 — Clone (Git)

```powershell
git clone https://github.com/<your-username>/<your-repo>.git
```


## How to use the website

- Pan/zoom: click-drag to move, scroll to zoom.
- World view: shows many outdoor maps arranged in a stitched layout (if `data/world-atlas.json` exists). Otherwise it falls back to a grid of world maps.
- Labels and lines: use the sidebar toggles “Show labels” and “Show connections”.
- Drill into a city/route: click a label to open that map.
- Interiors: use the “Interior Maps” list to open individual interiors, or select “📍 Place” to drop entrance markers onto a world map.
- Edit mode: toggle “Edit layout” to reposition world maps in the stitched view (drag and snap). Click “💾 Save layout” to download your updated JSON.


## Customize: swap to textless images

You can replace the images the site uses with your own (e.g., versions without text/labels). You have two safe options:

Option A — Keep filenames, replace files

- For the stitched world view: replace PNGs in `exports/atlas/` with your textless versions but keep the exact filenames (e.g. `#020 Route 104.png`).
- For individual map pages (and the interior list): replace PNGs in `exports/` with textless versions, again keeping filenames.

Option B — Point JSON to your files

- Edit `data/world-atlas.json` (stitched view) and/or `data/maps.json` (all maps) and change each `image` path to your preferred file.
- If you open the site via file://, also update the JS fallbacks (`data/world-atlas.js` / `data/maps.js`) or use a local static server so the JSON loads.

Tips

- Filenames start with a `#` (e.g. `#020 Route 104.png`). The app handles these safely.
- If a map isn’t listed in `world-atlas.json`, the world view shows it in a grid using the image from `data/maps.json` (the `exports/` files).


## Customize: change the stitched “world” layout

The stitched layout is just JSON. You can edit it live in the site and save it:

1) Open the site → World View.
2) Enable “Edit layout”. Drag maps; corners snap to neighbors.
3) Click “💾 Save layout”. Your browser downloads a new `world-atlas.json` and a debug PNG.
4) Replace `data/world-atlas.json` in your project with the downloaded one (commit it if you’re using Git).

Notes

- The “Include interiors in world view” toggle is just for visibility while editing; those aren’t saved into the atlas.
- The “Save layout” button may also download helper files like `viewer-classifications.json` for your reference.


## Customize: add or relocate interior markers

1) In the right sidebar, search for an interior and click “📍 Place”.

2) Click on the world map image to drop a marker.

3) Delete a marker by opening it and clicking “Remove”.

Persistence

- Manual markers are session-based. “💾 Save layout” focuses on the atlas; you can keep your own notes or screenshots for now.


## Host your own copy

GitHub Pages (recommended for GitHub users)

1) Push this folder to a GitHub repository.
2) In the repo: Settings → Pages → “Deploy from a branch”.
3) Branch: `main`. Folder: `/` (root). Save.
4) Wait for Pages to build. Your site will be available at `https://<user>.github.io/<repo>/`.

Regular web hosting

- Upload the entire folder structure to any static host (Netlify, Vercel static, S3+CloudFront, shared hosting, etc.).
- Ensure `data/` and `exports/` stay in the same relative locations to `index.html`.


## FAQ

• Do I need Python or a build tool?  
No. This is a static site. Open it directly or serve it statically.

• Which image folders are used?  
`exports/` is used for all maps; `exports/atlas/` is used by the stitched world view. The folder `exports/All maps (borderless, for stitching together)/` is not used by the site.

• My JSON edits don’t show when I double‑click index.html.  
Browsers often block fetch on file://. Either serve the folder with any static server or update the JS fallbacks (`data/*.js`) to mirror your JSON changes.


## Credits

Huge credits to hazzabee for the pictures and Dekzeh for Run & Bun. This is a fan project for exploration and fun.

