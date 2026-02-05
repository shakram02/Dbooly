/**
 * SQL Context Parser - Determines cursor context for auto-completion
 *
 * Uses the tokenizer to analyze SQL and determine what kind of
 * suggestions to show based on cursor position.
 */

import {
    SqlToken,
    tokenizeUpTo,
    filterSignificantTokens,
    getIdentifierText
} from './sql-tokenizer';

export type SqlContext =
    | { type: 'tables' }
    | { type: 'columns'; tables?: string[] }
    | { type: 'qualified-columns'; table: string }
    | { type: 'unknown' };

export interface TableAlias {
    alias: string;
    table: string;
}

/**
 * Determines the SQL context at the cursor position.
 *
 * @param sql The full SQL text
 * @param cursorOffset The cursor position (0-based offset)
 * @returns The context indicating what kind of suggestions to show
 */
export function getSqlContext(sql: string, cursorOffset: number): SqlContext {
    const tokens = tokenizeUpTo(sql, cursorOffset);
    const significant = filterSignificantTokens(tokens);

    if (significant.length === 0) {
        return { type: 'unknown' };
    }

    // Check for dot notation first (highest priority)
    const dotContext = getDotContext(significant);
    if (dotContext) {
        return dotContext;
    }

    // Find the last significant keyword to determine context
    const lastKeyword = findLastContextKeyword(significant);
    if (!lastKeyword) {
        return { type: 'unknown' };
    }

    const keyword = lastKeyword.normalized!;

    // Table contexts: FROM, JOIN, INTO, UPDATE
    if (keyword === 'FROM' || keyword === 'JOIN' ||
        keyword === 'LEFT' || keyword === 'RIGHT' ||
        keyword === 'INNER' || keyword === 'OUTER' ||
        keyword === 'CROSS' || keyword === 'FULL') {
        return { type: 'tables' };
    }

    if (keyword === 'INTO') {
        // Check if we're in INSERT INTO table ( context
        const afterInto = getTokensAfterKeyword(significant, lastKeyword);
        if (hasOpenParen(afterInto)) {
            // We're in the column list of INSERT INTO table (
            const tableName = getTableAfterKeyword(afterInto);
            if (tableName) {
                return { type: 'qualified-columns', table: tableName };
            }
        }
        return { type: 'tables' };
    }

    if (keyword === 'UPDATE') {
        // Check if we have SET after UPDATE table
        const afterUpdate = getTokensAfterKeyword(significant, lastKeyword);
        const hasSet = afterUpdate.some(t => t.normalized === 'SET');
        if (hasSet) {
            // We're in UPDATE table SET column = ...
            const tableName = getTableAfterKeyword(afterUpdate);
            if (tableName) {
                return { type: 'qualified-columns', table: tableName };
            }
        }
        return { type: 'tables' };
    }

    // Column contexts: SELECT, WHERE, ORDER BY, GROUP BY, HAVING, ON, SET
    if (keyword === 'SELECT' || keyword === 'WHERE' ||
        keyword === 'HAVING' || keyword === 'ON' || keyword === 'SET') {
        const tables = parseTablesFromQuery(significant);
        return { type: 'columns', tables: tables.length > 0 ? tables : undefined };
    }

    if (keyword === 'BY') {
        // Check if preceded by ORDER or GROUP
        const byIndex = significant.indexOf(lastKeyword);
        if (byIndex > 0) {
            const prevToken = significant[byIndex - 1];
            if (prevToken.normalized === 'ORDER' || prevToken.normalized === 'GROUP') {
                const tables = parseTablesFromQuery(significant);
                return { type: 'columns', tables: tables.length > 0 ? tables : undefined };
            }
        }
    }

    return { type: 'unknown' };
}

/**
 * Checks if the cursor is after a dot (table.column notation).
 */
function getDotContext(tokens: SqlToken[]): SqlContext | null {
    if (tokens.length < 2) {
        return null;
    }

    const lastToken = tokens[tokens.length - 1];

    // Check if last token is a dot
    if (lastToken.type === 'dot') {
        // Look for identifier before the dot
        const beforeDot = tokens[tokens.length - 2];
        if (beforeDot.type === 'identifier' || beforeDot.type === 'keyword') {
            const tableName = getIdentifierText(beforeDot);
            // Resolve alias if possible
            const aliases = parseTableAliases(tokens);
            const resolvedTable = aliases.get(tableName.toLowerCase()) || tableName;
            return { type: 'qualified-columns', table: resolvedTable };
        }
    }

    return null;
}

/**
 * Finds the last keyword that determines completion context.
 */
function findLastContextKeyword(tokens: SqlToken[]): SqlToken | null {
    // Context-determining keywords in priority order
    const contextKeywords = new Set([
        'SELECT', 'FROM', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'CROSS', 'FULL',
        'WHERE', 'ON', 'SET', 'INTO', 'UPDATE', 'HAVING', 'BY'
    ]);

    // Track parenthesis depth to handle subqueries
    let parenDepth = 0;

    // Scan backwards through tokens
    for (let i = tokens.length - 1; i >= 0; i--) {
        const token = tokens[i];

        if (token.type === 'rparen') {
            parenDepth++;
        } else if (token.type === 'lparen') {
            parenDepth--;
            // If we close more parens than we opened, we're inside a subquery
            // Reset and continue to find context within the subquery
            if (parenDepth < 0) {
                parenDepth = 0;
            }
        } else if (token.type === 'keyword' && parenDepth === 0) {
            if (contextKeywords.has(token.normalized!)) {
                return token;
            }
        }
    }

    return null;
}

