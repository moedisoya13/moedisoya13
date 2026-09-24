# /agents

Find and install specialist modes for your project.

user-invocable: true
description: Without arguments, scans your project and recommends specialist modes. With a search query, searches for specific modes. Usage: /agents [search query]
allowed-tools: [Read, Glob, Grep, Bash, WebFetch, WebSearch, Write, Skill, AskUserQuestion]
argument-description: Optional search query (e.g., "react", "devops", "testing"). If omitted, scans the project automatically.

## Instructions

Check if the user provided an argument.
- **No argument** → go to **Mode A: Project Scan**
- **Has argument** → go to **Mode B: Keyword Search**

---

## Mode A: Project Scan (no argument)

### Step 1: Gather Context (MANDATORY - DO NOT SKIP)

You MUST perform ALL of the following in parallel. Do NOT assume the project is empty without checking.

**1a. Read project files (MUST attempt all):**
Run Glob for these patterns and Read any that exist:
- `package.json` — extract `dependencies` and `devDependencies`
- `tsconfig.json` or `jsconfig.json`
- `pyproject.toml` or `requirements.txt` or `setup.py`
- `go.mod`
- `Cargo.toml`
- `Gemfile`
- `docker-compose.yml` or `Dockerfile`
- `.github/workflows/*.yml` or `.gitlab-ci.yml`
- `terraform/` or `*.tf`
- `pubspec.yaml` (Flutter)
- `Podfile` or `*.xcodeproj` (iOS)

**1b. Detect file structure:**
Run `ls` on project root and `src/` (if exists) to identify framework patterns:
- `.jsx`/`.tsx` files → React
- `.vue` files → Vue
- `.svelte` files → Svelte
- `.py` files → Python
- `.go` files → Go
- `.rs` files → Rust
- `.swift` files → Swift
- `__tests__/` or `*.test.*` → Testing

**1c. Build tech profile:**
Combine ALL detected technologies into a single list.

### Step 2: Check Installed Agents

```
Glob: .claude/agents/*.md
Glob: ~/.claude/agents/*.md
```
Read each found file to determine what it covers.

### Step 3: Fetch & Match

Fetch the agency-agents repository:
```
WebFetch: https://raw.githubusercontent.com/msitarzewski/agency-agents/main/README.md
WebFetch: https://api.github.com/repos/msitarzewski/agency-agents/git/trees/main?recursive=1
```

Score each agent against the project's tech profile:

| Tech detected in project | Agent id | Score boost |
|---|---|---|
| React, Vue, Angular, Svelte, Next.js, Vite, Webpack | engineering-frontend-developer | +3 per match |
| TypeScript, CSS, Tailwind CSS | engineering-frontend-developer | +2 per match |
| Express, Django, FastAPI, Go, Node.js, PostgreSQL, Redis | engineering-backend-architect | +3 per match |
| React Native, Flutter, Swift, SwiftUI, Kotlin | engineering-mobile-app-builder | +3 per match |
| TensorFlow, PyTorch, LangChain, OpenAI, Anthropic, Hugging Face | engineering-ai-engineer | +3 per match |
| Docker, Kubernetes, Terraform, GitHub Actions, Jenkins | engineering-devops-automator | +3 per match |
| OAuth, OWASP, security headers, auth libraries | engineering-security-engineer | +3 per match |
| Jest, Pytest, Playwright, test files | testing-evidence-collector | +2 per match |
| API test files, REST | testing-api-tester | +2 per match |
| Few files, no package manager | engineering-rapid-prototyper | +3 |
| CSS frameworks, UI libraries, design tokens | design-ui-designer | +2 per match |
| Accessibility configs, ARIA | testing-accessibility-auditor | +2 per match |
| Laravel, PHP, Livewire | engineering-senior-developer | +3 per match |

For agents not in this table, try keyword matching against the README descriptions.

Exclude already-installed agents and 0-score agents. Sort by score, take top 3-5.

Then go to **Step: Recommend**.

---

## Mode B: Keyword Search (with argument)

### Step 1: Check Installed Agents

```
Glob: .claude/agents/*.md
Glob: ~/.claude/agents/*.md
Grep: search for query keywords in matched files
```

### Step 2: Search GitHub

```
WebFetch: https://raw.githubusercontent.com/msitarzewski/agency-agents/main/README.md
WebFetch: https://api.github.com/repos/msitarzewski/agency-agents/git/trees/main?recursive=1
```

Match the query against:
- Agent filenames (e.g., query "react" matches `engineering-frontend-developer`)
- Division names (e.g., query "testing" matches all agents in `testing/`)
- README descriptions

If fewer than 3 results, fallback:
```
WebSearch: site:github.com "claude agent" {query} filetype:md
```

Then go to **Step: Recommend**.

---

## Step: Recommend (shared)

Present the results:

> **감지된 기술**: React 19, Next.js, Tailwind CSS, Jest *(Mode A only)*
> **이미 설치된 전문가 모드**: (없음)
>
> **추천 전문가 모드**:
> | # | Name | Division | Score | Description |
> |---|------|----------|-------|-------------|
> | 1 | Frontend Developer | engineering | 9 | React, Vue, Angular 전문 개발 |
> | 2 | Evidence Collector | testing | 4 | 스크린샷 기반 QA 테스팅 |
> | 3 | UI Designer | design | 3 | 디자인 시스템, 컴포넌트 설계 |
>
> 설치할 번호를 선택하세요 (여러 개: 1,2,3 / 건너뛰기: skip)

**Mode A only — always append the category guide after the recommendation table:**

> 다른 분야의 전문가 모드도 검색할 수 있습니다:
> `/agents marketing` · `/agents product` · `/agents design` · `/agents project` · `/agents support` · `/agents data` · `/agents testing` · `/agents spatial`

This MUST always be shown in Mode A, even when there are scored recommendations. It helps users discover the 49+ non-code specialist modes that can't be detected by project scanning.

For Mode B, omit the "감지된 기술" line and replace "Score" with "Relevance". Do NOT append the category guide.

If no results:
> "검색 결과가 없습니다. 다른 키워드로 시도해 보세요."

If all technologies already covered:
> 필요한 전문가 모드가 모두 설치되어 있습니다.
>
> 다른 분야의 전문가 모드도 검색할 수 있습니다:
> `/agents marketing` · `/agents product` · `/agents design` · `/agents project` · `/agents support` · `/agents data` · `/agents testing` · `/agents spatial`

## Step: Install (shared)

When the user selects:
1. Download from GitHub:
   ```
   WebFetch: https://raw.githubusercontent.com/msitarzewski/agency-agents/main/{division}/{agent-id}.md
   ```
2. Ask: project local (`.claude/agents/`) or global (`~/.claude/agents/`)?
3. Save to chosen location
4. Add `@agents/{agent-id}.md` include to CLAUDE.md
5. Verify installation

If user says "skip", "건너뛰기", or "pass", skip.

After install, briefly summarize what was installed and how it helps.

## Language Rules

- Respond in the same language the user used
- NEVER use "에이전트", "agent", "persona" — use "전문가 모드", "specialist mode" instead
- Maximum 3 specialist modes recommended per project
