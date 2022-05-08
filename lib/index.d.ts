/**
 * Created by admin on 19/01/2017.
 */

export interface AggregatorPromises {
    query(sql: string, params?: any[], options?: QueryAggregatorOptions): Promise<QueryAggregatorResults>
    callProc(name: string, params?: any, options?: QueryAggregatorOptions): Promise<QueryAggregatorResults>
}
   
interface SqlClientPromises  {
    query(conn_str: string, sql: string, params?: any[], options?: QueryAggregatorOptions): Promise<QueryAggregatorResults>
    callProc(conn_str: string, name: string, params?: any, options?: QueryAggregatorOptions): Promise<QueryAggregatorResults>
    open(conn_str: string): Promise<Connection>
}

export interface SqlClient {
    promises: SqlClientPromises
    open(description: ConnectDescription, cb: OpenCb): void
    open(conn_str: string, cb: OpenCb): void
    query(conn_str: string, sql: string, cb?: QueryCb): Query
    query(conn_str: string, sql: string, params?: any[], cb?: QueryCb): Query
    query(conn_str: string, description: QueryDescription, cb?: QueryCb): Query
    query(conn_str: string, description: QueryDescription, params?: any[], cb?: QueryCb): Query
    queryRaw(conn_str: string, description: QueryDescription, cb: QueryRawCb): Query
    queryRaw(conn_str: string, description: QueryDescription, params?: any[], cb?: QueryRawCb): Query
    queryRaw(conn_str: string, sql: string, params?: any[], cb?: QueryRawCb): Query
    queryRaw(conn_str: string, sql: string, cb: QueryRawCb): Query
    Bit(v:number): any
    BigInt(v:number): any
    Int(v:number): any
    TinyInt(v:number): any
    SmallInt(v:number): any
    Float(v:number): any
    Numeric(v:number): any
    Money(v:number): any
    SmallMoney(v:number): any
    Decimal(v:number): any
    Double(v:number): any
    Real(v:number): any
    WVarChar(v:String) : any
    Char(v:String) : any
    VarChar(v:String) : any
    NChar(v:String) : any
    NVarChar(v:String) : any
    Text(v:String) : any
    NText(v:String) : any
    Xml(v:String) : any
    WLongVarChar(v:string) : any
    UniqueIdentifier(v:String) : any
    VarBinary(v:any) : any
    LongVarBinary(v:any) : any
    Image(v:any) : any
    Time(v:Date) : any
    Time2(v:Date) : any
    Date(v:Date) : any
    DateTime(v:Date) : any
    DateTime2(v:Date) : any
    DateRound(v:Date) : any
    SmallDateTime(v:Date) : any
    DateTimeOffset(v:Date) : any
    PollingQuery(s:string) : QueryDescription
    TimeoutQuery(s:string, to:number) : QueryDescription
    TzOffsetQuery(s:string, offsetMinutes?:number) : QueryDescription
    TvpFromTable(table:Table) : ProcedureParam
    Pool: { (options:PoolOptions) : Pool } & { new (options:PoolOptions) : Pool }
}

export interface Table {
    name:string
    rows: any[]
    columns: TableColumn[]
    addRowsFromObjects(vec:any) : void
}

export interface PoolOptions {
    floor?: number
    ceiling?: number
    heartbeatSecs?: number
    heartbeatSql?: string
    inactivityTimeoutSecs?: number
    useUTC?: boolean
    useNumericString?: boolean
    connectionString: string
}

export interface QueryAggregatorResults {
    elapsed: number // elapsed ms for call to complete
    meta: Meta[][] // array of meta for each query
    first: any[] // first set of rows i.e. results[0] if any else null
    results: any[][] // each result set either as array of arrays or array of objects
    output: any[] // output params if any
    info: string[] // prints from procedure collected
    counts: number[] // row counts returned from update, insert, delete statements.
    returns: any // return code from procedure
    errors: Error[] // errors collected by running sql (up to promise reject)
  }

