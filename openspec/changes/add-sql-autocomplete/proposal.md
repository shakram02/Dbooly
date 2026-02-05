# Change: Add SQL Auto-Completion

## Why
Users typing SQL queries need efficient ways to discover and insert table/column names without memorizing schema details or switching context to browse the sidebar. Context-aware auto-completion reduces typos, speeds up query authoring, and improves the overall developer experience.

## What Changes
- Add a VSCode `CompletionItemProvider` for the `sql` language that suggests tables and columns from the active database connection
- Implement context-aware suggestions that show relevant items based on SQL cursor position (tables after FROM/JOIN, columns after SELECT/WHERE/etc.)
- Cache schema metadata to avoid repeated database queries during a session
- Support dot-notation (e.g., `users.` triggers columns for the `users` table)

## Impact
- Affected specs: New `sql-autocomplete` capability
- Affected code:
  - New `src/completion/sql-completion-provider.ts` - main completion logic
  - New `src/completion/sql-tokenizer.ts` - SQL tokenizer (handles comments/strings)
  - New `src/completion/sql-parser.ts` - SQL context detection using tokenizer
  - New `src/schema/schema-cache.ts` - schema caching service
  - `src/extension.ts` - register completion provider
  - `src/providers/schema-provider.ts` - potentially add method for fetching all schema metadata
