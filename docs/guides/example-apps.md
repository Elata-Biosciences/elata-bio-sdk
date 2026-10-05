# Example applications

Open source browser apps built with Elata EEG, Web Bluetooth, and rPPG packages. They live outside
this monorepo but are the best public reference for **full product-shaped** integrations (routing,
sessions, charts, game loops) after you try [`create-elata-demo`](../create-elata-demo.md).

**Screenshots** are WebP exports of real gameplay (desktop ~1200px wide below), loaded from
each app's `docs/store-assets/` folder.

## Apps

| App | What it shows | Live demo | Source |
| --- | --- | --- | --- |
| Breathwork Trainer | Guided breathing with live EEG and rPPG | [Play](https://wkyleg.github.io/breathwork-trainer/) | [wkyleg/breathwork-trainer](https://github.com/wkyleg/breathwork-trainer) |
| NeuroFlight | 3D flight sim with post-session neural analytics | [Play](https://wkyleg.github.io/neuroflight/) | [wkyleg/neuroflight](https://github.com/wkyleg/neuroflight) |
| Monkey Mind: Inner Invaders | Brain-reactive arcade and level reports | [Play](https://wkyleg.github.io/monkey-mind/) | [wkyleg/monkey-mind](https://github.com/wkyleg/monkey-mind) |
| Neuro Chess | Chess vs Stockfish with neuro HUD and analysis | [Play](https://wkyleg.github.io/neuro-chess/) | [wkyleg/neuro-chess](https://github.com/wkyleg/neuro-chess) |
| Reaction Trainer | Stress-modulated reaction game and results | [Play](https://wkyleg.github.io/reaction-trainer/) | [wkyleg/reaction-trainer](https://github.com/wkyleg/reaction-trainer) |

## Gameplay previews

Click an image to open the live app.

### Breathwork Trainer

[![Breathwork Trainer — desktop gameplay](https://raw.githubusercontent.com/wkyleg/breathwork-trainer/main/docs/store-assets/preview-desktop-01-1200w.webp)](https://wkyleg.github.io/breathwork-trainer/)

### NeuroFlight

[![NeuroFlight — desktop gameplay](https://raw.githubusercontent.com/wkyleg/neuroflight/main/docs/store-assets/preview-desktop-01-1200w.webp)](https://wkyleg.github.io/neuroflight/)

### Monkey Mind: Inner Invaders

[![Monkey Mind — desktop gameplay](https://raw.githubusercontent.com/wkyleg/monkey-mind/main/docs/store-assets/preview-desktop-01-1200w.webp)](https://wkyleg.github.io/monkey-mind/)

### Neuro Chess

[![Neuro Chess — desktop gameplay](https://raw.githubusercontent.com/wkyleg/neuro-chess/main/docs/store-assets/preview-desktop-01-1200w.webp)](https://wkyleg.github.io/neuro-chess/)

### Reaction Trainer

[![Reaction Trainer — desktop gameplay](https://raw.githubusercontent.com/wkyleg/reaction-trainer/main/docs/store-assets/preview-desktop-01-1200w.webp)](https://wkyleg.github.io/reaction-trainer/)

## Packages

These apps use published packages from `@elata-biosciences`:

- `@elata-biosciences/eeg-web`
- `@elata-biosciences/eeg-web-ble`
- `@elata-biosciences/rppg-web`

See [choose-the-right-package.md](choose-the-right-package.md). The Mintlify developer site publishes the SDK version of this content from `elata-docs/sdk/guides/example-apps.mdx` on docs.elata.bio.

## Store assets

Each repository includes **`docs/store-assets/`** with `listing.json`, PNGs for marketplace
dimensions where applicable, and **compressed WebP derivatives** (`preview-desktop-01-1200w.webp`,
`preview-mobile-01-800w.webp`, `banner-800w.webp`, `icon-512.webp`, etc.).

## See also

- [getting-started.md](getting-started.md)
- [using-eeg-in-a-browser-app.md](using-eeg-in-a-browser-app.md)
- [using-rppg-in-a-browser-app.md](using-rppg-in-a-browser-app.md)
- [using-iap-in-a-browser-app.md](using-iap-in-a-browser-app.md)
