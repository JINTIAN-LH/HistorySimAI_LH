# Project Guidelines

## Code Style
- Use JavaScript ESM style used across the repo (import/export, no CommonJS in frontend runtime files).
- Keep changes minimal and local to the subsystem you touch; avoid broad refactors unless requested.
- Follow existing naming and structure patterns in js/systems, js/rigid, js/api, and client/src/ui.
- Keep tests close to source with existing naming patterns (*.test.js, *.pipeline.test.js, *.extreme.test.js, *.quarterly.test.js).
- Preserve path alias usage from vite/vitest configs (@, @api, @systems, @client, @legacy, @ui, @styles).

## Architecture
- Treat client/src as the React shell/bootstrap layer and js as the primary gameplay runtime.
- Core gameplay rules and turn logic belong in js/systems and js/rigid; UI rendering belongs in client/src/ui or js/ui depending on existing area.
- API payload shaping and validation belong in js/api/requestContext.js and js/api/validators.js, not duplicated in many call sites.
- Server is a lightweight Express proxy in server; keep business gameplay logic on the client runtime side unless explicitly requested.
- For architecture background and rationale, read:
  - [README.md](../README.md)
  - [server/web游戏架构.md](../server/web游戏架构.md)
  - [ChongzhenSim/世界观导入自动适配AI规范.md](../ChongzhenSim/世界观导入自动适配AI规范.md)

## Build and Test
- Environment baseline:
  - Node 20
  - server/config.json must exist (copy from server/config.example.json and set LLM_API_KEY)
- Typical local workflow:
  - npm install
  - npm run start (frontend + backend)
- Validation commands:
  - npm run test
  - npm run build
- Use expensive verification only when needed:
  - npm run test:headless-playtest
  - npm run verify:experience
  - npm run fleet:run

## Conventions
- Keep gameplay effect channels explicit: do not collapse monthly narrative effects and quarter settlement effects into one field.
- In LLM story mode, if story generation fails or times out, rollback the turn state instead of silently falling back to template progression.
- For talent/roster merges, preserve talent.pool participation and dedupe recruited talents by both id and name.
- Keep Vite proxy routing explicit for local POST endpoints under /api/chongzhen/*; do not rely on bypass-style fallback routing.
- For turn pipeline tests that import turnSystem, mock router dependencies when needed in jsdom to avoid window.matchMedia import-time failures.
- When preparing commit messages for project workflows, update commit.md with the standardized entry format used by this repository.

## Documentation Links
- Core project overview: [README.md](../README.md)
- Gameplay and mode design docs: [ChongzhenSim](../ChongzhenSim)
- Version history: [CHANGELOG.md](../CHANGELOG.md)
- Commit log format: [commit.md](../commit.md)
