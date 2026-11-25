# mistletoe photobooth

8 poses · 1 song · 2 strips. A browser photo booth that snaps a photo every few beats of "Last Christmas", then prints two white photo strips.

No build step, no framework: `index.html`, `style.css`, `app.js`, `config.js`, and `assets/`.

## Run it on your laptop

The camera and the YouTube player need a real web address (not a double-clicked file), so start a tiny local server inside this folder:

```bash
npx serve .          # or: python3 -m http.server 8000
```

Then open the address it prints (e.g. http://localhost:3000) in Chrome.

VS Code users: the "Live Server" extension works too.

## Put it online (free, ~1 minute)

- **Netlify Drop:** go to app.netlify.com/drop and drag this whole folder in. You get an https link right away.
- **Vercel:** `npx vercel` inside the folder.

https is required, otherwise phones won't allow the camera.

## Settings — `config.js`

| Setting | What it does |
|---|---|
| `music.youtubeId` | YouTube video to play (default: Wham! – Last Christmas, official video) |
| `music.startAt` | Second in the video where the session starts |
| `interval` | Seconds between shots (default 3) |
| `shotTimes` | Exact shot times, to sync with the lyrics (see below) |
| `prompts` | Text under the camera for each pose |
| `mirrorPhotos` | Save photos mirrored like the preview, or not |
| `stripFooter` | Small text at the bottom of each strip (`""` for none) |

### Syncing shots to the song

1. Open the site with `?mark` at the end, e.g. `http://localhost:3000/?mark`
2. Press **start marking**, then hit **space** on every half-line of the song (8 times).
3. Copy the `shotTimes: [...]` line it shows into `config.js`.

## Assets

- `assets/frame.png` — your white ornate frame, with the baked-in checkerboard removed (cleaned automatically; swap in a real transparent PNG for sharper edges).
- `assets/lights.png`, `assets/tree.png` — cut from your wallpaper. They repeat along the top and bottom edges, so the lights and whole trees always show on any screen size.

## Notes

- Photos never leave the browser.
- Music is a YouTube embed and must stay visible (YouTube requires the player to be at least 200×200 px), so it shows as a small card during the session.
- If music can't autoplay (some phones), the session still runs on the timer and asks you to tap the player.

## Private edit panel

Open the site with `?edit` at the end of the address (e.g. `.../mistletoe-photobooth/?edit`). Visitors never see it.
Paste your 8 lines, tap along to set the timing, then press **copy for config.js** and paste the result over the `lyrics` and `shotTimes` lines in `config.js` so everyone sees them.
