export const APP_ID = 'pulse-game';
export const DEMO_WALLET_ADDRESS = '0xdemo000000000000000000000000000000000000';

export const PHASE_DURATIONS = {
  calibrateMs: 15_000,
  anticipationMinMs: 5_000,
  anticipationMaxMs: 15_000,
  startleMs: 200,
  recoveryTimeoutMs: 60_000,
} as const;

export const RECOVERY_MARGIN_BPM = 5;
export const RECOVERY_SUSTAIN_MS = 3_000;