export interface QueryAggregatorOptions {
    timeoutMs?: number // default 0 i.e. no timeout
    raw?: boolean // results as arrays or objects with column names
}

export interface PoolPromises extends AggregatorPromises {
    open(): Promise<Pool>
    close(): Promise<any>
}

export interface Pool  {
    promises: PoolPromises
    open(cb?: PoolOpenCb): void
    close(cb: StatusCb): void
    query(sql: string, cb?: QueryCb): Query
    query(sql: string, params?: any[], cb?: QueryCb): Query
    query(description: QueryDescription, cb?: QueryCb): Query
    query(description: QueryDescription, params?: any[], cb?: QueryCb): Query
    queryRaw(description: QueryDescription, cb: QueryRawCb): Query
    queryRaw(description: QueryDescription, params?: any[], cb?: QueryRawCb): Query
    queryRaw(sql: string, params?: any[], cb?: QueryRawCb): Query
    queryRaw(sql: string, cb: QueryRawCb): Query
    // pool.on('debug', msg => { console.log(msg) })
    on(debug: string, cb?: MessageCb): void 
    // pool.on('open', options = {} )
    on(open: string, cb?: PoolOptionsEventCb): void
    // pool.on('error', err = {} )
    on(error: string, err?: StatusCb): void
    // pool.on('submitted', q => {} )
    on(submitted: string, query?: QueryDescriptionCb): void
     // pool.on('status', q => {} )
    on(status: string, statusRecord?: PoolStatusRecordCb): void
}

export interface TableColumnType {
    declaration:string
    length:string
}

export interface TableColumn {
    ordinal_position: number,
    table_catalog: string,
    table_schema: string,
    table_name: string,
    column_default: string,
    name: string,
    type: string,
    max_length: number,
    precision: number,
    scale: number,
    is_nullable: number,
    is_computed: number,
    is_identity: number,
    object_id: number,
    generated_always_type: bigint,
    generated_always_type_desc: string,
    is_hidden: number,
    is_primary_key: number,
    is_foreign_key: number

    // helper methods when manually adding tables with table builder
    isComputed (v?: number): TableColumn
    asExpression(s: string): TableColumn // 'AS ([OrganizationNode].[GetLevel]())'
    isIdentity (v:number, start?:number, inc?:number): TableColumn
    isHidden (v: number): TableColumn
    isPrimaryKey (v: number): TableColumn
    isForeignKey (v: number): TableColumn 
    asBit (): TableColumn 
    asInt (): TableColumn
    asBigInt (): TableColumn
    asSmallInt (): TableColumn
    asTinyInt (): TableColumn
    asNVarCharMax (): TableColumn 
    asNVarChar (length: number): TableColumn 
    asVarChar (length: number): TableColumn 
    asDate (): TableColumn 
    asTime (): TableColumn 
    asDateTime (): TableColumn
    asDateTimeOffset (): TableColumn
    asSmallMoney (): TableColumn 
    asNumeric (precision: number, length: number): TableColumn 
    asDecimal (precision: number, scale: number): TableColumn 
    asUniqueIdentifier (): TableColumn 
    asHierarchyId (): TableColumn 
    asVarBiary (length: number): TableColumn 
    asReal (): TableColumn 
    asNChar (length: number): TableColumn
}

interface ConnectionPromises extends AggregatorPromises {
    prepare(sql: string): Promise<PreparedStatement>
    getTable(name: string): Promise<BulkTableMgr>
    getProc(name: string): Promise<ProcedureDefinition>
    getUserTypeTable(name: string): Promise<Table>
    close(): Promise<any>
    cancel(name: string): Promise<any>
    beginTransaction(): Promise<any>
    commit(): Promise<any>
    rollback(): Promise<any>
}

