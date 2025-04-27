import { Connection } from './connection';
import { SqlParameter, fromValue } from './sql-parameter';
/**
 * Create a new database connection
 * @returns A new Connection instance
 */
declare function createConnection(): Connection;
export { Connection, SqlParameter, createConnection, fromValue };
export declare const setLogLevel: (level: number) => void;
export declare const enableConsoleLogging: (enable: boolean) => void;
export declare const setLogFile: (path: string) => void;
declare const _default: {
    Connection: typeof Connection;
    SqlParameter: typeof SqlParameter;
    createConnection: typeof createConnection;
    fromValue: typeof fromValue;
    setLogLevel: (level: number) => void;
    enableConsoleLogging: (enable: boolean) => void;
    setLogFile: (path: string) => void;
};
export default _default;
