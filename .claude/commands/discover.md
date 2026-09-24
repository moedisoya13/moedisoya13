# /discover

Search for and install specialized tools and capabilities from all available sources.

user-invocable: true
description: Search for specialized tools and capabilities across local installation, skills.sh, and GitHub. Usage: /discover <search query>
allowed-tools: [Read, Glob, Grep, Bash, WebSearch, WebFetch, Write, Skill, AskUserQuestion]
argument-description: Search query - what kind of capability or tool you're looking for (e.g., "react", "docker", "testing")

## Instructions

### Step 1: Parse the Query

Take the user's search argument as the query. If no argument provided, ask:
> "What kind of tool or capability are you looking for? (e.g., react, docker, kubernetes, testing)"

### Step 2: Search

Search across all 3 sources (local, skills.sh, GitHub) following the same logic as the `skill-search` skill:

1. **Local**: Use Glob to find `~/.claude/skills/*/SKILL.md`, then Grep for query keywords
2. **skills.sh**: Use Bash to run `npx skills find {query}` and parse the output for matching skills
3. **GitHub (fallback)**: Only if fewer than 3 results from above, use WebSearch: `site:github.com "SKILL.md" claude {query}`

### Step 3: Display Results

Show the results table to the user. If no results found:
> "No matching capabilities found for '{query}'. Try different keywords or a broader search."

If results found, display the table and ask:
> "Enter the number of the capability you'd like to install, or 'cancel' to skip."

### Step 4: Handle Selection

When the user selects a result, handle installation directly based on the source type:

- **Already installed (local)**: Tell the user it's already available
- **skills.sh**: Run `npx skills add -y -g <owner/repo>` via Bash, then verify installation. If it fails with "No valid skills found", fall back to downloading SKILL.md directly from GitHub raw URL.
- **GitHub plugin**: Guide the user to run `/plugin install <url>`
- **Standalone SKILL.md**: Download via WebFetch and Write to `~/.claude/skills/{name}/SKILL.md`

Always confirm with the user before installing. After installation, verify the files exist.

### Language

- Respond in the same language the user used
- Use "도구", "능력", "전문 지식" instead of "스킬" or "플러그인" when speaking Korean
- Use "tool", "capability", "expertise" instead of "skill" or "plugin" when speaking English
