# `@elata-biosciences/ppg-web`

Browser-side Muse PPG heart-rate and HRV estimation built on the normalized
`HeadbandFrameV1` stream used elsewhere in this repo.

## What it does

- Consumes Muse `ppgRaw` and Athena `optics` frames.
- Selects the best channel automatically, or lets you pin a source/channel.
- Estimates heart rate plus basic HRV metrics:
  - `bpm`
  - `rmssdMs`
  - `sdnnMs`
  - `meanNnMs`
- Exposes a simple session wrapper on top of `HeadbandTransport`.
- Ships a simple in-repo demo at `./run.sh demo ppg`.

## Install

```bash
pnpm add @elata-biosciences/ppg-web @elata-biosciences/eeg-web @elata-biosciences/eeg-web-ble @elata-biosciences/rppg-web
```

## Minimal Muse usage

```ts
import { createMusePpgSession } from "@elata-biosciences/ppg-web";

const session = await createMusePpgSession({
	windowSec: 16,
	onDiagnostics: (diagnostics) => {
		console.log(diagnostics.metrics.bpm, diagnostics.metrics.rmssdMs);
	},
});

const metrics = session.getMetrics();
console.log(metrics.channel, metrics.source, metrics.bpm, metrics.rmssdMs);
```

## Generic transport usage

```ts
import { createPpgSession } from "@elata-biosciences/ppg-web";

const session = await createPpgSession({
	transport,
	autoStart: true,
	source: "auto",
	channel: "auto",
});
```

## Notes

- For classic Muse `ppgRaw`, the transport currently carries local frame timing,
  so HRV should be treated as a developer preview until device timestamps are
  propagated end-to-end.
- Athena `optics` already preserves decoder timestamps and is the preferred path
  when available.
