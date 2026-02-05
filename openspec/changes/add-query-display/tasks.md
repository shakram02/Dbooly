## 1. Backend: Return Query String with Results

- [x] 1.1 Update `QueryResult` interface in `src/providers/schema-provider.ts` to include `query: string` field
- [x] 1.2 Update `MySQLSchemaProvider.queryTableData()` to return the executed query string in the result
- [x] 1.3 Add similar changes to other schema providers (PostgreSQL, SQLite) if they exist - N/A, only MySQL exists

## 2. Frontend: Display Query in Data Panel

- [x] 2.1 Add CSS styles for query display section (monospace, subtle background, theme-aware)
- [x] 2.2 Add query display HTML element in the panel header area
- [x] 2.3 Update message handler to receive and display the query string from `data` message
- [x] 2.4 Ensure query text is user-selectable for copy operations

## 3. Dynamic Updates

- [x] 3.1 Verify query display updates when sort changes (existing message flow handles this)
- [x] 3.2 Test that query correctly reflects ORDER BY clause presence/absence

## 4. Testing & Polish

- [ ] 4.1 Manual test: Open table, verify query displayed
- [ ] 4.2 Manual test: Sort by column, verify query updates with ORDER BY
- [ ] 4.3 Manual test: Clear sort, verify ORDER BY removed from displayed query
- [ ] 4.4 Manual test: Verify query is selectable/copyable
- [ ] 4.5 Visual review in both light and dark themes
