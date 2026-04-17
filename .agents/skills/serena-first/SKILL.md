---
name: serena-first
description: >
  Forces Claude Code to use Serena MCP tools instead of built-in Read/Glob/Grep/Edit/Write for all code operations.
  Use this skill for ANY task involving reading, searching, navigating, editing, or refactoring source code.
  This includes: understanding code, fixing bugs, adding features, renaming symbols, finding references,
  exploring the codebase, reviewing changes, implementing new functionality, and any other code interaction.
  Essentially, if you're touching source files, Serena should be your first choice.
  Only fall back to built-in tools for non-code files (images, PDFs, binary files) or when Serena's LSP
  doesn't support the language.
version: 2.0.0
---

# Serena-First: Always Use Serena MCP for Code

Serena provides LSP-powered semantic code understanding. Unlike built-in Read/Glob/Grep tools that treat files as raw text, Serena understands your code at the symbol level — the same way your IDE does. This means more accurate navigation, safer edits, and dramatically less token waste because you only load the symbols you actually need.

## Tool Names

Serena tools are referenced throughout this skill by their **short name** (e.g., `find_symbol`, `replace_content`). The actual tool call prefix depends on how the MCP server is registered in your client configuration. For example:

- Registered as `serena` → `mcp__serena__find_symbol`
- Registered as `plugin:serena:serena` → `mcp__plugin_serena_serena__find_symbol`

Use whichever prefix your client exposes. All tool names below are the short names — prepend your prefix when calling.

## Context Awareness

Serena's tool set and prompt behavior change significantly based on the `--context` flag at startup:

| Context         | Environment           | Behavior                                                          |
| --------------- | --------------------- | ----------------------------------------------------------------- |
| `claude-code`   | Claude Code CLI       | Disables tools that duplicate built-in capabilities (recommended) |
| `ide-assistant` | VS Code, Cursor, etc. | Full tool set for IDE integration                                 |
| `desktop-app`   | Claude Desktop        | Default context with full guidance prompts                        |

Check which context is active by calling `get_current_config`. This also shows the active project, available tools, and current modes.

**Claude Desktop note:** Claude Desktop does not auto-read Serena's system prompt. Call `initial_instructions` at the start of each session to load Serena's guidance manually.

## Startup Checklist

The startup steps depend on your client type:

### Per-workspace clients (Claude Code, VS Code)

These clients typically pass `--project $(pwd)` at startup, so the project is already active. Just check onboarding:

1. Call `check_onboarding_performed`. If it returns false, call `onboarding` and follow the instructions to create onboarding info for the project.

### Global-config clients (Claude Desktop, Codex)

These don't auto-activate a project:

1. Call `activate_project` with the project name or path
2. Call `check_onboarding_performed`. If false, call `onboarding`
3. Call `initial_instructions` to load Serena's system prompt (Claude Desktop skips this automatically)

### Token efficiency tip for Claude Code

If you have many Serena tools loaded, enable on-demand tool search to save tokens: set `ENABLE_TOOL_SEARCH=true` in your Serena config. This defers loading full tool definitions until they're actually needed.

## Tool Mapping: Serena vs Built-in

### Reading Code

