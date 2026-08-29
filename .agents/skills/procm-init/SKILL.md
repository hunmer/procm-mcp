---
name: procm-init
description: Explore a project's declared development and startup commands, then create or update a procm-commands.json file for procm-mcp. Use when initializing procm-mcp for a repository, when asked to discover runnable app/test/build services, or when a project has no command catalog yet.
---

# Initialize procm-mcp Commands

Create a safe, useful command catalog for the current project. The catalog is
read by procm-mcp's `procm-command` tool and must live at the project root.

## Workflow

1. Identify the project root. Use the current working directory unless the user
   names another directory. Do not scan parent directories or unrelated sibling
   projects.
2. Read command declarations without running them. Start with `package.json`
   (`scripts`), then inspect common declarations such as `Makefile`,
   `Taskfile.yml`, `justfile`, `docker-compose.yml`/`compose.yml`,
   `pyproject.toml`, `Cargo.toml`, and `go.mod` when present.
3. Select commands that are useful to start or operate the project: development
   servers, workers, watch mode, tests, builds, and service stacks. Prefer the
   project's existing script names and preserve their argument ordering.
4. Resolve each command's `cwd` relative to the project root. Use `cwd` only
   when a command must run in a subdirectory; omit it for root commands.
5. Show the proposed command names and exact scripts/arguments to the user
   before writing. Ask which candidates to include when the choice is unclear.
6. If `procm-commands.json` exists, parse it first and merge selected commands
   without deleting existing entries. Never overwrite it blindly. Preserve
   unrelated top-level fields if the file has them, and report invalid JSON
   instead of replacing the file.
7. Write valid JSON with two-space indentation and a trailing newline. Verify
   that every command has a non-empty `script` string and that `args`, when
   present, is an array of strings.
8. Report the resulting file path and commands. Do not start any process as
   part of initialization.

## Output format

Use this shape (omit optional properties when they are not needed):

```json
{
  "commands": {
    "dev": { "script": "npm", "args": ["run", "dev"] },
    "test": { "script": "npm", "args": ["test"] },
    "api": { "script": "npm", "args": ["run", "dev"], "cwd": "server" }
  }
}
```

Do not put shell pipelines, redirects, comments, or unreviewed environment
secrets in the catalog. If a command requires shell syntax, use the project's
declared script (for example `npm run dev`) rather than embedding a shell
expression. Keep the catalog bounded to the project's actionable commands;
do not copy every package script automatically.