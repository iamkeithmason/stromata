#!/usr/bin/env python3
"""PreToolUse guard on Bash: refuse a kill-by-pattern that would kill its own shell.

WHY. The Bash tool runs each command as `bash -c "<the whole command>"`, so the
calling shell's own command line CONTAINS the pattern it is about to kill by.
`pkill -f "expo start"` excludes pkill itself but not its parent shell, which
matches, gets SIGTERM, and the tool call dies with exit 144 and no output. This
happened twice in one session (28 Sep 2026 — see docs/research/
2026-09-28-prove-a-legal-value-exists-before-tuning.md), the second time after
the first was already understood.

WHAT IS BLOCKED. A command that kills by matching full command lines, where the
pattern, read as a regex, matches the command text itself:
  - `pkill -f PATTERN` (also --full, and clusters like -9f / -fe);
  - `pgrep -f PATTERN` when the same command also runs `kill` (the
    `pgrep -f … | xargs kill` shape; a bare pgrep only lists, so it is allowed);
  - `ps … | grep PATTERN … | … kill` (the same trap built by hand).

WHAT PASSES. Everything else, including the two safe idioms the block message
suggests: select by binary (`ps -eo pid,comm,args | awk '$2=="node" && /expo
start/ {print $1}' | xargs -r kill`), or the bracket trick (`pkill -f "[e]xpo
start"`), whose regex does not match its own literal text. A command this
script cannot parse is allowed — a guard that blocks what it cannot read would
be worse than the bug.
"""

import json
import re
import shlex
import sys

SEPARATORS = {"|", "||", "&", "&&", ";", ";;", "(", ")", "\n"}
# pkill/pgrep short options that take a value (so the next token is not the pattern).
VALUE_OPTS = {"-d", "-g", "-G", "-P", "-s", "-t", "-u", "-U", "-F", "--signal",
              "--delimiter", "--pgroup", "--group", "--parent", "--session",
              "--terminal", "--euid", "--uid", "--pidfile", "--ns", "--nslist"}
# grep options that take a value.
GREP_VALUE_OPTS = {"-e", "-f", "-m", "-A", "-B", "-C", "--regexp", "--file",
                   "--max-count", "--context"}


def segments(tokens):
    seg = []
    for t in tokens:
        if t in SEPARATORS:
            if seg:
                yield seg
            seg = []
        else:
            seg.append(t)
    if seg:
        yield seg


def base(tok):
    return tok.rsplit("/", 1)[-1]


def pkill_pattern(seg):
    """(uses_full_match, pattern) for a pkill/pgrep segment."""
    full, pattern, skip = False, None, False
    for tok in seg[1:]:
        if skip:
            skip = False
            continue
        if tok == "--full":
            full = True
        elif tok in VALUE_OPTS:
            skip = True
        elif tok.startswith("--"):
            continue
        elif tok.startswith("-") and len(tok) > 1:
            if "f" in tok[1:]:
                full = True
        elif pattern is None:
            pattern = tok
    return full, pattern


def grep_pattern(seg):
    skip = False
    for i, tok in enumerate(seg[1:], 1):
        if skip:
            skip = False
            continue
        if tok in ("-e", "--regexp") and i + 1 < len(seg):
            return seg[i + 1]
        if tok in GREP_VALUE_OPTS:
            skip = True
        elif tok.startswith("-") and len(tok) > 1:
            continue
        else:
            return tok
    return None


def matches_self(pattern, command):
    if not pattern:
        return False
    try:
        return re.search(pattern, command) is not None
    except re.error:
        return pattern in command


def check(command):
    try:
        lex = shlex.shlex(command, posix=True, punctuation_chars=True)
        lex.whitespace_split = True
        tokens = list(lex)
    except ValueError:
        return None
    segs = list(segments(tokens))
    names = [base(s[0]) for s in segs]
    # `kill` anywhere: `| xargs kill`, `kill $(pgrep …)`, `| xargs -r kill -9`.
    kills = any(base(t) == "kill" for t in tokens)

    for name, seg in zip(names, segs):
        if name == "pkill" or (name == "pgrep" and kills):
            full, pattern = pkill_pattern(seg)
            if full and matches_self(pattern, command):
                return f"`{name} -f {pattern!r}`"
    if "ps" in names and kills:
        for name, seg in zip(names, segs):
            if name == "grep":
                pattern = grep_pattern(seg)
                if matches_self(pattern, command):
                    return f"`ps | grep {pattern!r} | … kill`"
    return None


def main():
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return 0
    command = (payload.get("tool_input") or {}).get("command") or ""
    hit = check(command)
    if not hit:
        return 0
    print(
        f"Blocked: {hit} would match this command's own shell (the Bash tool runs "
        "`bash -c \"<command>\"`, so the pattern is in the shell's command line) and "
        "kill it mid-command. Select by binary instead, e.g. "
        "`ps -eo pid,comm,args | awk '$2==\"node\" && /expo start/ {print $1}' | xargs -r kill`, "
        "or make the pattern not match itself: `pkill -f \"[e]xpo start\"`.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
