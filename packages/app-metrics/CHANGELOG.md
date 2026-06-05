# Changelog

## 0.2.0

### Minor Changes

- Add `reportAffect` to the client and host. `createMetricsClient().reportAffect(report)`
  forwards a derived per-session affect aggregate (a `calm`/`stress`/`focus`
  dimension — never raw signal) to the platform-owned biometric Score. It is
  gated by the `biometrics` scope plus the user's consent (rejects `scope_denied`
  otherwise), and the server re-verifies. Adds the `AffectReport` /
  `ReportAffectResult` / `AffectDimension` types, the `reportAffect` wire op, the
  `scope_denied` / `not_supported` error codes, `isValidAffectReport`, and the
  scope/consent-gated host handler (`scopes` / `biometricsConsent` /
  `onReportAffect`).
