# Clip Shuffle Web Editor

Standalone browser/PWA version of Clip Shuffle.

This version lets you select local clips, review and tag them, build an editable timeline, drag clips to reorder, drag trim handles, position a title on screen, add a default fade to black, and render a downloadable video in the browser.

## Upload

Upload the contents of this `webversion/` folder to GitHub Pages or another static web host.

For installable PWA behavior, serve it over HTTPS. GitHub Pages is fine.

## Use

1. Open the hosted page on iPad, Mac, or Windows.
2. Select clips with `Files`. Use `Folder` where the browser supports folder selection.
3. Review clips, assign categories, and use hotkeys if a keyboard is available:
   - `R` Rockoffs
   - `T` Tries
   - `G` Gameplay
   - `H` Handshakes
   - `O` Other
   - `S` Skipped
4. Click `Generate Video`.
5. Reorder clips, drag trim handles, move the title, and set fade options.
6. Click `Render Video`.

## Notes

- Clips stay local to the device. The app does not upload media.
- Rendering is real-time browser recording, so a 2 minute timeline takes about 2 minutes to render.
- The downloaded format depends on browser support. Some browsers export MP4; others export WebM.
- If a browser does not support `MediaRecorder` or canvas capture, the app can review/edit clips but cannot render the final video on that browser.
