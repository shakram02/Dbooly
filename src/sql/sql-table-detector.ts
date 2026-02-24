/**
 * Heuristic single-table detector for determining whether a SQL query
 * targets exactly one base table (enabling inline editing in query mode).
 *
 * Returns the table name if exactly one table is detected, or null otherwise.
 * Conservative: any ambiguity falls back to null (non-editable).
 */

/**
 * Determines whether a SQL query targets exactly one base table.
 * @param sql The SQL query string to analyze
 * @returns The table name if exactly one table detected, null otherwise
 */
export function detectSingleTable(sql: string): string | null {
    if (!sql || typeof sql !== 'string') {
        return null;
    }

    // Strip single-line comments (-- ...)
    let cleaned = sql.replace(/--[^\n]*/g, '');
    // Strip multi-line comments (/* ... */)
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
    // Normalize whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    if (!cleaned) {
        return null;
    }

    // Reject non-SELECT queries
    if (!/^\s*SELECT\b/i.test(cleaned)) {
        return null;
    }

    // Reject CTEs (WITH keyword at the start)
    if (/^\s*WITH\b/i.test(cleaned)) {
        return null;
    }

    const upper = cleaned.toUpperCase();

    // Reject if contains JOIN, UNION, INTERSECT, EXCEPT keywords
    const disqualifiers = /\b(JOIN|UNION|INTERSECT|EXCEPT)\b/i;
    if (disqualifiers.test(cleaned)) {
        return null;
    }

    // Reject subqueries: nested SELECT after position 0
    // Find the first SELECT, then check if there's another SELECT
    const firstSelectEnd = upper.indexOf('SELECT') + 6;
    if (upper.indexOf('SELECT', firstSelectEnd) !== -1) {
        return null;
    }

    // Extract table from FROM clause
    // Matches: FROM [schema.]table [AS] [alias]
    // Supports backtick, double-quote, and bracket-quoted identifiers
    const fromMatch = cleaned.match(
        /\bFROM\s+(?:[`"[\w]+[`"\]]\.)?([`"[\w]+[`"\]](?:\.\w+)?)(?:\s+(?:AS\s+)?(?:[`"[\w]+[`"\]]))?/i
    );

    if (!fromMatch) {
        return null;
    }

    // Check for comma-joins: multiple tables in FROM clause (e.g., FROM a, b)
    // Get everything after FROM until WHERE/ORDER/GROUP/HAVING/LIMIT/;/end
    const fromClauseMatch = cleaned.match(
        /\bFROM\s+([\s\S]*?)(?:\bWHERE\b|\bORDER\b|\bGROUP\b|\bHAVING\b|\bLIMIT\b|\bOFFSET\b|;|$)/i
    );

    if (fromClauseMatch) {
        const fromClause = fromClauseMatch[1];
        // Remove string literals to avoid false positives from commas inside strings
        const noStrings = fromClause.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');
        if (noStrings.includes(',')) {
            return null;
        }
    }

    // Extract the clean table name (strip quotes/backticks/brackets)
    const rawTable = fromMatch[1];
    const tableName = rawTable.replace(/[`"[\]]/g, '');

    if (!tableName || tableName.length === 0) {
        return null;
    }

    return tableName;
}
