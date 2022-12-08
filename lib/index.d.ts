/**
 * Created by admin on 19/01/2017.
 */
import * as buffer from "buffer";

interface AggregatorPromises {
    query(sql: string, params?: any[], options?: QueryAggregatorOptions): Promise<QueryAggregatorResults>
    callProc(name: string, params?: any, options?: QueryAggregatorOptions): Promise<QueryAggregatorResults>
}

interface SqlClientPromises  {
    query(conn_str: string, sql: string, params?: any[], options?: QueryAggregatorOptions): Promise<QueryAggregatorResults>
    /**
     * adhoc call to a stored procedure using a connection string, proc name and params
     * @param conn_str - the connection string
     * @param name - the name of the stored proc to call
     * @param params - optional params for the proc
     * @param options - query options such as timeout.
     * @returns promise to await for results from query.
     */
    callProc(conn_str: string, name: string, params?: any, options?: QueryAggregatorOptions): Promise<QueryAggregatorResults>
    /**
     * open a connection to server using an odbc style connection string.
     * @param conn_str - the connection string
     * @returns - a promise to await for a new connection to the database
     */
    open(conn_str: string): Promise<Connection>
}

interface Table {
    name:string
    rows: any[]
    columns: TableColumn[]
    addRowsFromObjects(vec:any) : void
}

interface PoolOptions {
    /**
     * minimum number of connections to keep open even when quiet.
     */
    floor?: number
    /**
     * never exceed this many open connections, work will queue.
     */
    ceiling?: number
    /**
     * during no activity a heartbeat is sent every interval to check connection
     */
    heartbeatSecs?: number
    /**
     * override the sql used to test the connection
     */
    heartbeatSql?: string
    /**
     * if no queries for this period issued close connection and reopen when required.
     */
    inactivityTimeoutSecs?: number
    /**
     * convert date time cols to UTC
     */
    useUTC?: boolean
    /**
     * avoid bigint overflow return string
     */
    useNumericString?: boolean,
    /**
     * nvarchar(max) prepared columns must be constrained (Default 8k)
     */
    maxPreparedColumnSize?: number,
    /**
     * the connection string used for each connection opened in pool
     */
    connectionString: string
}

interface QueryAggregatorResults {
    /**
     * elapsed ms for call to complete
     */
    elapsed: number
    /**
     * array of meta for each query i.e. an array of arrays of data per column
     */
    meta: Meta[][]
    /**
     * first set of rows i.e. results[0] if any else null
     */
    first: any[]
    /**
     * each result set either as array of arrays or array of objects
     */
    results: any[][]
    /**
     * output params if any from a proc call
     */
    output: any[]
    /**
     * prints from procedure collected
     */
    info: string[]
    /**
     * row counts returned from update, insert, delete statements.
     */
    counts: number[]
    /**
     * return code from procedure
     */
    returns: any
    /**
     * errors collected by running sql (up to promise reject)
     */
    errors: Error[] //
  }

interface QueryAggregatorOptions {
    /**
     * default 0 i.e. no timeout - else force query to cancel early
     */
    timeoutMs?: number
    /**
     * results as arrays or objects with column names
     */
    raw?: boolean
    /**
     * replace meta empty col name with Column0, Column1
     */
    replaceEmptyColumnNames?: boolean
}

interface PoolPromises extends AggregatorPromises {
    /**
     * open connections to database and ready pool for use.
     * @returns promise returning pool when connections are up.
     */
    open(): Promise<Pool>
    /**
     * terminate all open connections.
     * @returns promise to await for close to complete.
     */
    close(): Promise<any>
    getUserTypeTable(name: string): Promise<Table>

    /**
     * fetch a table definition which can be used for bulk insert operations
     * @param name of table to bind too
     * @returns promise of bound table with methods to insert objects.
     */
    getTable(name: string): Promise<BulkTableMgr>

    /**
     * fetch a stored procedure definition which can be called with
     * correctly bound parameter types.
     * @param name of stored procedure to fetch.
     * @returns promise of bound proc to call.
     */
    getProc(name: string): Promise<ProcedureDefinition>
}

