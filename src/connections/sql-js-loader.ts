import * as fs from 'fs';
import * as path from 'path';
import initSqlJs from 'sql.js';

// Cache the sql.js initialization promise
let sqlJsPromise: Promise<initSqlJs.SqlJsStatic> | null = null;
let wasmBinaryPath: string | null = null;

/**
 * Set the path to the WASM binary. Must be called during extension activation
 * with the extension's installation path.
 */
export function setSqlJsWasmPath(extensionPath: string): void {
    wasmBinaryPath = path.join(extensionPath, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
}

/**
 * Get the initialized sql.js instance. Uses cached initialization.
 */
export async function getSqlJs(): Promise<initSqlJs.SqlJsStatic> {
    if (!sqlJsPromise) {
        // Load WASM binary directly if path is set
        if (wasmBinaryPath && fs.existsSync(wasmBinaryPath)) {
            const buffer = fs.readFileSync(wasmBinaryPath);
            // Convert Node.js Buffer to ArrayBuffer
            const wasmBinary = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            sqlJsPromise = initSqlJs({ wasmBinary });
        } else {
            // Fallback: try to locate from node_modules relative to current file
            // This handles the case where extension is bundled
            const fallbackPath = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
            if (fs.existsSync(fallbackPath)) {
                const buffer = fs.readFileSync(fallbackPath);
                const wasmBinary = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
                sqlJsPromise = initSqlJs({ wasmBinary });
            } else {
                // Last resort: let sql.js try to find it (may fail)
                sqlJsPromise = initSqlJs();
            }
        }
    }
    return sqlJsPromise;
}
