---
name: build-commit-push
description: '**WORKFLOW SKILL** — Build, commit, and push the current working changes. USE FOR: packaging production build, writing commit.md entry, staging all changes, committing with a descriptive message, and pushing to the current remote branch. Trigger words: 打包构建提交推送, build commit push, ship, release, deploy prep.'
argument-hint: 'Optional: override commit message or scope description'
---

# Build → Commit → Push

Automated workflow that validates the build, writes a standardized commit log entry, and pushes to the current branch.

## Prerequisites

- There must be uncommitted changes in the working tree.
- `npm run build` must succeed before any commit is created.

## Procedure

### Step 1 — Preflight

Run these commands and collect their output:

```
git status --short
git branch --show-current
git diff --stat
```

If `git status --short` shows no changes, stop and tell the user there is nothing to commit.

### Step 2 — Build

```
npm run build
```

If the build fails, stop and report the error. Do NOT proceed to commit.

### Step 3 — Generate commit message

Derive a conventional-commit message from the changed files:

- `fix:` for bug fixes
- `feat:` for new features
- `perf:` for performance improvements
- `refactor:` / `chore:` / `docs:` as appropriate
- If the user provided an argument, use it as the commit scope or message override.

Keep the subject line under 72 characters, in English.

### Step 4 — Update commit.md

Read the top of `commit.md` to confirm the existing entry format, then insert a new entry **at the top** (after the `# Commit 日志` heading) using this template:

```markdown
## YYYY-MM-DD: <conventional commit subject>

**Commit Hash**: (pending)

### 改动摘要

<1–3 sentence summary of what changed and why>

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `<file>` | ✏️/➕ | <brief explanation> |

### 价值

- <bullet list of user-facing or developer-facing benefits>

### 验证

- `npm run build` ✅ 通过
```

### Step 5 — Stage, commit, push

```
git add -A
git commit -m "<message from Step 3>"
git push origin <branch from Step 1>
```

### Step 6 — Confirm

Print the resulting commit hash and remote push status. If push fails (e.g. no upstream), suggest `git push --set-upstream origin <branch>` but do NOT run it without user confirmation.
