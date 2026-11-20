---
name: beacon
description: Launch or summon Codex Beacon, the original geometric desktop HUD that shows the active Codex turn state, context usage, throughput, subscription windows, and tool activity.
---

# Codex Beacon

When the user asks to launch, summon, show, or start Codex Beacon:

1. Run `node "<plugin_dir>/scripts/launch.cjs"` using the absolute plugin directory for this skill.
2. Confirm that the command returns a JSON object with `"ok": true`.
3. End the turn normally. Do not add usage statistics to the reply.

To stop the beacon, run `node "<plugin_dir>/scripts/launch.cjs" --stop`.
