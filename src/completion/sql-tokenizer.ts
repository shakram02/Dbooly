/**
 * SQL Tokenizer - A moo-inspired single-pass tokenizer for SQL
 *
 * This tokenizer properly handles:
 * - Line comments (-- comment)
 * - Block comments (/* comment *\/)
 * - Single-quoted strings ('string')
 * - Double-quoted identifiers ("identifier")
 * - Backtick identifiers (`table`)
 * - SQL keywords
 * - Identifiers (table/column names)
 * - Dot notation for qualified names
 */

export type SqlTokenType =
    | 'keyword'
    | 'identifier'
    | 'dot'
    | 'string'
    | 'comment'
    | 'whitespace'
    | 'lparen'
    | 'rparen'
    | 'comma'
    | 'other';

export interface SqlToken {
    type: SqlTokenType;
    text: string;
    offset: number;
    /** Normalized uppercase text for keywords */
    normalized?: string;
}

// SQL keywords we care about for context detection
const SQL_KEYWORDS = new Set([
    'SELECT', 'FROM', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'CROSS', 'FULL',
    'WHERE', 'ORDER', 'GROUP', 'BY', 'ON', 'AS', 'AND', 'OR', 'NOT',
    'INSERT', 'INTO', 'UPDATE', 'SET', 'DELETE', 'HAVING', 'VALUES',
    'LIMIT', 'OFFSET', 'UNION', 'EXCEPT', 'INTERSECT',
    'CREATE', 'ALTER', 'DROP', 'TABLE', 'INDEX', 'VIEW',
    'IN', 'BETWEEN', 'LIKE', 'IS', 'NULL', 'TRUE', 'FALSE',
    'ASC', 'DESC', 'DISTINCT', 'ALL', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'
]);

/**
 * Compiled regex for tokenization.
 * Order matters - first match wins. Comments and strings must come before keywords.
 */
const SQL_TOKEN_REGEX = new RegExp([
    /--[^\n]*/.source,                           // line comment
    /\/\*[\s\S]*?\*\//.source,                   // block comment
    /'(?:[^'\\]|\\.)*'/.source,                  // single-quoted string
    /"(?:[^"\\]|\\.)*"/.source,                  // double-quoted string/identifier
    /`[^`]*`/.source,                            // backtick identifier (MySQL)
    /[a-zA-Z_][a-zA-Z0-9_]*/.source,             // identifier or keyword
    /\./.source,                                 // dot
    /\(/.source,                                 // left paren
    /\)/.source,                                 // right paren
    /,/.source,                                  // comma
    /\s+/.source,                                // whitespace
    /./.source,                                  // any other single char
].join('|'), 'gy');

/**
 * Classifies a matched token text into a token type.
 */
function classifyToken(text: string): SqlTokenType {
    const firstChar = text[0];

    // Line comment
    if (text.startsWith('--')) {
        return 'comment';
    }

    // Block comment
    if (text.startsWith('/*')) {
        return 'comment';
    }

    // Single-quoted string
    if (firstChar === "'") {
        return 'string';
    }

    // Double-quoted string/identifier
    if (firstChar === '"') {
        return 'string';
    }

    // Backtick identifier (MySQL)
    if (firstChar === '`') {
        return 'identifier';
    }

    // Dot
    if (firstChar === '.') {
        return 'dot';
    }

    // Parentheses
    if (firstChar === '(') {
        return 'lparen';
    }
    if (firstChar === ')') {
        return 'rparen';
    }

    // Comma
    if (firstChar === ',') {
        return 'comma';
    }

    // Whitespace
    if (/^\s+$/.test(text)) {
        return 'whitespace';
    }

    // Identifier or keyword
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(text)) {
        const upper = text.toUpperCase();
        if (SQL_KEYWORDS.has(upper)) {
            return 'keyword';
        }
        return 'identifier';
    }

    return 'other';
}

/**
 * Tokenizes SQL text into an array of tokens.
 *
 * @param sql The SQL text to tokenize
 * @returns Array of tokens with type, text, and offset
 */
export function tokenize(sql: string): SqlToken[] {
    const tokens: SqlToken[] = [];

    // Reset regex state
    SQL_TOKEN_REGEX.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = SQL_TOKEN_REGEX.exec(sql)) !== null) {
        const text = match[0];
        const type = classifyToken(text);

        const token: SqlToken = {
            type,
            text,
            offset: match.index
        };

        // Add normalized text for keywords
        if (type === 'keyword') {
            token.normalized = text.toUpperCase();
        }

        tokens.push(token);
    }

    return tokens;
}

/**
 * Tokenizes SQL up to a specific offset (cursor position).
 * Useful for completion where we only care about text before the cursor.
 *
 * @param sql The SQL text to tokenize
 * @param cursorOffset The cursor position (exclusive)
 * @returns Array of tokens before the cursor
 */
export function tokenizeUpTo(sql: string, cursorOffset: number): SqlToken[] {
    const textBeforeCursor = sql.substring(0, cursorOffset);
    return tokenize(textBeforeCursor);
}

/**
 * Filters out tokens that should be ignored for context detection.
 * Removes comments, strings, and whitespace.
 */
export function filterSignificantTokens(tokens: SqlToken[]): SqlToken[] {
    return tokens.filter(t =>
        t.type !== 'comment' &&
        t.type !== 'string' &&
        t.type !== 'whitespace'
    );
}

/**
 * Gets the text content from an identifier token.
 * Handles backtick and double-quoted identifiers by stripping the quotes.
 */
export function getIdentifierText(token: SqlToken): string {
    if (token.type !== 'identifier') {
        return token.text;
    }

    const text = token.text;

    // Backtick-quoted: `identifier`
    if (text.startsWith('`') && text.endsWith('`')) {
        return text.slice(1, -1);
    }

    // Double-quoted: "identifier"
    if (text.startsWith('"') && text.endsWith('"')) {
        return text.slice(1, -1);
    }

    return text;
}