export interface Connection {
    promises: ConnectionPromises
    getUserTypeTable(name: string, cb:TableCb):void
    id:number
    setUseUTC(utc:boolean):void
    getUseUTC():boolean
    // optionally return all number based columns as strings
    setUseNumericString(numericString:boolean):void
    getUseNumericString():boolean
    close(cb: StatusCb): void
    query(sql: string, cb?: QueryCb): Query
    query(sql: string, params?: any[], cb?: QueryCb): Query
    query(description: QueryDescription, cb?: QueryCb): Query
    query(description: QueryDescription, params?: any[], cb?: QueryCb): Query
    queryRaw(description: QueryDescription, cb: QueryRawCb): Query
    queryRaw(description: QueryDescription, params?: any[], cb?: QueryRawCb): Query
    queryRaw(sql: string, params?: any[], cb?: QueryRawCb): Query
    queryRaw(sql: string, cb: QueryRawCb): Query
    beginTransaction(cb?: StatusCb): void
    commit(cb?: StatusCb): void
    rollback(cb?: StatusCb): void
    procedureMgr(): ProcedureManager
    tableMgr(): TableManager
    pollingMode(q: Query, v:boolean, cb?: SimpleCb): void
    cancelQuery(q: Query, cb?: StatusCb): void
    prepare(sql: string, cb: PrepareCb): void
    prepare(description: QueryDescription, cb: PrepareCb): void
    setFilterNonCriticalErrors(flag:boolean):void
    callproc(name: string, params?: any[], cb?: CallProcedureCb): Query
    callprocAggregator(name: string, params?: any, optons?: QueryAggregatorOptions): Promise<QueryAggregatorResults>
}

export interface Query {
    on(name: string, cb: SubmittedEventCb): void
    on(name: string, cb: EventCb): void
    on(name: string, cb: EventColumnCb): void
    cancelQuery(qcb?: StatusCb): void
    pauseQuery(qcb?: StatusCb): void
    resumeQuery(qcb?: StatusCb): void
    isPaused(): boolean
}

export interface ConnectDescription {
    conn_str: string
    conn_timeout: number
}

export interface QueryDescription {
    query_str: string
    numeric_string?: boolean // for BigInt can return string to avoid overflow
    query_timeout?: number
    query_polling?: boolean
    query_tz_adjustment?: number
}

export interface Meta {
    name: string
    nullable: boolean
    size: number
    sqlType: string
    type: string
}

export interface Error
{
    code?: number
    severity?: number
    lineNumber?: number
    serverName?: string
    procName?: string
    message:string
    sqlstate?: string   
}

export interface RawData {
    meta: Meta[]
    rows: Array<any[]>
}

export interface PoolStatusRecord {
    time: Date,
    parked: number,
    idle: number,
    busy: number,
    pause: number,
    parking: number,
    workQueue: number,
    activity: string,
    op: string
    lastSql?: string
  }

export interface PoolStatusRecordCb { (status: PoolStatusRecord): void
}
export interface QueryDescriptionCb { (description: QueryDescription): void
}
export interface MessageCb { (msg: string): void
}
export interface PoolOptionsEventCb { (options: PoolOptions): void
}
export interface PoolOpenCb { (err: Error, options: PoolOptions): void
}
export interface SimpleCb { (): void
}
export interface TableCb { (err: Error, table: Table): void
}
export interface BindCb { (cb: BulkTableMgr): void
}
export interface GetTableCb { (err: Error, table: BulkTableMgr): void
}
export interface OpenCb { (err: Error, connection: Connection): void
}
export interface QueryCb { (err?: Error, rows?: any[], more?: boolean): void
}
export interface CallProcedureCb { (err?: Error, rows?: any[], outputParams?:any[]): void
}
export interface QueryRawCb { (err?: Error, raw?: RawData, more?: boolean): void
}
export interface StatusCb { (err?: Error): void
}
export interface PrepareCb { (err?: Error, statement?: PreparedStatement): void
}
export interface EventCb { (data: any): void
}
export interface SubmittedEventCb { (sql: string, params:any[]): void
}
export interface EventColumnCb { (colIndex: number, data:any, more:boolean): void
}
export interface BulkSelectCb { (err: Error, rows: any[]): void
}
export interface DescribeProcedureCb { (description?: ProcedureSummary): void
}
export interface GetProcedureCb { (procedure?: ProcedureDefinition): void
}
export interface GetProcCb { (err:Error, procedure?: ProcedureDefinition): void
}
export interface BulkMgrSummary {
    insertSignature: string
    whereColumns: TableColumn[]
    updateColumns: TableColumn[]
    selectSignature: string
    deleteSignature: string
    updateSignature: string
    columns: TableColumn[]
    primaryColumns: TableColumn[]
    assignableColumns: TableColumn
}

