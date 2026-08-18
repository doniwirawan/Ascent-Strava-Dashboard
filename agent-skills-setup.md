# Agent Skills Setup

Installs `addyosmani/agent-skills` (24 skills: frontend-ui-engineering, code-review-and-quality, git-workflow-and-versioning, security-and-hardening, performance-optimization, test-driven-development, etc.) into a project for Claude Code, Codex, Gemini CLI, GitHub Copilot.

## Requirements

- Node.js >= 20.12 (needs `node:util` `styleText` export). Check:
  ```
  node -v
  ```
  If below 20.12, upgrade:
  ```
  winget upgrade --id OpenJS.NodeJS.20 --accept-source-agreements --accept-package-agreements
  ```

## Install

Run from project root:

```
npx skills add addyosmani/agent-skills
```

Non-interactive, auto-detects agent, installs all 24 skills into `.agents/skills/` with a symlink for Claude Code (`.claude/skills`).

## After install

- Start a **new** Claude Code session in that project — skills won't show in an already-running session.
- Skills appear in the available-skills list, invoke via `/skill-name`.

## Notes

- `browser-testing-with-devtools` skill flagged Medium risk (1 Socket alert) at install time. Review before use: https://skills.sh/addyosmani/agent-skills
- Skills run with full agent permissions — review before use.
