/**
 * Created by admin on 19/01/2017.
 */

export module MsNodeSqlDriverApiModule {

    export interface v8driver {
        open(description: v8ConnectDescription, cb: v8OpenCb): void
        open(conn_str: string, cb: v8OpenCb): void
        query(conn_str: string, sql: string, cb?: v8QueryCb): v8Query
        query(conn_str: string, sql: string, params?: any[], cb?: v8QueryCb): v8Query
        query(conn_str: string, description: v8QueryDescription, cb?: v8QueryCb): v8Query
        query(conn_str: string, description: v8QueryDescription, params?: any[], cb?: v8QueryCb): v8Query
        queryRaw(conn_str: string, description: v8QueryDescription, cb: v8QueryRawCb): v8Query
        queryRaw(conn_str: string, description: v8QueryDescription, params?: any[], cb?: v8QueryRawCb): v8Query
        queryRaw(conn_str: string, sql: string, params?: any[], cb?: v8QueryRawCb): v8Query
        queryRaw(conn_str: string, sql: string, cb: v8QueryRawCb): v8Query
        Bit(v:number): any;
        BigInt(v:number): any;
        Int(v:number): any;
        TinyInt(v:number): any;
        SmallInt(v:number): any;
        Float(v:number): any;
        Numeric(v:number): any;
        Money(v:number): any;
        SmallMoney(v:number): any;
        Decimal(v:number): any;
        Double(v:number): any;
        Real(v:number): any;
        WVarChar(v:String) : any;
        Char(v:String) : any;
        VarChar(v:String) : any;
        NChar(v:String) : any;
        NVarChar(v:String) : any;
        Text(v:String) : any;
        NText(v:String) : any;
        Xml(v:String) : any;
        WLongVarChar(v:string) : any;
        UniqueIdentifier(v:String) : any;
        VarBinary(v:any) : any;
        LongVarBinary(v:any) : any;
        Image(v:any) : any;
        Time(v:Date) : any;
        Date(v:Date) : any;
        DateTime(v:Date) : any;
        DateTime2(v:Date) : any;
        DateRound(v:Date) : any;
        SmallDateTime(v:Date) : any;
        DateTimeOffset(v:Date) : any;
    }

    export interface v8Connection {
        id:number;
        close(cb: v8StatusCb): void
        query(sql: string, cb?: v8QueryCb): v8Query
        query(sql: string, params?: any[], cb?: v8QueryCb): v8Query
        query(description: v8QueryDescription, cb?: v8QueryCb): v8Query
        query(description: v8QueryDescription, params?: any[], cb?: v8QueryCb): v8Query
        queryRaw(description: v8QueryDescription, cb: v8QueryRawCb): v8Query
        queryRaw(description: v8QueryDescription, params?: any[], cb?: v8QueryRawCb): v8Query
        queryRaw(sql: string, params?: any[], cb?: v8QueryRawCb): v8Query
        queryRaw(sql: string, cb: v8QueryRawCb): v8Query
        beginTransaction(cb?: v8StatusCb): void
        commit(cb?: v8StatusCb): void
        rollback(cb?: v8StatusCb): void
        procedureMgr(): v8ProcedureManager
        tableMgr(): v8TableManager
        prepare(sql: string, cb: v8PrepareCb): void
        setFilterNonCriticalErrors(flag:boolean):void
    }

    export interface v8Query {
        on(name: string, cb: v8EventCb): void
        on(name: string, cb: v8EventColumnCb): void
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

    export interface v8Error
    {
        message:string
        sqlstate: string
        code: number
    }

    export interface v8RawData {
        meta: v8Meta[]
        rows: Array<any[]>
    }

    export interface v8BindCb { (cb: v8BulkTableMgr): void
    }
    export interface v8OpenCb { (err: v8Error, connection: v8Connection): void
    }
    export interface v8QueryCb { (err?: v8Error, rows?: any[], more?: boolean): void
    }
    export interface v8CallProcedureCb { (err?: v8Error, rows?: any[], outputParams?:any[]): void
    }
    export interface v8QueryRawCb { (err?: v8Error, raw?: v8RawData, more?: boolean): void
    }
    export interface v8StatusCb { (err?: v8Error): void
    }
    export interface v8PrepareCb { (err?: v8Error, statement?: v8PreparedStatement): void
    }
    export interface v8EventCb { (data: any): void
    }
    export interface v8EventColumnCb { (colIndex: number, data:any, more:boolean): void
    }
    export interface v8BulkSelectCb { (err: v8Error, rows: any[]): void
    }
    export interface v8DescribeProcedureCb { (description?: v8ProcedureSummary): void
    }

    export interface v8TableColumn {
        table_catalog: string
        table_schema: string
        table_name: string
        name: string
        type: string
        max_length: number
        precision: number
        scale: number
        is_nullable: boolean
        is_computed: boolean
        is_identity: boolean
        object_id: number
        is_primary_key: boolean
        is_foreign_key: 0
    }

    export interface v8BulkMgrSummary {
        insert_signature: string
        where_columns: v8TableColumn[]
        update_columns: v8TableColumn[]
        select_signature: string
        delete_signature: string
        update_signature: string
        columns: v8TableColumn[]
    }

    export interface v8BulkTableMgr {
        getSummary(): v8BulkMgrSummary
        selectRows(cols: any[], cb: v8BulkSelectCb): void
        insertRows(rows: any[], cb: v8StatusCb): void
        deleteRows(rows: any[], cb: v8StatusCb): void
        updateRows(rows: any[], cb: v8StatusCb): void
        setBatchSize(size: number): void
        setWhereCols(cols: any[]): void
        setUpdateCols(cols: any[]): void
    }

    export interface v8ProcedureParam {
        is_output: boolean
        name: string
        type_id: string
        max_length: number
        order: number
        update_signature: string
        collation: any
        val: any
    }

    export interface v8ProcedureSummary {
        signature: string
        summary: string
        params: v8ProcedureParam[]
    }

    export interface v8ProcedureManager {
        callproc(name: string, params?: any[], cb?: v8CallProcedureCb): v8Query
        describe(name: string, cb?: v8DescribeProcedureCb): void
        setTimeout(timeout: number): void
    }

    export interface v8TableManager {
        bind(tableName: string, cb: v8BindCb): void
    }

    export interface v8PreparedStatement {
        preparedQuery(params?: any[], cb ?: v8QueryCb): void
        free(cb: v8StatusCb): void
        getSignature(): string
        getId(): number
        getMeta(): v8Meta[]
    }

    export abstract class v8QueryEvent {
        public static meta = 'meta';
        public static column = 'column';
        public static rowCount = 'rowCount';
        public static row = 'row';
        public static done = 'done';
        public static error = 'error';
        public static closed = 'closed';
    }

}