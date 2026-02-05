## 1. Schema Cache Service
- [x] 1.1 Create `src/schema/schema-cache.ts` with `SchemaCache` class
- [x] 1.2 Implement cache storage for tables and columns per connection
- [x] 1.3 Add method to fetch and cache schema from active connection
- [x] 1.4 Add cache invalidation (manual refresh + on connection change)
- [x] 1.5 Subscribe to `onDidChangeActiveConnection` to clear/reload cache

## 2. SQL Tokenizer
- [x] 2.1 Create `src/completion/sql-tokenizer.ts` with token types and regex patterns
- [x] 2.2 Implement `tokenize()` function using combined regex (moo-inspired approach)
- [x] 2.3 Handle line comments (`-- comment`)
- [x] 2.4 Handle block comments (`/* comment */`)
- [x] 2.5 Handle single-quoted strings (`'string'`)
- [x] 2.6 Handle double-quoted strings/identifiers (`"identifier"`)
- [x] 2.7 Handle backtick identifiers (`` `table` `` for MySQL)
- [x] 2.8 Classify SQL keywords (SELECT, FROM, JOIN, WHERE, ORDER, GROUP, BY, ON, AS)

## 3. SQL Context Parser
- [x] 3.1 Create `src/completion/sql-parser.ts` with context detection logic
- [x] 3.2 Implement `getSqlContext()` using tokenizer output (ignoring comments/strings)
- [x] 3.3 Determine cursor position context (SELECT, FROM, WHERE, ORDER BY, GROUP BY, HAVING, ON)
- [x] 3.4 Handle INSERT INTO context (columns after opening parenthesis)
- [x] 3.5 Handle UPDATE SET context (columns after SET keyword)
- [x] 3.6 Handle dot-notation detection (e.g., `tablename.` or `alias.`)
- [x] 3.7 Parse table aliases from FROM/JOIN clauses for column qualification
- [x] 3.8 Handle subquery detection (nested SELECT resets context)
- [ ] 3.9 Add tests for context detection edge cases

## 4. Completion Provider
- [x] 4.1 Create `src/completion/sql-completion-provider.ts` implementing `CompletionItemProvider`
- [x] 4.2 Inject `SchemaCache` dependency
- [x] 4.3 Implement `provideCompletionItems()` using context from SQL parser
- [x] 4.4 Return table suggestions when context is FROM/JOIN
- [x] 4.5 Return column suggestions when context is SELECT/WHERE/ORDER BY/GROUP BY/HAVING/ON
- [x] 4.6 Return column suggestions for INSERT INTO and UPDATE SET contexts
- [x] 4.7 Handle dot-notation to show columns for specific table
- [x] 4.8 Set appropriate `CompletionItemKind` (Module for tables, Field for columns)
- [x] 4.9 Add detail/documentation showing column types
- [x] 4.10 Show loading indicator when schema is being fetched
- [x] 4.11 Handle schema fetch errors gracefully (log, don't show error to user)

## 5. Extension Integration
- [x] 5.1 Update `extension.ts` to instantiate `SchemaCache`
- [x] 5.2 Register `SqlCompletionProvider` for `sql` language
- [x] 5.3 Add command `dbooly.refreshSchemaCache` for manual refresh
- [x] 5.4 Ensure proper disposal of completion provider subscription

## 6. Validation
- [ ] 6.1 Test auto-completion triggers in .sql files
- [ ] 6.2 Verify context-aware suggestions (tables vs columns)
- [ ] 6.3 Test dot-notation completion
- [ ] 6.4 Test with no active connection (graceful degradation)
- [ ] 6.5 Test cache refresh on connection switch
- [ ] 6.6 Test that keywords inside line comments don't trigger suggestions
- [ ] 6.7 Test that keywords inside block comments don't trigger suggestions
- [ ] 6.8 Test that keywords inside strings don't trigger suggestions
- [ ] 6.9 Test INSERT INTO column suggestions
- [ ] 6.10 Test UPDATE SET column suggestions
- [ ] 6.11 Test HAVING clause column suggestions
- [ ] 6.12 Test subquery context handling
- [ ] 6.13 Test loading state during schema fetch