declare class Pool  {
    constructor(poolOptions: PoolOptions)
    promises: PoolPromises
    getUseUTC():boolean
    setUseUTC(utc: boolean): void
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
    isClosed(): boolean
    /**
     * event subscription for debug
     * e.g. pool.on('debug', msg => { console.log(msg) })
     * @param debug 'debug' as string
     * @param cb callback containing txt status update messages for debug
     */
    on(debug: string, cb?: MessageCb): void
    /**
     * event subscription for when pool is opened.
     * e.g. pool.on('open', options = {} )
     * @param open 'open' as string
     * @param cb callback containing options on opened pool.
     */
    on(open: string, cb?: PoolOptionsEventCb): void
    /**
     * event subscription for when error is raised.
     * e.g. pool.on('error', err = {} )
     * @param error 'error' as string
     * @param err cb containing the raised error
     */
    on(error: string, err?: StatusCb): void
    /**
     * event subscription for when query is submitted on connection.
     * pool.on('submitted', q => {} )
     * @param submitted 'submitted' as string
     * @param query cb containing the query submited to server.
     */
    on(submitted: string, query?: QueryDescriptionCb): void
    /**
     * event subscription for when status is raised by pool from state update
     * e.g. pool.on('status', q => {} )
     * @param status 'status' as string
     * @param statusRecord cb containing the status based on pool state.
     */
    on(status: string, statusRecord?: PoolStatusRecordCb): void
}

interface TableColumn {
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

    procTyped(): string
    // sql declared type used by table builder / user type
    typed(user?: boolean, withDecorator?: boolean):string
    // is column considered readonly based on is_computed etc
    isReadOnly(): boolean
    // based on type - is date field requiring tz adjustment
    isTzAdjusted(): boolean
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
    asTime (scale?: number): TableColumn
    asDateTime2 (): TableColumn
    asDateTime (): TableColumn
    asDateTimeOffset (): TableColumn
    asMoney (): TableColumn
    asSmallMoney (): TableColumn
    asNumeric (precision: number, length: number): TableColumn
    asDecimal (precision: number, scale: number): TableColumn
    asUniqueIdentifier (): TableColumn
    asHierarchyId (): TableColumn
    asVarBiary (length: number): TableColumn
    asFloat (scale: number): TableColumn
    asReal (): TableColumn
    asNChar (length: number): TableColumn
    asChar (length: number): TableColumn
    withDecorator (v: string): TableColumn
    notNull(): TableColumn
    null(): TableColumn
}

interface ConnectionPromises extends AggregatorPromises {
    prepare(sql: string | QueryDescription): Promise<PreparedStatement>
    getTable(name: string): Promise<BulkTableMgr>
    getProc(name: string): Promise<ProcedureDefinition>
    getUserTypeTable(name: string): Promise<Table>
    close(): Promise<any>
    cancel(name: string): Promise<any>
    beginTransaction(): Promise<any>
    commit(): Promise<any>
    rollback(): Promise<any>
}

interface Connection {
    promises: ConnectionPromises
    getUserTypeTable(name: string, cb:TableCb):void
    id:number
    setUseUTC(utc:boolean):void
    getUseUTC():boolean
    // optionally return all number based columns as strings
    setUseNumericString(numericString:boolean):void
    getUseNumericString():boolean
    // set max length of prepared strings or binary columns
    setMaxPreparedColumnSize(size:number):void
    getMaxPreparedColumnSize():number
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
    isClosed(): boolean
}

interface Query {
    on(name: string, cb: SubmittedEventCb): void
    on(name: string, cb: EventCb): void
    on(name: string, cb: EventColumnCb): void
    cancelQuery(qcb?: StatusCb): void
    pauseQuery(qcb?: StatusCb): void
    resumeQuery(qcb?: StatusCb): void
    isPaused(): boolean
}

interface ConnectDescription {
    conn_str: string
    conn_timeout: number
}

interface QueryDescription {
    query_str: string
    numeric_string?: boolean // for BigInt can return string to avoid overflow
    query_timeout?: number
    query_polling?: boolean
    query_tz_adjustment?: number,
    // constrain nvarchar(max) for prepared statements
    max_prepared_column_size?: number
}

interface Meta {
    name: string
    nullable: boolean
    size: number
    sqlType: string
    type: string
}

interface Error
{
    code?: number
    severity?: number
    lineNumber?: number
    serverName?: string
    procName?: string
    message:string
    sqlstate?: string
}

interface RawData {
    meta: Meta[]
    rows: Array<any[]>
}