| Built-in | Serena Tool                            | When to Use                                                                                                                                |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Read`   | `find_symbol` with `include_body=true` | You know which symbol (function, class, method) you need                                                                                   |
| `Read`   | `get_symbols_overview` with `depth=1`  | You want to understand a file's structure before diving in                                                                                 |
| `Read`   | `read_file`                            | You need to see the raw file content. Note: this reads the full file, not specific line ranges — use `find_symbol` for symbol-scoped reads |

**Reading strategy:** Start with `get_symbols_overview` to see what's in a file, then use `find_symbol` with `include_body=true` to read only the specific symbols you care about. This avoids loading entire files into context.

### Searching & Navigating

| Built-in | Serena Tool                                  | When to Use                                                |
| -------- | -------------------------------------------- | ---------------------------------------------------------- |
| `Grep`   | `find_symbol` with `substring_matching=true` | You're looking for a specific function, class, or variable |
| `Grep`   | `search_for_pattern`                         | You need regex-based search across the codebase            |
| `Grep`   | `find_referencing_symbols`                   | You need to find all usages of a symbol                    |
| `Glob`   | `find_file`                                  | You're looking for files by name pattern                   |
| `Glob`   | `list_dir`                                   | You're exploring directory structure                       |

**Searching strategy:** `find_symbol` is the fastest way to locate code because it uses the LSP index. If you're not sure of the exact name, use `substring_matching=true`. For broader searches, `search_for_pattern` supports regex with the ability to restrict to code files and specific directories.

### Editing Code

| Built-in | Serena Tool                    | When to Use                                                        |
| -------- | ------------------------------ | ------------------------------------------------------------------ |
| `Edit`   | `replace_symbol_body`          | Replacing an entire function, method, or class definition          |
| `Edit`   | `replace_content` (regex mode) | Modifying a few lines within a larger symbol — use `.*?` wildcards |
| `Edit`   | `insert_before_symbol`         | Adding code before a symbol (e.g., new import, new function)       |
| `Edit`   | `insert_after_symbol`          | Adding code after a symbol (e.g., appending a new method)          |
| `Edit`   | `rename_symbol`                | Renaming a symbol across the entire codebase                       |
| `Edit`   | `insert_at_line`               | Insert at a specific line number (line-based, not symbol-based)    |
| `Edit`   | `replace_lines`                | Replace a specific line range                                      |
| `Edit`   | `delete_lines`                 | Delete a specific line range                                       |
| `Write`  | `create_text_file`             | Creating a brand new file                                          |

**Editing strategy:** For whole-symbol replacements, `replace_symbol_body` is safest because it operates on LSP-identified symbol boundaries. For inline edits, `replace_content` with regex mode lets you target specific lines without quoting the full surrounding context. The line-based tools (`insert_at_line`, `replace_lines`, `delete_lines`) are available when you need precise line-level control that doesn't align to symbol boundaries.

### Shell Commands

| Serena Tool             | When to Use                                                                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `execute_shell_command` | Run builds, tests, linters, git commands, installs — any shell operation within the project. Serena can execute these directly, which is useful in autonomous agent loops for build/test feedback cycles |

Both Serena's `execute_shell_command` and the built-in Bash tool can run shell commands. Use whichever is more convenient, but prefer Serena's version when already working within Serena's workflow to stay in context.

### Configuration & Workflow

| Tool                           | What It Does                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `get_current_config`           | Check active project, available tools, current modes, and context                                                             |
| `switch_modes`                 | Dynamically switch operational modes (e.g., `["editing", "interactive"]`)                                                     |
| `initial_instructions`         | Load Serena's system prompt (required for Claude Desktop)                                                                     |
| `prepare_for_new_conversation` | Save state as a memory file before context limit is hit. Start a fresh conversation and Serena recovers from the saved memory |
| `restart_language_server`      | Resync the LSP index after edits made outside Serena (e.g., via built-in Write tool). Call this if symbol lookups seem stale  |
| `summarize_changes`            | Summarize what was changed in the current session                                                                             |

### Understanding Code Relationships

| Tool                         | Purpose                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `find_referencing_symbols`   | Find everywhere a symbol is used — critical before renaming or changing signatures |
| `find_symbol` with `depth=1` | See all methods/fields of a class                                                  |
| `get_symbols_overview`       | See the high-level structure of a file at a glance                                 |

## Workflow for Common Tasks

### Exploring unfamiliar code

```
1. get_symbols_overview("path/to/file.ts", depth=1)  → see what's defined
2. find_symbol("SymbolName", include_body=true)       → read specific symbols
3. find_referencing_symbols("SymbolName")              → see where it's used
```

### Fixing a bug

```
1. find_symbol("buggyFunction", include_body=true)     → read the code
2. find_referencing_symbols("buggyFunction")            → understand callers
3. replace_content(regex) or replace_symbol_body        → apply the fix
4. find_referencing_symbols("buggyFunction")            → verify no breakage
```

### Adding a feature

```
1. get_symbols_overview("relevant/file.ts", depth=1)   → understand existing structure
2. find_symbol("RelatedClass", depth=1)                → see methods to extend
3. insert_after_symbol("lastMethod")                   → add new method
4. find_referencing_symbols or search_for_pattern       → update any callers
```

### Refactoring / Renaming

```
1. find_referencing_symbols("oldName")                 → see full impact
2. rename_symbol("oldName", new_name="newName")        → rename everywhere
3. find_referencing_symbols("newName")                 → verify clean rename
```

## Memory System

Serena has its own memory system for storing project knowledge across conversations.

### Core memory tools

- `write_memory` — save a named memory (use `/` to organize by topic, e.g., `auth/login-flow`)
- `read_memory` — load a memory by name
- `list_memories` — browse available memories, optionally filtered by topic
- `edit_memory` — update an existing memory
- `delete_memory` — remove a memory
- `rename_memory` — rename or move a memory

### What to save as memories

- Architecture decisions and their rationale
- Important patterns and conventions
- Complex relationships between modules
- Debugging insights that took effort to discover

### Cross-conversation continuity

Before hitting the context window limit on a long task, call `prepare_for_new_conversation` to save a summary as a memory file. Then start a fresh conversation — Serena will recover context from the saved memory so you can continue seamlessly.

Check existing memories at the start of any task — they may contain context that saves you exploration time.

## When the LSP Goes Stale

If you edit files using non-Serena tools (built-in Write, Edit, etc.), the language server index can become outdated. Symptoms include: `find_symbol` not finding newly created symbols, `get_symbols_overview` showing stale structure, or `find_referencing_symbols` missing recent changes. Call `restart_language_server` to force a resync.

## When Built-in Tools Are Acceptable

Serena's LSP needs to support the language to provide semantic tools. It's fine to use built-in tools for:

- **Non-code files**: markdown, JSON configs, YAML, HTML templates, CSS, plain text
- **Images and binary files**: Serena doesn't process these
- **Serena LSP gap**: if the language server doesn't support a file type in your project, fall back to built-in Read/Grep for that file only

For everything else — TypeScript, JavaScript, Python, and any other language with LSP support — use Serena.

**Shell commands** (git, builds, tests, installs) can be run through either Serena's `execute_shell_command` or the built-in Bash tool. Both work; pick whichever fits your current workflow. In autonomous agent loops where you're already using Serena tools end-to-end, prefer `execute_shell_command`.

## Key Principles

1. **Symbols first, files second.** Think in terms of functions, classes, and methods — not line numbers and file offsets. The LSP knows where symbols are; let it do the work.

2. **Progressive disclosure.** Don't read entire files. Start with overviews, then drill into only the symbols you need. This saves enormous amounts of context.

3. **Trust the tools.** Serena's editing tools use LSP-precise boundaries. When `replace_symbol_body` succeeds, the edit is correct — no need to verify by re-reading the file.

4. **Regex is powerful.** When using `replace_content` in regex mode, use non-greedy wildcards (`.*?`) to match only what you need. You can replace large blocks without quoting them verbatim.

5. **Check references before editing.** Use `find_referencing_symbols` before changing any symbol's signature or renaming. This catches downstream impacts automatically.

6. **Know your context.** The `--context` flag determines which tools are available. Call `get_current_config` if you're unsure what's enabled. The available tool set varies — some tools may be disabled to avoid duplicating your client's built-in capabilities.
