---
"@elata-biosciences/rppg-web": patch
---

Keep video-frame timestamps in one monotonic clock domain so a live stream's
initial zero `mediaTime` cannot invalidate the rPPG quality window.