interface PoolStatusRecord {
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

interface PoolStatusRecordCb { (status: PoolStatusRecord): void
}
interface QueryDescriptionCb { (description: QueryDescription): void
}
interface MessageCb { (msg: string): void
}
interface PoolOptionsEventCb { (options: PoolOptions): void
}
interface PoolOpenCb { (err: Error, options: PoolOptions): void
}
interface SimpleCb { (): void
}
interface TableCb { (err: Error, table: Table): void
}
interface BindCb { (cb: BulkTableMgr): void
}
interface GetTableCb { (err: Error, table: BulkTableMgr): void
}
interface OpenCb { (err: Error, connection: Connection): void
}
interface QueryCb { (err?: Error, rows?: any[], more?: boolean): void
}
interface CallProcedureCb { (err?: Error, rows?: any[], outputParams?:any[]): void
}
interface QueryRawCb { (err?: Error, raw?: RawData, more?: boolean): void
}
interface StatusCb { (err?: Error): void
}
interface PrepareCb { (err?: Error, statement?: PreparedStatement): void
}
interface EventCb { (data: any): void
}
interface SubmittedEventCb { (sql: string, params:any[]): void
}
interface EventColumnCb { (colIndex: number, data:any, more:boolean): void
}
interface BulkSelectCb { (err: Error, rows: any[]): void
}
interface DescribeProcedureCb { (description?: ProcedureSummary): void
}
interface GetProcedureCb { (procedure?: ProcedureDefinition): void
}
interface GetProcCb { (err:Error, procedure?: ProcedureDefinition): void
}
interface BulkMgrSummary {
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

interface BulkTableMgrPromises
{
    select(cols: object[]): Promise<any[]>
    /**
     * promise to submit rows to database where each row is represented
     * each column is bound precisely as defined on the table hence
     * will work with always on encryption.
     * by column name
     * {
     *     id: 1
     *     col_a: 'hello'
     * }
     * @param rows - array of objects to be inserted as rows.
     */
    insert(rows: object[]): Promise<any>
    delete(rows: object[]): Promise<any>
    update(rows: object[]): Promise<any>
}

interface BulkTableMgr {
    promises: BulkTableMgrPromises
    getSummary(): BulkMgrSummary
    asUserType(name?:string): string
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
    /**
     * effects insert only - use bcp for increased bcp speed
     * only works on ODBC Driver 17/18 for SQL Server
     * bcp will bind block of memory and copy rows into that block
     * and send to server - resulting in fast insert speeds.
     * @param bcp - switch insert bcp on/off
     */
    setUseBcp(bcp:boolean):void
    /**
     * get current bcp mode ie. is bcp on
     * @returns bcp status
     */
    getUseBcp():boolean
    /**
     * bcp requires the ms odbc driver to be dynamically loaded as it is not part of
     * ODBC. If driver default as below is used, this method is automatically called
     * with 17, 18 (numeric). The default value is 17. If using an alias or DCN entry
     * may need to manually call this method.
     * "UAT18": "Driver={ODBC Driver 18 for SQL Server}; Server= ... Database=node;TrustServerCertificate=yes;",
     * "UAT": "Driver={ODBC Driver 17 for SQL Server}; Server= ...  Database=node",
     * @param v the driver version used for bcp
     */
    setBcpVersion(v:number) : void
    /**
     * current driver version used by driver to dynamically load library for bcp
     * @returns the driver version
     */
    getBcpVersion():number
    /**
     * for a set of objects extract primary key fields only
     * @param vec - array of objects
     * @returns - array of objects containing only primary keys
     */
    keys(vec:object[]): object[]
}

interface TableValueParam {
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

interface ProcedureParam {
    table_value_param?:TableValueParam[]
    is_user_defined?:boolean
    is_output: boolean
    name: string
    type_id: string
    max_length: number
    precision: number
    scale: number
    order: number
    update_signature: string
    collation: any
    val: any
}

interface ProcedureDefinition
{
    setDialect(dialect: ServerDialect): boolean
    paramsArray(params: any[]): any[]
    call(params?: any[], cb?: CallProcedureCb): Query
    setTimeout(to:number): void
    setPolling(polling: boolean) : void
    getMeta(): ProcedureSummary
    getName(): string
}

interface ProcedureSummary {
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

interface ProcedureManager {
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

interface ProcedureParamMeta {
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

interface ServerDialect {
    SqlServer: ServerDialect
    Sybase: ServerDialect
}

interface TableBuilder {
    // can use utility method e.g. builder.addColumn('col_b').asVarChar(100)
    /**
     * e.g. builder.addColumn('col_b').asVarChar(100)
     * @param columnName must be unique for table and reprents new column
     * @param columnType the textual type as represented in database
     * @param maxLength optional for certain types
     * @param isPrimaryKey 1 is prmary key
     * @returns the column instance that can be further specialised with fluent api
     */
    addColumn (columnName: string, columnType?: string, maxLength?:number, isPrimaryKey?: number): TableColumn
     // builder.setDialect(mgr.ServerDialect.Sybase)
    /**
     *
     * @param dialect specifies if using Sybase, defaults to SQL server
     */
    setDialect(dialect: ServerDialect): boolean

