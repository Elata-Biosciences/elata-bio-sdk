# @elata-biosciences/rppg-models-web

Optional diagnostic waveform reconstruction for `@elata-biosciences/rppg-web`.

The MCD proxy is not a BPM source or clinical model. Supply the model URL
explicitly; the weight file is not bundled until its dataset and derived-asset
licensing are recorded.

```ts
import { createMcdWaveformReconstructor } from "@elata-biosciences/rppg-models-web";

const waveformReconstructor = createMcdWaveformReconstructor({
  modelUrl: "/models/rppg-waveform-mcd-proxy-v1.onnx",
});
```

Pass the constructed plugin to `createRppgSession({ experimental: { ... } })`
and call `session.dispose()` when finished.
