---
"@elata-biosciences/eeg-web-ble": patch
---

Fix the `@elata-biosciences/eeg-web` peer dependency range. It was `^0.2.1`, a
version that was never published, so npm 7+ could not install the package
without `--legacy-peer-deps`. It is now `^0.12.0`, the release line it is built
and tested against.
