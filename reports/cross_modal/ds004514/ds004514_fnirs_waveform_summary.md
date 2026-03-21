# DS004514 fNIRS Waveform Smoke Summary

## Overview

- subjects processed: 12
- train subjects: 9
- eval subjects: 3
- total image windows: 2160
- raw channel counts observed: 22, 28
- sampling rates observed: 7.8125, 8.928571
- low-median-SCI subjects: sub-05, sub-12

## Per-subject metrics

- sub-01 [train]: sfreq=7.8125, raw_nchan=28, haemo_nchan=28, image_events=180, sci_min=0.5578, sci_median=0.9794, below_0.75=4
- sub-02 [train]: sfreq=7.8125, raw_nchan=28, haemo_nchan=28, image_events=180, sci_min=0.8101, sci_median=0.9652, below_0.75=0
- sub-03 [eval]: sfreq=7.8125, raw_nchan=28, haemo_nchan=28, image_events=180, sci_min=0.9242, sci_median=0.9935, below_0.75=0
- sub-04 [eval]: sfreq=7.8125, raw_nchan=28, haemo_nchan=28, image_events=180, sci_min=0.0768, sci_median=0.9024, below_0.75=10
- sub-05 [train]: sfreq=7.8125, raw_nchan=28, haemo_nchan=28, image_events=180, sci_min=0.0019, sci_median=0.1494, below_0.75=26
- sub-06 [train]: sfreq=7.8125, raw_nchan=28, haemo_nchan=28, image_events=180, sci_min=0.8504, sci_median=0.9692, below_0.75=0
- sub-07 [train]: sfreq=8.928571, raw_nchan=22, haemo_nchan=22, image_events=180, sci_min=0.2273, sci_median=0.9738, below_0.75=2
- sub-08 [train]: sfreq=8.928571, raw_nchan=22, haemo_nchan=22, image_events=180, sci_min=0.7984, sci_median=0.9505, below_0.75=0
- sub-09 [train]: sfreq=8.928571, raw_nchan=22, haemo_nchan=22, image_events=180, sci_min=0.2933, sci_median=0.7832, below_0.75=8
- sub-10 [train]: sfreq=8.928571, raw_nchan=22, haemo_nchan=22, image_events=180, sci_min=0.9675, sci_median=0.9814, below_0.75=0
- sub-11 [eval]: sfreq=8.928571, raw_nchan=22, haemo_nchan=22, image_events=180, sci_min=0.9810, sci_median=0.9887, below_0.75=0
- sub-12 [train]: sfreq=8.928571, raw_nchan=22, haemo_nchan=22, image_events=180, sci_min=-0.0105, sci_median=0.0596, below_0.75=22

## Notes

- This stage validates real SNIRF loading and HbO/HbR derivation on the public raw payloads.
- The dataset is heterogeneous at the raw fNIRS level: both channel count and sampling rate vary across subjects.
- Any final ingest path must preserve geometry and handle subject-specific montage differences explicitly.
