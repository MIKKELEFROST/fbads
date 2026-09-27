# Website promo — 15 s motion graphic

A 15-second motion-graphics ad for a company that builds websites for service businesses
(plumbers, electricians, painters, cleaners …). The brand on the end card, **sitecrew**, is a
placeholder. You can swap in a real name, colours and copy in one file and re-render.

| File | What |
| --- | --- |
| `out/website-promo-15s-1920x1080.mp4` | 16:9 master · H.264 High · 60 fps · AAC 48 kHz · 15.0 s |
| `out/website-promo-15s-1080x1920.mp4` | 9:16 cut for Reels / Stories / TikTok |
| `out/poster-1920x1080.png`, `out/poster-1080x1920.png` | End-card stills for thumbnails |
| `out/soundtrack.wav` | The music + sound design on its own (−14 LUFS) |

## Storyboard

Everything sits on a 128 BPM grid (1 beat = 0.469 s), so each cut and sound effect lands on the music.

| Time | Scene | On screen |
| --- | --- | --- |
| 0.0 – 1.9 s | Hook | "Websites for" + PLUMBERS. / ELECTRICIANS. / PAINTERS. / CLEANERS. One trade per beat, with colour wipes. The camera zooms through the last full stop. |
| 1.9 – 3.8 s | Problem | "You do 5-star work." Then four stars drop off: "Your website? Not so much." |
| 3.8 – 7.5 s | Solution | A hazard-stripe wipe and "UPGRADE IN PROGRESS" tape lead to a blueprint grid where "We build it." A plumber's site builds itself from wireframes. Callouts appear (Google-ready, Lightning fast, Online booking, Mobile-first) and a cursor clicks *Book online*. |
| 7.5 – 11.3 s | Payoff | The browser shrinks into a phone. "You get the calls." The phone rings, then bookings, quote requests and a 5-star review stack up. |
| 11.3 – 15.0 s | End card | Logo reveal, "Websites that win you jobs.", *Get your free demo* button, and a ticker of trades. |

## Rebrand or translate

Everything you would want to change is in [`src/config.js`](src/config.js): brand name, tagline, CTA,
optional URL, colours, every line of copy, the notification texts and the example client website.
`*word*` marks the accent colour. `\n` forces a line break. `|` breaks only in the 9:16 cut.
Keep lines about as long as the current ones, because the timing is locked to the beat.

## Preview and render

Requirements: Node 18+, Python 3 with `numpy` + `scipy` (for the soundtrack only), and an
`ffmpeg` build with libx264 on `PATH` (or set `FFMPEG=/path/to/ffmpeg`).

```bash
npm install                      # Playwright; run `npx playwright install chromium` if you have no browser
npm run preview                  # live, scrubbable preview in the browser (space = play/pause)
npm run audio                    # out/soundtrack.wav
npm run render                   # out/website-promo-15s-1920x1080.mp4
npm run render:portrait          # out/website-promo-15s-1080x1920.mp4
npm run posters                  # end-card thumbnails (out/poster-*.png)
npm run stills                   # PNG stills to out/stills/ for quick checks
```

`tools/render.mjs` steps the page frame by frame in headless Chromium (`window.__seek(t)`). Each
frame is the average of 4 sub-frames for motion blur. During the fastest moves (wipes, the zoom,
the tape slams, the bars) it uses 16, and those time ranges are listed in `__meta.blur` in
`src/main.js`. It then encodes with ffmpeg. A full render takes a few minutes per format.
`--samples=1` turns motion blur off for quick drafts. `--fps=30` gives a 30 fps export.

## How it's built

- `src/main.js`: the whole animation. Each scene is a pure function of time. There are no CSS
  animations, so every frame renders the same way each time.
- `src/anim.js`: easing, springs and keyframe helpers.
- `tools/make_audio.py`: music and sound effects synthesised in numpy/scipy and cued to the same
  beat grid: kick/snare/hats, bass, pads, plucks, star blips, tape rips, UI pops, phone buzz,
  notification dings and a final hit. There are no samples, so no music licensing is needed.

Credits: fonts Archivo, Inter and JetBrains Mono (SIL OFL 1.1, see `src/fonts/LICENSE.txt`);
icons from [Lucide](https://lucide.dev) (ISC).