export interface BulkTableMgrPromises
{
    select(cols: any[]): Promise<any[]>
    insert(rows: any[]): Promise<any>
    delete(rows: any[]): Promise<any>
    update(rows: any[]): Promise<any>
}

export interface BulkTableMgr {
    promises: BulkTableMgrPromises
    getSummary(): BulkMgrSummary
    asUserType(name:string): string
    // the driver will be sent column types in table rather than deriving from data
    // necessary to switch on for TZ adjustment i.e. for non UTC times sent
    useMetaType(yn:boolean): void
    selectRows(cols: any[], cb: BulkSelectCb): void
    insertRows(rows: any[], cb: StatusCb): void
    deleteRows(rows: any[], cb: StatusCb): void
    updateRows(rows: any[], cb: StatusCb): void
    setBatchSize(size: number): void
    setWhereCols(cols: any[]): void
    setUpdateCols(cols: any[]): void
    getInsertSignature(): string
    getSelectSignature(): string
    getDeleteSignature(): string
    getUpdateSignature(): string
    getColumnsByName(): TableColumn[]
    getWhereColumns(): TableColumn[]
    getUpdateColumns(): TableColumn[]
    getPrimaryColumns(): TableColumn[]
    getAssignableColumns(): TableColumn[]
    // insert only - use bcp for increased bcp speed - 
    // only works on ODBC Driver 17 for SQL Server
    setUseBcp(bcp:boolean):void
    getUseBcp():boolean
    // for a set of objects abstract primary key fields only
    keys(vec:any[]): any[]
}

export interface TableValueParam {
    /*
type_name	column_id	ordered_column	column_name	data_type	nullable	length	precision	scale	collation
dbo.PersonTVP	1	01: vFirstName	vFirstName	varchar		255	0	0	SQL_Latin1_General_CP1_CI_AS
dbo.PersonTVP	2	02: vLastName	vLastName	varchar		255	0	0	SQL_Latin1_General_CP1_CI_AS
dbo.PersonTVP	3	03: vAddress	vAddress	varchar		255	0	0	SQL_Latin1_General_CP1_CI_AS
dbo.PersonTVP	4	04: vCity	vCity	varchar		255	0	0	SQL_Latin1_General_CP1_CI_AS
        */

    name:string
    column_id:number
    ordered_column:string
    column_name:string
    type_id:string
    data_type:string
    nullable:string
    length:number
    precision:number
    scale:number
    collation:number
}

export interface ProcedureParam {
    table_value_param?:TableValueParam[]
    is_user_defined?:boolean
    is_output: boolean
    name: string
    type_id: string
    max_length: number
    order: number
    update_signature: string
    collation: any
    val: any
}

export interface ProcedureDefinition
{
    setDialect(dialect: ServerDialect): boolean
    paramsArray(params: any[]): any[]
    call(params?: any[], cb?: CallProcedureCb): Query
    setTimeout(to:number): void
    setPolling(polling: boolean) : void
    getMeta(): ProcedureSummary
    getName(): string
}

export interface ProcedureSummary {
    select:string
    signature: string
    summary: string
    params: ProcedureParam[]
}

/*
  user define and register a proc e.g. for Sybase Adaptive Server

   @last_name varchar(30) = "knowles", 
  @first_name varchar(18) = "beyonce" as 
  select @first_name + " " + @last_name `

  const connection = await sql.promises.open(connectionString)
  const pm = connection.procedureMgr()
  const spName = 'tmp_name_concat'
  const params = [
    pm.makeParam(spName, '@last_name', 'varchar', 30, false),
    pm.makeParam(spName, '@first_name', 'varchar', 18, false)
  ]

  pm.addProc(spName, params)
*/

