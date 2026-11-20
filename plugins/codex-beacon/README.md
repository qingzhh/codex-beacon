# Codex Beacon plugin

This directory is the installable Codex plugin payload.

- `hooks/hooks.json`: records `UserPromptSubmit` and `Stop` identity events.
- `scripts/bridge.cjs`: local telemetry bridge on `127.0.0.1:17891`.
- `scripts/stats.cjs`: incremental Codex transcript reader.
- `scripts/limits.cjs`: read-only Codex account limit query.
- `ui/beacon.ps1`: original WPF HUD.
- `skills/beacon/SKILL.md`: `/beacon` launcher skill.

Run `npm test` before publishing changes.
