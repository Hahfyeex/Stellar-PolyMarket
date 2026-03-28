# PWA Icons

Place the following icon files here:

- `icon-192x192.png` — 192×192px app icon (used on Android home screen)
- `icon-512x512.png` — 512×512px app icon (used for splash screen / install prompt)

Both should use the Stella Polymarket brand mark on a `#2563eb` (blue-600) background.
Use `purpose: "any maskable"` safe zone (80% of canvas) for the logo.

You can generate them from an SVG using:
```
npx pwa-asset-generator logo.svg public/icons --manifest public/manifest.json
```
