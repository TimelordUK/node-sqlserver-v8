import { Connection } from './connection';
import { SqlParameter, fromValue, StringParameter, FloatParameter, IntegerParameter, BooleanParameter, DateTimeParameter, NullParameter, ArrayParameter, StringArrayParameter, IntegerArrayParameter, FloatArrayParameter, BooleanArrayParameter, DateTimeArrayParameter, ObjectParameter, TVPParameter, SqlParameterOptions, SqlValue, SqlScalarValue, SqlArrayValue, BindingSpecification, TableValuedParameter, TableColumn } from './sql-parameter';
/**
 * Create a new database connection
 * @returns A new Connection instance
 */
declare function createConnection(): Connection;
export { Connection, SqlParameter, StringParameter, IntegerParameter, FloatParameter, BooleanParameter, DateTimeParameter, NullParameter, ArrayParameter, StringArrayParameter, IntegerArrayParameter, FloatArrayParameter, BooleanArrayParameter, DateTimeArrayParameter, ObjectParameter, TVPParameter, type SqlParameterOptions, type SqlValue, type SqlScalarValue, type SqlArrayValue, type BindingSpecification, type TableValuedParameter, type TableColumn, createConnection, fromValue };
export declare const setLogLevel: (level: number) => void;
export declare const enableConsoleLogging: (enable: boolean) => void;
export declare const setLogFile: (path: string) => void;
declare const _default: {
    Connection: typeof Connection;
    SqlParameter: typeof SqlParameter;
    StringParameter: typeof StringParameter;
    IntegerParameter: typeof IntegerParameter;
    FloatParameter: typeof FloatParameter;
    BooleanParameter: typeof BooleanParameter;
    DateTimeParameter: typeof DateTimeParameter;
    NullParameter: typeof NullParameter;
    ArrayParameter: typeof ArrayParameter;
    StringArrayParameter: typeof StringArrayParameter;
    IntegerArrayParameter: typeof IntegerArrayParameter;
    FloatArrayParameter: typeof FloatArrayParameter;
    BooleanArrayParameter: typeof BooleanArrayParameter;
    DateTimeArrayParameter: typeof DateTimeArrayParameter;
    ObjectParameter: typeof ObjectParameter;
    TVPParameter: typeof TVPParameter;
    createConnection: typeof createConnection;
    fromValue: typeof fromValue;
    setLogLevel: (level: number) => void;
    enableConsoleLogging: (enable: boolean) => void;
    setLogFile: (path: string) => void;
};
export default _default;
