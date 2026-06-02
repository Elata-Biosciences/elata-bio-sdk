---
"@elata-biosciences/rppg-web": minor
---

Add dimensional affect (valence-arousal) estimation with face + rPPG fusion.

New `affect` module: `blendshapeValenceArousal` (valence + face arousal from
MediaPipe blendshapes), `physiologyArousal` (arousal from HR elevation + HRV
suppression vs a resting baseline), `fuseAffect` (valence from the face, arousal
primarily from physiology — the face under-reports arousal), `affectStress`
(activated-and-unpleasant quadrant → 0..100), and `classifyAffectLabel` (maps
the fused valence-arousal to an emotional-state label via Russell's circumplex:
Excited/Stressed/Alert/Engaged/Tense/Calm/Relaxed/Fatigued/Neutral). The label
is the recommended value to display, since it reflects autonomic arousal the
face alone hides.
