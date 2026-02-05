## Context
Users browsing database tables need a quick way to see sample data. The extension already has:
- Tree view with expandable connections showing tables
- Schema provider pattern for database-specific queries
- Webview panel pattern (TableSearchPanel)

## Goals / Non-Goals
- Goals:
  - Display table data when user clicks a table in the tree view
  - Show first 100 rows to balance preview usefulness with performance
  - Render data in a clean, readable tabular format
  - Follow existing webview and provider patterns

- Non-Goals:
  - Full query editor (separate feature)
  - Editable data grid
  - Pagination beyond the first 100 rows
  - Data export from this panel
  - Column sorting/filtering

## Decisions

### Decision: Use single-click to trigger preview
- **Rationale**: Single-click is the most discoverable interaction. Double-click is less intuitive and not standard for VSCode tree views. The `onDidChangeSelection` event makes this straightforward.

### Decision: Fixed 100-row limit
- **Rationale**: 100 rows provides enough context to understand table structure and sample data. It's small enough to render quickly and fits typical preview use cases. Users needing more data can use a proper query editor (future feature).

### Decision: Reuse webview panel pattern from TableSearchPanel
- **Rationale**: Consistency with existing code, proven pattern, handles message passing and lifecycle correctly.

### Decision: Add `queryTableData()` to SchemaProvider interface
- **Rationale**: Different databases have different escaping rules and syntax. The provider pattern already abstracts this for `listTables()`. Adding data querying follows the same pattern.
- **Alternatives considered**:
  - Generic SQL builder: Over-engineered for just `SELECT * LIMIT`
  - Direct query in panel: Would couple UI to database specifics

### Decision: Display column names from result metadata
- **Rationale**: MySQL2 returns column metadata with query results. Using this avoids a separate `DESCRIBE` query.

## Risks / Trade-offs
- **Large binary/blob columns**: Could cause rendering issues → Mitigation: Truncate cell display to reasonable length
- **Very wide tables (many columns)**: Could overflow → Mitigation: Horizontal scrolling with fixed header
- **Slow queries on large tables**: Even `LIMIT 100` can be slow without indexes → Mitigation: Show loading state; this is a known trade-off for preview functionality

## Open Questions
- None currently; straightforward feature that follows existing patterns