    /**
     * recompute the table properties based on columns added
     */
    compute () : void
    /**
     * constructs a bulk table manager to register which will be used
     * rather than via a call to server to obtain meta data.
     * @returns a bulk table that can be registered with table manager.
     */
    toTable () : BulkTableMgr
    /**
     * used for testing where table can be dropped ready for re-creation.
     * @returns await promise to drop the table
     */
    drop (): Promise<any>
    /**
     * used for testing where table is created in server based on columns
     * @returns promise to await for table created.
     */
    create (): Promise<any>
    /**
     * used for testing where table can be truncated.
     * @returns promise to await for table to be truncated.
     */
    truncate () : Promise<any>
    /**
     * remove all columns added so far
     */
    clear (): void
    // a wrapper procedure definition with column as parameters
    /**
     * a stored proc which has params representing the columns where a row
     * is inserted into table.
     * @param procname the name of the procedure
     * @returns sql representing a stored proc to insert a row into the table.
     */
    insertProcSql (procname?: string): string
    // proc to accept tvp param for table and copy/bulk insert
    /**
     * a stored proc which has a single TVP param representing the columns where rows
     * are inserted into table by selecting from tvp
     * @param procname the name of the procedure
     * @param tableTypeName the name of the tvp type as param of proc
     * @returns sql representing a stored proc to insert a row into the table.
     */
    insertTvpProcSql (procname?: string, tableTypeName?: string): string
    /**
     * the name of table type represented by table e.g. dbo.tmpTableBuilderType
     */
    typeName: string
    /**
     * the columns added into the table
     */
    columns: TableColumn[]
    /**
     * the columns which are not readonly and form part of insert statement
     */
    insertColumns: TableColumn[]
    /**
     * sql to drop the table type e.g.
     * IF TYPE_ID(N'dbo.tmpTableBuilderType') IS not NULL drop type dbo.tmpTableBuilderType
     */
    //
    dropTypeSql: string
    /**
     * sql to create the table type representing the table.
     * e.g. CREATE TYPE dbo.tmpTableBuilderType AS TABLE ([id] int , [MatterColumn] varchar (100) NOT NULL, [SearchTerm] nvarchar (MAX) NOT NULL, [Comparator] nvarchar (20) NOT NULL)
     */
    //
    userTypeTableSql: string
    /**
     * the sql to dtop the table
     * e.g. IF OBJECT_ID('dbo.tmpTableBuilder', 'U') IS NOT NULL DROP TABLE dbo.tmpTableBuilder;
     */
    //
    dropTableSql: string
    /**
     * the sql to create the table
     * e.g. CREATE TABLE dbo.tmpTableBuilder ([id] int , [MatterColumn] varchar (100) NOT NULL, [SearchTerm] nvarchar (MAX) NOT NULL, [Comparator] nvarchar (20) NOT NULL)
     */
    createTableSql: string
    /**
     * sql for a clustered index around primary keys
     */
    clusteredSql: string
    /**
     * the select signature to fetch all columns
     */
    selectSql: string
    /**
     * sql to insert into server.
     */
    insertSql: string
    /**
     * sql to truncate the table
     */
    truncateSql: string
    /**
     * sql of the signature of insert params
     * e.g. ('?', '?')
     */
    paramsSql: string
    insertParamsSql: string
    /**
     * the proc sql to insert a row via params
     */
    insertTvpProcedureName: string
    /**
     * the proc sql taking a tvp param
     */
    insertProcedureTvpSql: string
  }

interface TableManagerPromises {
    getTable(name: string) : Promise<BulkTableMgr>
    getUserTypeTable(name: string): Promise<Table>
}

interface TableManager {
    promises: TableManagerPromises
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

interface PreparedPromises {
    /**
     * free the unmanaged resources representing the prepared statement
     * @returns promise to await for statement to be released on server
     */
    free(): Promise<any>
    /**
     * submit a query on a prepared statement
     * @param params array of parameters previously bound in prepared query.
     * @param options optional params on query such as timeout
     * @returns promise to await for query results
     */
    query(params?: any[], options?: QueryAggregatorOptions) : Promise<QueryAggregatorResults>
}

interface PreparedStatement {
    /**
     * promises to query and free the statement
     */
    promises: PreparedPromises
    /**
     * submit bound query using provided params
     * @param params - the param array on query
     * @param cb - called with query results.
     */
    preparedQuery(params?: any[], cb ?: QueryCb): Query
    /**
     * free the prepared statement
     * @param cb called when server frees the statement
     */
    free(cb: StatusCb): void
    /**
     * the sql representing the bound query.
     * @returns sql submitted to bind statement.
     */
    getSignature(): string
    /**
     * the id representing the prepared query
     * @returns the numeric id of statement
     */
    getId(): number
    /**
     * metadata returned by binding the prepared query.
     * @returns array of bound parameter information describing parameter.
     */
    getMeta(): Meta[]
}

interface ConcreteColumnType {
    /***
     * the ODBC type which will be used to bind parameter. If this is not
     * provided, the value is used to guess what binding should be used.
     * This works for all non encrypted columns as the server will cast
     * the parameter to target colmn type. When using encryption the driver
     * assigns this and precision, scale based on metadata describing the
     * column or parameter type.
     */
    sql_type: number
    /**
     * the actual JS value sent to native driver to be comverted to native
     * c type and on to the server.
     */
    value?: string|string[]
        |boolean|boolean[]
        |Buffer|Buffer[]|
        Date|Date[]|
        number|number[]
    precision?: number
    scale?: number
    /**
     * used in datetimeoffset based parameters
     */
    offset?: number
    /**
     * is the parameter a datetime type.
     * do not set - this is computed and used by native driver in binding parameter.
     */
    isDateTime: boolean
    /**
     * is the parameter a time2 type.
     * do not set - this is computed and used by native driver in binding parameter.
     */
    isTime2: boolean
    fraction?: number
}
declare enum QueryEvent {
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

interface UserConversion {
    Bit(v:number): ConcreteColumnType
    BigInt(v:number): ConcreteColumnType
    Int(v:number): ConcreteColumnType
    TinyInt(v:number): ConcreteColumnType
    SmallInt(v:number): ConcreteColumnType
    Float(v:number): ConcreteColumnType
    Numeric(v:number): ConcreteColumnType
    Money(v:number): ConcreteColumnType
    SmallMoney(v:number): ConcreteColumnType
    Decimal(v:number): ConcreteColumnType
    Double(v:number): ConcreteColumnType
    Real(v:number): ConcreteColumnType
    WVarChar(v:String) : ConcreteColumnType
    Char(v:String) : ConcreteColumnType
    VarChar(v:String) : ConcreteColumnType
    NChar(v:String) : ConcreteColumnType
    NVarChar(v:String) : ConcreteColumnType
    Text(v:String) : ConcreteColumnType
    NText(v:String) : ConcreteColumnType
    Xml(v:String) : ConcreteColumnType
    WLongVarChar(v:string) : ConcreteColumnType
    UniqueIdentifier(v:String) : ConcreteColumnType
    VarBinary(v:Buffer) : ConcreteColumnType
    LongVarBinary(v:Buffer) : ConcreteColumnType
    Image(v:Buffer) : ConcreteColumnType
    Time(v:Date) : ConcreteColumnType
    Date(v:Date) : ConcreteColumnType
    DateTime(v:Date) : ConcreteColumnType
    DateTime2(v:Date) : ConcreteColumnType
    DateRound(v:Date) : ConcreteColumnType
    SmallDateTime(v:Date) : ConcreteColumnType
    DateTimeOffset(v:Date) : ConcreteColumnType
}

interface NativeReadColumnInfo {
    end_rows: boolean
    data: any[]
}

interface NativeNextResultInfo {
    endOfResults: boolean
    preRowCount: boolean
    rowCount: number
    meta?: Meta[]
}

interface NativeReadColumnCb { (err: Error, results: NativeReadColumnInfo): void
}

interface NativeNextResultCb { (err: Error, results: NativeNextResultInfo): void
}

interface NativeUnbindCb { (err: Error, outputVector: any[]): void
}

interface NativePrepareCb { (err: Error, meta: Meta[]): void
}

interface NativeQueryCb { (err: Error, results: NativeNextResultInfo, more:boolean): void
}

interface NativeQueryObj {
    query_str: string
    numeric_string?: boolean
    query_polling?: boolean
    query_timeout?: number
    max_prepared_column_size?: number
}

interface NativeCustomBinding {
    precision?: number
    scale?: number
    offset?: number
    value?: string|string[]
        |boolean|boolean[]
        |Buffer|Buffer[]|
        Date|Date[]|
        number|number[]
}

interface NativeParam {
    is_user_defined?: boolean
    type_id?: number
    schema?: string
    bcp?: boolean
    bcp_version?: number
    table_name?: string
    ordinal_position?: number
    scale?: number
    offset?: number
    precision?: number
    is_output?: boolean
    name?: string
    value?: string|string[]
        |boolean|boolean[]
        |Buffer|Buffer[]|
        Date|Date[]|
        number|number[]|
        NativeCustomBinding
}

declare class NativeConnection {
    constructor()
    readColumn(queryId: number, rowBatchSize: number, cb: NativeReadColumnCb): void
    nextResult(queryId: number, cb: NativeNextResultCb): void
    unbind(queryId: number, cb: NativeUnbindCb): void
    close(cb: StatusCb): void
    cancelQuery(qid: number, cb: StatusCb): void
    freeStatement(qid: number, cb: StatusCb): void
    beginTransaction(cb: StatusCb): void
    rollback(cb: StatusCb): void
    commit(cb: StatusCb): void
    prepare(qid: number, queryObj: NativeQueryObj, cb: NativePrepareCb): void
    bindQuery(qid: number, params: NativeParam[], cb: NativePrepareCb): void
    query(qid: number, queryObj: NativeQueryObj, params: NativeParam[], cb: NativeQueryCb): void
    callProcedure(qid: number, procedure: string, params: NativeParam[], cb: NativeQueryCb): void
}

export interface SqlClient extends UserConversion{
    /**
     * helper promises allowing async style await to open connection
     */
    promises: SqlClientPromises
    /**
     * instanitate an instance of connection pool which improves concurrency
     * by using a number of connections to balance load where a queue of
     * queries is serviced by next available connection. Pool will if configured
     * close idle connections and test with periodic keep alive.
     */
    Pool: { (options:PoolOptions) : Pool } & { new (options?:PoolOptions) : Pool }
    // Connection: { () : NativeConnection } & { new () : NativeConnection }
    open(description: ConnectDescription, cb: OpenCb): void
    /**
     * async operation to open a connection to the database
     * @param conn_str - string representing connection of form Driver={ODBC Driver 17 for SQL Server};Server= ..
     * @param cb - will return error or connection object
     */
    open(conn_str: string, cb: OpenCb): void
    /**
     * adhoc async query to open connection to database, execute a query and close connection
     * @param conn_str - string representing connection
     * @param sql - the textual string submitted to database
     * @param cb - optional callback representing an error or results (if any) from query.
     * @returns - a query object which can be used to monitor progress via event notification
     */
    query(conn_str: string, sql: string, cb?: QueryCb): Query
    /**
     * adhoc async query with supplied parameters to open connection to database, execute a query
     * and close connection.
     * @param conn_str - string representing connection
     * @param sql - the textual string submitted to database
     * @param params - array of parameters used to bind query
     * @param cb - optional callback containing error or rows in object form column names as proeprties
     * @returns - a query object which can be used to monitor progress via event notification
     */
    query(conn_str: string, sql: string, params?: any[], cb?: QueryCb): Query
    query(conn_str: string, description: QueryDescription, cb?: QueryCb): Query
    query(conn_str: string, description: QueryDescription, params?: any[], cb?: QueryCb): Query
    queryRaw(conn_str: string, description: QueryDescription, cb: QueryRawCb): Query
    queryRaw(conn_str: string, description: QueryDescription, params?: any[], cb?: QueryRawCb): Query
    queryRaw(conn_str: string, sql: string, params?: any[], cb?: QueryRawCb): Query
    queryRaw(conn_str: string, sql: string, cb: QueryRawCb): Query
    PollingQuery(s:string) : QueryDescription
    TimeoutQuery(s:string, to:number) : QueryDescription
    TzOffsetQuery(s:string, offsetMinutes?:number) : QueryDescription
    TvpFromTable(table:Table) : ProcedureParam
}
