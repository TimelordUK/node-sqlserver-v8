/**
 * Created by admin on 19/01/2017.
 */

export module MsNodeSqlDriverModule {

    export interface v8driver {
        open(description: v8ConnectDescription, cb: v8OpenCb): void
        open(conn_str: string, cb: v8OpenCb): void
        query(conn_str: string, sql: string, cb?: v8QueryCb): v8Query
        query(conn_str: string, sql: string, params?: Array<any>, cb?: v8QueryCb): v8Query
        query(conn_str: string, description: v8QueryDescription, cb?: v8QueryCb): v8Query
        query(conn_str: string, description: v8QueryDescription, params?: Array<any>, cb?: v8QueryCb): v8Query
        queryRaw(conn_str: string, description: v8QueryDescription, cb: v8QueryRawCb): v8Query
        queryRaw(conn_str: string, description: v8QueryDescription, params?: Array<any>, cb?: v8QueryRawCb): v8Query
        queryRaw(conn_str: string, sql: string, params?: Array<any>, cb?: v8QueryRawCb): v8Query
        queryRaw(conn_str: string, sql: string, cb: v8QueryRawCb): v8Query
    }

    export interface v8Connection {
        close(cb: v8StatusCb): void
        query(sql: string, cb?: v8QueryCb): v8Query
        query(sql: string, params?: Array<any>, cb?: v8QueryCb): v8Query
        query(description: v8QueryDescription, cb?: v8QueryCb): v8Query
        query(description: v8QueryDescription, params?: Array<any>, cb?: v8QueryCb): v8Query
        queryRaw(description: v8QueryDescription, cb: v8QueryRawCb): v8Query
        queryRaw(description: v8QueryDescription, params?: Array<any>, cb?: v8QueryRawCb): v8Query
        queryRaw(sql: string, params?: Array<any>, cb?: v8QueryRawCb): v8Query
        queryRaw(sql: string, cb: v8QueryRawCb): v8Query
        beginTransaction(cb: v8StatusCb): void
        commit(cb: v8StatusCb): void
        rollback(cb: v8StatusCb): void
        procedureMgr(): v8ProcedureManager
        tableMgr(): v8TableManager
        prepare(sql: string, cb: v8PrepareCb): void
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

    export interface v8BindCb { (cb: v8BulkMgr): void
    }
    export interface v8OpenCb { (err: string, connection: v8Connection): void
    }
    export interface v8QueryCb { (err?: string, rows?: Array<any>, more?: boolean): void
    }
    export interface v8CallProcedureCb { (err?: string, results?: any, rows?: Array<any>): void
    }
    export interface v8QueryRawCb { (err?: string, raw?: RawData, more?: boolean): void
    }
    export interface v8StatusCb { (err?: string): void
    }
    export interface v8PrepareCb { (err?: string, statement?: v8PreparedStatement): void
    }
    export interface v8EventCb { (data: any): void
    }
    export interface v8BulkSelectCb { (err: string, rows: Array<any>): void
    }

    export interface v8BulkMgr {
        getSummary(): any
        selectRows(cols: Array<any>, cb: v8BulkSelectCb): void
        insertRows(rows: Array<any>, cb: v8StatusCb): void
        deleteRows(rows: Array<any>, cb: v8StatusCb): void
        updateRows(rows: Array<any>, cb: v8StatusCb): void
        setBatchSize(size: number): void
        setWhereCols(cols: Array<any>): void
        setUpdateCols(cols: Array<any>): void
    }

    export interface v8ProcedureManager {
        callproc(name: string, params?: Array<any>, cb?: v8CallProcedureCb): void
        setTimeout(timeout: number): void
    }

    export interface v8TableManager {
        bind(tableName: string, cb: v8BindCb): void
    }

    export interface v8PreparedStatement {
        preparedQuery(params?: Array<any>, cb ?: v8QueryCb): void
        free(cb: v8StatusCb): void
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