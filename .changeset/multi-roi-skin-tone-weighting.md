---
"@elata-biosciences/rppg-web": patch
---

Fix `MultiRoiRppgFuser` weighting each ROI's already-CHROM-filtered pulse
signal by that signal's own spectral SNR — Chari et al. ("Diverse R-PPG")
benchmarked this exact construction and found it increases skin-tone bias
relative to plain unweighted spatial averaging, because darker skin's lower
reflected light lowers post-processing SNR for a camera-noise reason
unrelated to signal quality, not a biophysical one. SNR-driven weighting now
happens in RGB-space (blend the raw per-ROI RGB averages first, then run one
shared CHROM + bandpass pipeline on the blend) instead of after independently
filtering each region.