/**
 * Gets tokens that appear after a specific keyword token.
 */
function getTokensAfterKeyword(tokens: SqlToken[], keyword: SqlToken): SqlToken[] {
    const keywordIndex = tokens.indexOf(keyword);
    if (keywordIndex === -1) {
        return [];
    }
    return tokens.slice(keywordIndex + 1);
}

/**
 * Gets the table name immediately after a keyword (e.g., after INTO or UPDATE).
 */
function getTableAfterKeyword(tokensAfterKeyword: SqlToken[]): string | null {
    for (const token of tokensAfterKeyword) {
        if (token.type === 'identifier') {
            return getIdentifierText(token);
        }
        // Skip keywords that might appear (like TABLE in INSERT INTO TABLE)
        if (token.normalized === 'TABLE') {
            continue;
        }
        // Stop at other keywords or punctuation
        if (token.type === 'keyword' || token.type === 'lparen') {
            break;
        }
    }
    return null;
}

/**
 * Checks if there's an unclosed opening parenthesis in the tokens.
 */
function hasOpenParen(tokens: SqlToken[]): boolean {
    let depth = 0;
    for (const token of tokens) {
        if (token.type === 'lparen') {
            depth++;
        } else if (token.type === 'rparen') {
            depth--;
        }
    }
    return depth > 0;
}

/**
 * Parses table names from FROM and JOIN clauses.
 */
function parseTablesFromQuery(tokens: SqlToken[]): string[] {
    const tables: string[] = [];
    const aliases = parseTableAliases(tokens);

    let i = 0;
    while (i < tokens.length) {
        const token = tokens[i];

        // Look for FROM or JOIN keywords
        if (token.type === 'keyword' &&
            (token.normalized === 'FROM' || token.normalized === 'JOIN')) {
            // Skip to next token
            i++;

            // Skip any JOIN type keywords
            while (i < tokens.length) {
                const t = tokens[i];
                if (t.type === 'keyword' &&
                    (t.normalized === 'LEFT' || t.normalized === 'RIGHT' ||
                     t.normalized === 'INNER' || t.normalized === 'OUTER' ||
                     t.normalized === 'CROSS' || t.normalized === 'FULL' ||
                     t.normalized === 'JOIN')) {
                    i++;
                } else {
                    break;
                }
            }

            // Get the table name
            if (i < tokens.length && tokens[i].type === 'identifier') {
                const tableName = getIdentifierText(tokens[i]);
                if (!tables.includes(tableName.toLowerCase())) {
                    tables.push(tableName.toLowerCase());
                }
            }
        }

        i++;
    }

    // Also add tables that are only referenced by alias
    for (const [alias, table] of aliases) {
        const lowerTable = table.toLowerCase();
        if (!tables.includes(lowerTable)) {
            tables.push(lowerTable);
        }
    }

    return tables;
}

/**
 * Parses table aliases from the query.
 * Returns a map of alias -> table name.
 */
export function parseTableAliases(tokens: SqlToken[]): Map<string, string> {
    const aliases = new Map<string, string>();

    for (let i = 0; i < tokens.length - 1; i++) {
        const token = tokens[i];

        // Pattern: table_name AS alias
        if (token.type === 'identifier') {
            const tableName = getIdentifierText(token);
            const next = tokens[i + 1];

            if (next?.normalized === 'AS' && i + 2 < tokens.length) {
                const aliasToken = tokens[i + 2];
                if (aliasToken.type === 'identifier') {
                    const alias = getIdentifierText(aliasToken);
                    aliases.set(alias.toLowerCase(), tableName);
                }
            }
            // Pattern: table_name alias (without AS)
            else if (next?.type === 'identifier') {
                // Check it's not a keyword
                const nextText = next.normalized || next.text.toUpperCase();
                const keywords = ['ON', 'WHERE', 'SET', 'JOIN', 'LEFT', 'RIGHT',
                    'INNER', 'OUTER', 'CROSS', 'FULL', 'ORDER', 'GROUP', 'HAVING', 'LIMIT'];
                if (!keywords.includes(nextText)) {
                    const alias = getIdentifierText(next);
                    aliases.set(alias.toLowerCase(), tableName);
                }
            }
        }
    }

    return aliases;
}

/**
 * Gets the word being typed at the cursor position.
 * Returns the partial identifier before the cursor.
 */
export function getWordAtCursor(sql: string, cursorOffset: number): string {
    // Look backwards from cursor for word characters
    let start = cursorOffset;
    while (start > 0 && /[a-zA-Z0-9_]/.test(sql[start - 1])) {
        start--;
    }
    return sql.substring(start, cursorOffset);
}
