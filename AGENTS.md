# AGENTS.md

## Codebase Memory discovery rules

Codebase Memory is the default discovery layer for this repository.

- Before broad `grep`, globbing, or reading many files, call the relevant Codebase Memory MCP graph tools.
- Use `get_architecture` for orientation.
- Use `semantic_query` or `search_graph` to locate functionality.
- Use `trace_path` for callers and dependencies.
- Use `detect_changes` before and after non-trivial edits.
- Use `get_code_snippet` after locating an exact symbol and before reading an entire large file.
- Search both indexed Vetra projects whenever a task may cross the client/server boundary: `mnt-games-vetra-repos-vetra-client` and `mnt-games-vetra-repos-vetra-server`.
- Ordinary file reading is allowed when graph results are insufficient or exact implementation context is needed.
- Do not blindly trust stale ADR details when the current graph or source contradicts them.

The durable architecture snapshot is in `.codebase-memory/adr.md`. It records the related server project, current indexed revision, known graph extraction gaps, and the client/server protocol map.
