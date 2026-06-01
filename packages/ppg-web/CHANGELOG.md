# @elata-biosciences/ppg-web

## 0.2.1

### Patch Changes

- Improve HRV accuracy with sub-sample peak interpolation. `detectPeaks` now
  refines each peak to sub-sample precision via parabolic interpolation
  (`refinePeakByInterpolation`), removing the sample-grid quantization that
  previously swamped beat-to-beat RMSSD. `rmssdFromPeaks` additionally rejects
  physiologically implausible and ectopic NN intervals, and a new
  `cleanNnIntervalsMs` helper exposes the artifact-rejected NN series so SDNN and
  mean NN use the same cleaned data. `ppg-web` consumes the cleaned intervals for
  its time-domain HRV metrics.
- Updated dependencies
- Updated dependencies [d1615d6]
- Updated dependencies [7fed52d]
  - @elata-biosciences/rppg-web@0.3.0
  - @elata-biosciences/eeg-web@0.2.1
  - @elata-biosciences/eeg-web-ble@0.2.1
