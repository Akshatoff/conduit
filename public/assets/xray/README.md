# Hospital X-ray images

Drop exactly three image files in this folder:

| File | Shown as |
|---|---|
| `first.jpg` | image 1 of 3 |
| `second.jpg` | image 2 of 3 |
| `third.jpg` | image 3 of 3 |

They are served at `/assets/xray/<name>` by:

* **Vite dev server** — `public/` is served at the site root.
* **Built app** — `npm run build` copies this folder into `dist/assets/xray/`.
* **Python backend** — `/assets` is mounted straight from this folder, so images added while the backend
  runs appear on reload without rebuilding.

Swipe an open palm horizontally in the hospital **Signature screen** (or use the prev/next buttons) to move
between them. Files are loaded from your own machine only — nothing is fetched from a medical system.

Only use images you are allowed to handle (ideally anonymised). The viewer is a demonstration of gesture
navigation and is **not** diagnostic.

If a file is missing, the viewer shows a placeholder telling you which file to add.
