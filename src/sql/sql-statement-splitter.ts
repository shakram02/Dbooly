/**
 * SQL Statement Splitter
 *
 * Splits SQL files into individual statements by:
 * 1. Semicolon (;)
 * 2. Two consecutive newlines (blank line)
 */

export interface SqlStatement {
    /** The SQL text of this statement */
    text: string;
    /** Start line (0-indexed) */
    startLine: number;
    /** End line (0-indexed, inclusive) */
    endLine: number;
    /** Start character offset in original text */
    startOffset: number;
    /** End character offset in original text */
    endOffset: number;
}

/**
 * Splits SQL text into individual statements.
 *
 * @param text The full SQL file content
 * @returns Array of SQL statements with their positions
 */
export function splitSqlStatements(text: string): SqlStatement[] {
    const statements: SqlStatement[] = [];

    // Split by semicolon or double newline, keeping track of positions
    let currentStart = 0;
    let currentStartLine = 0;
    let i = 0;
    let lineNum = 0;

    while (i < text.length) {
        const char = text[i];

        // Check for semicolon
        if (char === ';') {
            const stmtText = text.slice(currentStart, i + 1);
            const trimmed = stmtText.trim();

            if (trimmed.length > 0) {
                statements.push({
                    text: stmtText,
                    startLine: currentStartLine,
                    endLine: lineNum,
                    startOffset: currentStart,
                    endOffset: i + 1
                });
            }

            currentStart = i + 1;
            currentStartLine = lineNum;
            // Adjust start line if we're at end of line
            if (i + 1 < text.length && text[i + 1] === '\n') {
                currentStartLine = lineNum + 1;
            }
        }
        // Check for double newline (blank line)
        else if (char === '\n' && i + 1 < text.length && text[i + 1] === '\n') {
            const stmtText = text.slice(currentStart, i);
            const trimmed = stmtText.trim();

            if (trimmed.length > 0) {
                statements.push({
                    text: stmtText,
                    startLine: currentStartLine,
                    endLine: lineNum,
                    startOffset: currentStart,
                    endOffset: i
                });
            }

            // Skip past the blank line(s)
            while (i < text.length && text[i] === '\n') {
                if (text[i] === '\n') lineNum++;
                i++;
            }

            currentStart = i;
            currentStartLine = lineNum;
            continue; // Don't increment i again
        }

        if (char === '\n') {
            lineNum++;
        }
        i++;
    }

    // Don't forget the last statement
    if (currentStart < text.length) {
        const stmtText = text.slice(currentStart);
        const trimmed = stmtText.trim();

        if (trimmed.length > 0) {
            statements.push({
                text: stmtText,
                startLine: currentStartLine,
                endLine: lineNum,
                startOffset: currentStart,
                endOffset: text.length
            });
        }
    }

    return statements;
}

/**
 * Finds which statement contains a given line number.
 */
export function findStatementAtLine(statements: SqlStatement[], lineNum: number): SqlStatement | null {
    for (const stmt of statements) {
        if (lineNum >= stmt.startLine && lineNum <= stmt.endLine) {
            return stmt;
        }
    }
    return null;
}
