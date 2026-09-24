---
name: clarify
description: Start iterative requirement clarification loop. Use this skill when the user has a vague requirement and wants to clarify it through structured questioning. Transforms unclear requirements into precise, actionable specifications.
---

# Clarify Skill

Transform vague requirements into precise specifications through structured questioning.

## Invocation

Parse the input to extract:
- **REQUIREMENT**: The vague requirement text (required)
- **--max-iterations N**: Maximum question rounds (default: 3)

## Initialization

1. Create `.claude/clarify.local.md`:
```
---
active: true
iteration: 1
max_iterations: [MAX_ITERATIONS]
original_requirement: "[REQUIREMENT]"
started_at: "[ISO timestamp]"
---

## Original Requirement
"[REQUIREMENT]"

## Clarification Progress
(Decisions will be recorded as the loop progresses)
```

2. Confirm activation:
```
Clarify loop activated!

Original Requirement: "[REQUIREMENT]"
Max Questions: [MAX_ITERATIONS]

To cancel: /cancel
```

## Clarification Methodology

You are now in a **Clarify Loop**. Transform the vague requirement into a precise, actionable specification through iterative questioning.

### Your Task

1. **Analyze** the original requirement for ambiguities
2. **Ask 4 questions** in a single `AskUserQuestion` call to resolve multiple ambiguities at once
3. **Record** all answers in your understanding
4. **Check completion**: Include "Clarification complete" as the last option of the last question
5. **Repeat** until user confirms completion OR max iterations reached

### Question Design Guidelines

- Ask **exactly 4 questions** per iteration (use all 4 question slots)
- Provide **exactly 4 options** per question (use all 4 option slots)
- The **4th question's 4th option** should be "Clarification complete - proceed with current understanding"
- Use **neutral framing** without bias toward any option
- Cover **different ambiguity categories** in each question set

### Ambiguity Categories to Probe

| Category | Example Questions |
|----------|------------------|
| **Scope** | What's included? What's explicitly out? |
| **Behavior** | Edge cases? Error scenarios? |
| **Interface** | Who/what interacts? How? |
| **Data** | Inputs? Outputs? Format? |
| **Constraints** | Performance? Compatibility? |
| **Priority** | Must-have vs nice-to-have? |
| **Reason** | Why? What's the jobs to be done? |
| **Success** | How to verify completion? |

## Completion Rules

When the user selects "Clarification complete" OR you reach max iterations:

1. Output the final clarified requirement:

```markdown
## Requirement Clarification Summary

### Before (Original)
"{original requirement verbatim}"

### After (Clarified)
**Goal**: [precise description]
**Reason**: [the ultimate purpose]
**Scope**: [what's included and excluded]
**Constraints**: [limitations, requirements]
**Success Criteria**: [how to verify]

**Decisions Made**:
| Question | Decision |
|----------|----------|
| [ambiguity 1] | [chosen option] |
| [ambiguity 2] | [chosen option] |
```

2. Then output: `<promise>CLARIFICATION COMPLETE</promise>`

**CRITICAL**: Only output the promise when you have genuinely finished clarification. Do NOT lie to exit the loop.

---

Now begin by:
1. Creating the state file
2. Identifying 4 key ambiguities
3. Asking 4 clarifying questions (each with 4 options) using a single AskUserQuestion call
