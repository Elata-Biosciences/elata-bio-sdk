# Changelog

> Entries below stop at 0.2.0. Versions after that (through 0.5.0) were released
> without Changesets entries. See the
> [git history](https://github.com/Elata-Biosciences/elata-bio-sdk/commits/main/packages/app-metrics)
> for those changes. New releases cut with `./run.sh bump` are recorded here again.

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