export interface ProcedureManager {
    /**
     * @deprecated Please use `getProc`
     */
    get(name:string, cb?:GetProcedureCb):void  // cannot promisify (proc)
    getProc(name:string, cb?:GetProcCb):void // promise friendly (err, proc)
    callproc(name: string, params?: any[], cb?: CallProcedureCb): Query
    makeParam (procName: string, paramName: string, paramType: string, paramLength: number, isOutput: boolean): ProcedureParamMeta
    addProc (name: string, paramVector: ProcedureParamMeta[]): ProcedureDefinition
    describe(name: string, cb?: DescribeProcedureCb): void
    setTimeout(timeout: number): void
    setPolling(poll:boolean):void;
    ServerDialect:ServerDialect
}

export interface ProcedureParamMeta {
        proc_name: string,
        type_desc: string,
        object_id: number,
        has_default_value: boolean,
        default_value: string,
        is_output: boolean,
        name: string,
        type_id: string,
        max_length: number,
        order: number,
        collation: string,
        is_user_defined: boolean
}

/*
        const tableName = 'tmpTableBuilder'
        const mgr = theConnection.tableMgr()
        const builder = mgr.makeBuilder(tableName, 'scratch')

        builder.addColumn('id').asInt().isPrimaryKey(1)
        builder.addColumn('col_a').asInt()
        builder.addColumn('col_b').asVarChar(100)
        builder.addColumn('col_c').asInt()
        builder.addColumn('col_d').asInt()
        builder.addColumn('col_e').asVarChar(100)

        const table = builder.toTable()
        await builder.drop()
        await builder.create()
        const vec = getVec(20)
*/

export interface ServerDialect {
    SqlServer: ServerDialect
    Sybase: ServerDialect
}

export interface TableBuilder {
    // can use utility method e.g. builder.addColumn('col_b').asVarChar(100)
    addColumn (columnName: string, columnType?: string, maxLength?:number, isPrimaryKey?: number): TableColumn
     // builder.setDialect(mgr.ServerDialect.Sybase)
    setDialect(dialect: ServerDialect): boolean
    compute () : void
    toTable () : BulkTableMgr
    drop (): Promise<any> 
    create (): Promise<any>
    truncate () : Promise<any>
    clear (): void
    dropTableSql: string
    createTableSql: string
    clusteredSql: string
    selectSql: string
    insertSql: string
    truncateSql: string
    paramsSql: string
    insertParamsSql: string
  }

export interface TableManager {
    /**
     * @deprecated Please use `getTable`
     */
    bind(tableName: string, cb: BindCb): void // cannot promisify (table)
    getTable(tableName: string, cb: GetTableCb): void // promise friendly (err, table)
    // manually register a table
    addTable(tableName: string, cols: TableColumn[]): BulkTableMgr
    // utility class to help manually add tables
    makeBuilder (tableName: string, tableCatelog?: string, tableSchema?: string): TableBuilder
    // or use builder to build columns
    ServerDialect:ServerDialect
    makeColumn (tableName: string, tableSchema: string, position: number, columnName: string, paramType: string, paramLength: number, isPrimaryKey: number): TableColumn
}

export interface PreparedPromises {
    free(): Promise<any>
    query(params?: any[], options?: QueryAggregatorOptions) : Promise<QueryAggregatorResults>
}

export interface PreparedStatement {
    promises: PreparedPromises
    preparedQuery(params?: any[], cb ?: QueryCb): Query
    free(cb: StatusCb): void
    getSignature(): string
    getId(): number
    getMeta(): Meta[]
}

export enum QueryEvent {
    meta = 'meta',
    column = 'column',
    partial = 'partial',
    rowCount = 'rowCount',
    row = 'row',
    done = 'done',
    free = 'free',
    error = 'error',
    warning = 'warning',
    closed = 'closed',
    submitted = 'submitted',
    output = 'output'
}
