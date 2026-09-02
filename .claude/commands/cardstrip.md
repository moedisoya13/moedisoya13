---
description: Generate a PyPI or GitHub project banner PNG (cardstrip skill)
argument-hint: <pypi-package | github-url-or-owner/repo> [-o out.png] [--platform pypi|github] [--summary "..."] [--chip "..."] [--command "..."]
---

Generate a cardstrip banner for: $ARGUMENTS

Use the cardstrip skill (`~/.claude/skills/cardstrip/`, or this project's own
`.claude/skills/cardstrip/` if it has one — prefer the project copy when both
exist). Run its generator:

```
python3 <skill-dir>/scripts/generate.py $ARGUMENTS
```

(or just `cardstrip $ARGUMENTS` if that CLI shim is on PATH). If no `-o` is
given above, let it default to `<name>.png` in the current directory — don't
invent a different path. After rendering, read the resulting PNG back and
show it to the user so they can confirm the layout before considering this
done; the shrink-to-fit + ellipsis logic keeps most names readable but a
visual check is the only way to catch a genuinely wrong crop.
