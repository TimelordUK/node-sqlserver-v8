/**
 * Created by admin on 19/01/2017.
 */

export module MsNodeSqlDriverModule {

    export const sqlv8: v8driver = require('msnodesqlv8');

    export interface v8driver {
        open(description: v8ConnectDescription, cb: v8OpenCb): void
        query(description: v8ConnectDescription, query: v8QueryDescription, params?: Array<any>, cb?: v8QueryCb): v8Query
        queryRaw(description: v8QueryDescription, query: v8QueryDescription, params?: Array<any>, cb?: v8QueryRawCb): v8Query
    }

    export interface v8Connection {
        close(cb: v8StatusCb): void
        query(description: v8QueryDescription, params?: Array<any>, cb?: v8QueryCb): v8Query
        queryRaw(description: v8QueryDescription, cb: v8QueryRawCb): v8Query
        beginTransaction(cb: v8StatusCb): void
        commit(cb: v8StatusCb): void
        rollback(cb: v8StatusCb): void
        procedureMgr(): v8ProcedureManager
        tableMgr(): v8TableManager
        prepare(description: v8QueryDescription, cb: v8PrepareCb): void
    }

    export interface v8Query {
        on(name: string, cb: v8EventCb): void
    }

    export interface v8ConnectDescription {
        conn_str: string,
        conn_timeout: number
    }

    export interface v8QueryDescription {
        query_str: string,
        query_timeout: number
    }

    export interface v8Meta {
        name: string,
        nullable: boolean
        size: number
        sqlType: string
        type: string
    }

    export interface RawData {
        meta: Array<v8Meta>
        rows: Array<Array<any>>
    }

    export interface v8BindCb { (cb: bulkMgr): void
    }
    export interface v8OpenCb { (err: string, connection: v8Connection): void
    }
    export interface v8QueryCb { (err: string, rows: Array<any>, more: boolean): void
    }
    export interface v8QueryRawCb { (err: string, raw: RawData, more: boolean): void
    }
    export interface v8StatusCb { (err: string): void
    }
    export interface v8PrepareCb { (statement: v8PreparedStatement): void
    }
    export interface v8EventCb { (data: any): void
    }
    export interface v8BulkSelectCb { (err: string, rows: Array<any>): void
    }

    export interface bulkMgr {
        selectRows(cols: Array<any>, cb: v8BulkSelectCb): void
        insertRows(rows: Array<any>, cb: v8StatusCb): void
        deleteRows(rows: Array<any>, cb: v8StatusCb): void
        updateRows(rows: Array<any>, cb: v8StatusCb): void
        setBatchSize(size: number): void
        setWhereCols(cols: Array<String>): void
        setUpdateCols(cols: Array<String>): void
    }

    export interface v8ProcedureManager {
        callProc(name: string, params?: Array<any>, cb?: v8QueryCb): void
        setTimeout(timeout: number): void
    }

    export interface v8TableManager {
        bind(tableName: string, cb: v8BindCb): void
    }

    export interface v8PreparedStatement {
        preparedQuery(params?: Array<any>, cb ?: v8QueryCb): void
        free(): void
        getSignature(): string
        getId(): number
        getMeta(): Array<v8Meta>
    }

    export enum v8Events {
        meta,
        column,
        rowCount,
        row,
        done,
        error
    }
}