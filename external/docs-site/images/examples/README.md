# Example app screenshots (Mintlify)

WebP files served at `/images/examples/<filename>` from pages under `external/docs-site/`.

| File | Source |
| --- | --- |
| `breathwork-trainer-desktop.webp` | `preview-desktop-01-1200w.webp` in breathwork-trainer |
| `breathwork-trainer-mobile.webp` | `preview-mobile-01-800w.webp` |
| `neuroflight-desktop.webp` | neuroflight `preview-desktop-01-1200w.webp` |
| `neuroflight-mobile.webp` | `preview-mobile-01-800w.webp` |
| `monkey-mind-desktop.webp` | monkey-mind `preview-desktop-01-1200w.webp` |
| `monkey-mind-mobile.webp` | `preview-mobile-01-800w.webp` |
| `neuro-chess-desktop.webp` | neuro-chess `preview-desktop-01-1200w.webp` |
| `neuro-chess-mobile.webp` | `preview-mobile-01-800w.webp` |
| `reaction-trainer-desktop.webp` | reaction-trainer `preview-desktop-01-1200w.webp` |
| `reaction-trainer-mobile.webp` | `preview-mobile-01-800w.webp` |

## Regenerating

From the workspace root, with PNG masters in `app-store-assets/<app>/`:

```bash
cd app-store-assets && npm run process-screenshots
```

This writes WebP derivatives into each app’s `docs/store-assets/` and refreshes the copies in this folder. Aspect ratios are preserved; only max-width caps and compression change.
