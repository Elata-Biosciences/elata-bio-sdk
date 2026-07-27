# @elata-biosciences/rppg-models-web

Optional diagnostic waveform reconstruction for `@elata-biosciences/rppg-web`.

The MCD proxy is not a BPM source or clinical model. Supply the model URL
explicitly; the weight file is not bundled until its dataset and derived-asset
licensing are recorded.

```ts
import { createRppgSession } from "@elata-biosciences/rppg-web";
import { createMcdWaveformReconstructor } from "@elata-biosciences/rppg-models-web";

const waveformReconstructor = createMcdWaveformReconstructor({
  modelUrl: "/models/rppg-waveform-mcd-proxy-v1.onnx",
});

const session = await createRppgSession({
  video,
  experimental: {
    waveformReconstructor,
    inferenceIntervalMs: 1000,
    useReconstructedBpmEvidence: false,
  },
});

console.log(session.getModelDiagnostics());
await session.dispose();
```

Model failures are contained and do not stop deterministic BPM, HRV,
respiration, or quality outputs. A preprocessing/profile mismatch is rejected
instead of being silently adapted.

## Frozen model contract

- model ID: `rppg-waveform-mcd-proxy-v1`
- input: `[1, 15, 300]`, five ROIs × GREEN/POS/CHROM in manifest order
- output: `reconstructed`, `[1, 1, 300]`
- runtime: ONNX Runtime Web/WASM, opset 17
- model SHA-256: `2d56ed5a25a15b9e135c75d6658d71d696106484e87c86303182736428723635`
- metadata SHA-256: `e9a8a25c56041c175f645dd3666d1badff86c7007bc7ae0e27314c800af1ad31`

The exported manifest and model card are diagnostic contracts, not evidence of
live-browser/contact-PPG validation. Do not change preprocessing or weights
under this model ID.

## Asset publication gate

No ONNX file is included in the package. Before publishing a learned asset,
record its dataset and derived-weight licenses, training commit and command,
split manifest, hashes, browser parity results, and model card. Until then,
applications must host an authorized copy and provide its URL explicitly.
