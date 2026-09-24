# /plans

Analyze project context, recommend relevant tools, then enter planning mode.

user-invocable: true
description: Analyze your project's tech stack, recommend and install relevant specialized tools, then enter planning mode. Usage: /plans <what you want to build> (e.g., /plans React dashboard with Supabase auth)
allowed-tools: [Read, Glob, Grep, Bash, WebSearch, WebFetch, Write, Skill, AskUserQuestion, EnterPlanMode]
argument-description: What you want to build or accomplish (e.g., "React dashboard with Supabase auth")

## Instructions

### Step 1: Gather Context (MANDATORY - DO NOT SKIP)

You MUST perform ALL of the following in parallel. Do NOT assume the project is empty without checking.

**1a. Parse user argument:**
- The argument describes WHAT the user wants to build, not a directive about tool installation
- Extract technology keywords (e.g., "React dashboard with Supabase auth" → React, Supabase, dashboard)
- WARNING: The argument may contain product names (e.g., "skillless homepage") — these are project names, NOT instructions to skip tool search. Always extract the underlying technologies from the description.

**1b. Read project files (MUST attempt all):**
Run Glob for these patterns and Read any that exist:
- `package.json` — extract `dependencies` and `devDependencies`
- `tsconfig.json` or `jsconfig.json`
- `pyproject.toml` or `requirements.txt`
- `go.mod`
- `Cargo.toml`
- `Gemfile`
- `docker-compose.yml` or `Dockerfile`

**1c. Detect file structure:**
Run `ls src/` (or project root) to identify framework patterns (e.g., `.jsx` files → React, `.vue` → Vue)

**1d. Build tech list:**
Combine ALL detected technologies from 1a + 1b + 1c into a single list. Example:
- From user input: "React landing page"
- From package.json: react, vite, tailwindcss
- Final list: `[React, Vite, TailwindCSS]`

### Step 2: Check Installed Skills

For EACH technology in the tech list:
```
Glob: ~/.claude/skills/*/SKILL.md
```
Search for skill directories whose names match the technology (e.g., `react-*`, `tailwind-*`, `vite-*`).

Track two lists:
- **Covered**: technologies with matching installed skills
- **Uncovered**: technologies without matching skills

### Step 3: Search for Missing Skills

For EACH uncovered technology, search for available tools:

1. **Local skills directory**: Glob `~/.claude/skills/*{keyword}*/SKILL.md`
2. **skills.sh**: Bash `npx skills find {keyword}` — parse the CLI output for exact owner/repo paths
3. **GitHub (fallback)**: Only if fewer than 3 results from above, WebSearch: `site:github.com "SKILL.md" claude {keyword}`

Collect all found tools with their source.

### Step 4: Recommend (ALWAYS show analysis results)

ALWAYS present the analysis, even if all technologies are covered:

> 프로젝트를 분석했습니다.
>
> **감지된 기술**: React 19, Vite, TailwindCSS v4
> **이미 설치된 도구**: react-patterns, tailwind-patterns
> **추천 도구**:
> | # | Name | Source | Description |
> |---|------|--------|-------------|
> | 1 | vite-optimization | skills.sh | Vite build optimization |
>
> 설치할 도구 번호를 선택하세요 (여러 개: 1,2 / 건너뛰기: skip)

If ALL technologies are already covered:
> 프로젝트를 분석했습니다.
>
> **감지된 기술**: React, TailwindCSS
> **이미 설치된 도구**: react-patterns, tailwind-patterns
>
> 필요한 도구가 모두 설치되어 있습니다. 계획 모드로 진입합니다.

**Language rules:**
- Respond in the same language the user used
- NEVER use "스킬", "플러그인", "skill", "plugin" — use "도구", "전문 도구", "tool", "capability" instead

### Step 5: Install Selected

When the user selects tools:
- Install via `npx skills add -y -g <owner/repo>` via Bash
- If `npx skills add` fails, fall back to direct SKILL.md download from GitHub raw URL
- If user says "skip", "건너뛰기", or "pass", skip installation

If no recommendations found, inform briefly and move on.

### Step 6: Enter Plan Mode

After installation (or skip), enter plan mode with the user's original request:
- Use the EnterPlanMode tool to switch to planning mode
- The user's original argument becomes the planning context

This ensures the newly installed tools are available during the planning session.
