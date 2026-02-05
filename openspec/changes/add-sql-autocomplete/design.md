## Context

The dbooly extension allows users to write SQL queries in `.sql` files and execute them against connected databases. Currently, users must manually type table and column names, which is error-prone and requires memorizing schema details.

VSCode provides a `CompletionItemProvider` API that allows extensions to provide auto-completion suggestions. We'll use this to provide schema-aware suggestions.

### Constraints
- Must work with the existing `ConnectionManager` and `SchemaProvider` architecture
- Should not block the UI or slow down typing
- Must handle the case when no database is connected

### Stakeholders
- Developers writing SQL queries

## Goals / Non-Goals

**Goals:**
- Provide table name suggestions in appropriate contexts (after FROM, JOIN)
- Provide column name suggestions in appropriate contexts (after SELECT, WHERE, ORDER BY, GROUP BY, ON)
- Support dot-notation for qualified column access (`users.email`)
- Cache schema to avoid repeated database queries
- Show column data types in suggestion details

**Non-Goals:**
- SQL keyword completion (not in scope per requirements)
- Stored procedure/function completion (not in scope per requirements)
- Syntax validation or error highlighting
- Multi-database schema completion (only active connection)

## Decisions

### Decision: No External Libraries (Custom Tokenizer with Comment/String Handling)
**What:** Build a custom moo-inspired tokenizer to detect cursor context, properly ignoring comments and string literals.

**Why:**
- Full SQL parsers (like `node-sql-parser` ~150KB) add significant bundle size
- We only need to detect a few contexts (SELECT, FROM, WHERE, JOIN, ORDER BY, GROUP BY)
- Context detection doesn't need to be perfect—false positives are acceptable (showing extra suggestions is better than missing relevant ones)
- SQL keyword syntax is stable; maintenance burden is low
- Zero dependencies means no supply chain risk or version conflicts

**Alternatives considered:**
- `node-sql-parser` - rejected due to bundle size (~150KB minified)
- `moo` tokenizer (~3KB) - architecture referenced but not imported (we implement subset)
- No context awareness - rejected per user requirements

**Implementation approach (moo-inspired):**

The tokenizer uses a single-pass regex union strategy (inspired by moo's `compileRules`):

```typescript
// Token types we care about
type SqlTokenType =
    | 'keyword'      // SELECT, FROM, JOIN, WHERE, ORDER, GROUP, BY, ON, etc.
    | 'identifier'   // table/column names, aliases
    | 'dot'          // . for qualified names
    | 'string'       // 'single quoted' or "double quoted"
    | 'comment'      // -- line comment or /* block comment */
    | 'whitespace'   // spaces, tabs, newlines
    | 'other';       // operators, punctuation, etc.

// Compiled regex (order matters - first match wins)
const SQL_TOKEN_REGEX = new RegExp([
    /--[^\n]*/.source,                           // line comment
    /\/\*[\s\S]*?\*\//.source,                   // block comment
    /'(?:[^'\\]|\\.)*'/.source,                  // single-quoted string
    /"(?:[^"\\]|\\.)*"/.source,                  // double-quoted string (or identifier)
    /`[^`]*`/.source,                            // backtick identifier (MySQL)
    /\b(?:SELECT|FROM|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|WHERE|ORDER|GROUP|BY|ON|AS|AND|OR|INSERT|INTO|UPDATE|SET|HAVING|VALUES)\b/i.source,
    /[a-zA-Z_][a-zA-Z0-9_]*/.source,            // identifier
    /\./.source,                                 // dot
    /\s+/.source,                                // whitespace
    /./.source,                                  // any other single char
].join('|'), 'giy');

function tokenize(sql: string): SqlToken[] {
    const tokens: SqlToken[] = [];
    let match: RegExpExecArray | null;

    while ((match = SQL_TOKEN_REGEX.exec(sql)) !== null) {
        const text = match[0];
        const type = classifyToken(text);
        tokens.push({ type, text, offset: match.index });
    }
    return tokens;
}
```

**Context detection after tokenization:**

1. Filter out `comment`, `string`, and `whitespace` tokens
2. Find the cursor position in the token stream
3. Look backwards to find the most recent keyword
4. Return appropriate context based on that keyword

**Known limitations:**
- Complex CTEs or nested subqueries may not parse perfectly (acceptable for suggestions)
- Escaped quotes in strings use simple patterns (covers 99% of real SQL)

### Decision: Per-Connection Schema Cache
**What:** Cache schema (tables + columns) per connection ID, refresh on demand or when active connection changes.

**Why:**
- Avoids querying the database on every keystroke
- Connection-scoped caching handles multiple connections correctly
- Manual refresh gives users control for dynamic schemas

**Cache invalidation strategy:**
1. Clear cache when active connection changes
2. Provide `dbooly.refreshSchemaCache` command for manual refresh
3. Optionally auto-refresh after DDL execution (future enhancement)

### Decision: Completion Trigger Characters
**What:** Register `.` as a trigger character in addition to default word triggers.

**Why:**
- Enables `tablename.` to immediately show column suggestions
- Standard SQL IDE behavior users expect

## Risks / Trade-offs

**Risk:** Context detection may misidentify position in complex queries (subqueries, CTEs)
- **Mitigation:** Start with basic detection; complex queries can still use unqualified suggestions

**Risk:** Large schemas may have slow initial cache load
- **Mitigation:** Load cache lazily on first completion request; show "Loading..." placeholder

**Trade-off:** Regex-based parsing is less accurate than AST
- **Accepted:** Simplicity and bundle size outweigh perfect accuracy for suggestions

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Extension Host                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  SqlCompletionProvider                                      │
│  ├─ provideCompletionItems()                               │
│  │   ├─ Check active connection                            │
│  │   ├─ Get schema from SchemaCache                        │
│  │   ├─ Determine context via SqlParser                    │
│  │   └─ Return filtered CompletionItems                    │
│  │                                                          │
│  SchemaCache                                                │
│  ├─ getSchema(connectionId): CachedSchema                  │
│  ├─ refresh(connectionId): Promise<void>                   │
│  └─ clear(connectionId): void                              │
│  │                                                          │
│  SqlParser                                                  │
│  ├─ getSqlContext(document, position): SqlContext          │
│  ├─ parseTableAliases(sql): Map<alias, tableName>          │
│  └─ getTableAtDot(document, position): string | null       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### SqlContext Enum
```typescript
type SqlContext =
    | { type: 'tables' }                          // After FROM, JOIN
    | { type: 'columns', tables?: string[] }      // After SELECT, WHERE, ORDER BY, GROUP BY, HAVING, ON
    | { type: 'columns', table: string }          // After tablename. or alias., INSERT INTO table (, UPDATE table SET
    | { type: 'unknown' }                         // Default fallback
    | { type: 'loading' };                        // Schema is being fetched
```

### CachedSchema Structure
```typescript
interface CachedSchema {
    connectionId: string;
    tables: TableInfo[];
    columns: Map<string, ColumnInfo[]>;  // tableName -> columns
    fetchedAt: number;
}
```

## Open Questions
- Should we show recently used tables/columns first? (Defer to future enhancement)
- Should we support schema prefixes for databases with multiple schemas? (Defer, MySQL typically uses single schema per connection)
