
declare module 'msnodesqlv8/types' {
   type sqlJsColumnType = string | boolean | Date | number | Buffer
   type sqlRecordType = Record<string | number, sqlJsColumnType>
   type sqlObjectType = sqlRecordType | object | any
   type sqlQueryParamType = sqlJsColumnType | sqlJsColumnType[] | ConcreteColumnType | ConcreteColumnType[] | TvpParam
   type sqlPoolEventType = MessageCb | PoolStatusRecordCb | PoolOptionsEventCb | StatusCb
   type sqlQueryEventType = SubmittedEventCb | ColumnEventCb | EventColumnCb | StatusCb | RowEventCb | MetaEventCb | RowCountEventCb
   type sqlProcParamType = sqlObjectType | sqlQueryParamType
   type sqlQueryType = string | QueryDescription
   type sqlConnectType = string | ConnectDescription
   type sqlColumnResultsType = sqlObjectType | sqlJsColumnType | any
   type sqlBulkType = sqlObjectType[]

   interface GetSetUTC {
      /**
         * used to switch on date conversion for date columns from database to UTC
         * @param utc flag to turn conversio on or off
         */
      setUseUTC: (utc: boolean) => void
      /**
         * fetch the current UTC conversion status.
         * @returns a flag for conversion.
         */
      getUseUTC: () => boolean
   }

   interface SubmitQuery {
      /**
         * submit query on an open connection with optional paramteters that will be bound
         * by native driver. Can either use an event stream driven mechanism by subscribing to
         * returned query e.g. on('column', ..) , on ('meta', ..) or provide a callback which
         * will be invoked when all results are ready.  Event subscription for large queries
         * can be much more memory efficient as the data will not be cached in driver as results
         * are built. However a callback can be more convenient.
         *
         * @param sqlOrQuery the textual query to submit
         * @param paramsOrCb optional bound parameters either array of JS native types or bound user defined parameters,
         * else an optional callback invoked with results of query.
         * @param cb optional callback invoked when query completes with array of objects built from column names
         * as properties. e.g. { cola: 1, colb: 'hello }.  Note the oberhead required which for large bumbers
         * of rows will grow the node process significantly.
         * @returns a query object which can be used to cancel, pause, resume or subscribe for events.
         */
      query: (sqlOrQuery: sqlQueryType, paramsOrCb?: sqlQueryParamType[] | QueryCb, cb?: QueryCb) => Query
      queryRaw: (sqlOrQuery: sqlQueryType, paramsOrCb?: sqlQueryParamType[] | QueryRawCb, cb?: QueryRawCb) => Query
   }

   interface AggregatorPromises {
      /**
         *
         * @param sql the textual query to submit
         * @param params optional bound parameters either array of JS native types or bound user defined parameters
         * @param options optional parameters for query execution e.g. timeout
         * @returns a promise to return all results from all compounded queries submitted
         */
      query: (sql: string, params?: sqlQueryParamType[], options?: QueryAggregatorOptions) => Promise<QueryAggregatorResults>
      /**
         *
         * @param name the name of procedure to call
         * @param params optional bound parameters either array of JS native types or bound user defined parameters
         * or object with properties assigned matching procedure parameter names.
         * alter PROCEDURE <name> (@a INT = 5)
         * then call with object parameter { a: 4 } to override default value 5
         * @param options optional parameters for query execution e.g. timeout
         * @returns a promise to return all results from all compounded queries submitted
         */
      callProc: (name: string, params?: sqlProcParamType, options?: QueryAggregatorOptions) => Promise<QueryAggregatorResults>
   }

   interface SqlClientPromises {
      /**
         * adhoc query where connection is opened, query submitted, results fetched, connection closed
         * and results returned as a promide completed when connection is closed.
         * @param conn_str connection string or connection object
         * @param sql the sql to execute on server
         * @param params an array of parameters which can be simple JS types or bound types including metadata of type
         * @param options - query options such as timeout.
         */
      query: (conn_str: sqlConnectType, sql: string, params?: sqlQueryParamType[], options?: QueryAggregatorOptions) => Promise<QueryAggregatorResults>
      /**
         * adhoc call to a stored procedure using a connection string, proc name and params
         * the connection is opened, the proc definition bound, call made and connection closed.
         * results returned once close is complete. Note this is not efficient for many calls
         *
         * @param conn_str - the connection string or object
         * @param name - the name of the stored proc to call
         * @param params optional bound parameters either array of JS native types or bound user defined parameters
         * or object with properties assigned matching procedure parameter names.
         * alter PROCEDURE <name> (@a INT = 5)
         * then call with object parameter { a: 4 } to override default value 5 or {} taking default.
         * @param options - query options such as timeout.
         * @returns promise to await for results from query.
         */
      callProc: (conn_str: sqlConnectType, name: string, params?: sqlProcParamType, options?: QueryAggregatorOptions) => Promise<QueryAggregatorResults>
      /**
         * open a connection to server using an odbc style connection string.
         * @param conn_str - the connection string or object
         * @returns - a promise to await for a new connection to the database
         */
      open: (conn_str: sqlConnectType) => Promise<Connection>
   }

   interface UserTypeColumnType {
      offset: number
      declaration: string
      length: number
   }
   interface UserTypeColumn {
      name: string
      userType: string
      scale: number
      precision: number
      type: UserTypeColumnType
   }

   /***
    * representation of a table user type used in TVP bulk operations
    */
   interface Table {
      /**
         * of the table to which this type refers.
         */
      name: string
      /**
         * the rows to be included within the TVP query
         */
      rows: sqlJsColumnType[][]
      /**
         * metadata describing the columns of table type.
         */
      columns: UserTypeColumn[]
      /**
         * add rows of data as an object array where each instance holds
         * properties for columns { cola: 'hello' }, { cola: 'world'  }
         * @param vec the object array to be converted into rows.
         */
      addRowsFromObjects: (vec: sqlObjectType[]) => void
   }
   interface SqlServerVersion {
      MajorVersion: number
      ProductLevel: string
      Edition: string
      ProductVersion: string
      Cat: string
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
      useNumericString?: boolean
      /**
         * nvarchar(max) prepared columns must be constrained (Default 8k)
         */
      maxPreparedColumnSize?: number
      /**
         * the connection string used for each connection opened in pool
         */
      connectionString: string
   }

   interface QueryAggregatorResults {
      /**
         * the local date when this aggregation query was started
         */
      beginAt: Date
      /**
         * the promise is resolved or rejected at this local time.  In case of
         * completing, this will be when the unmanaged native statement
         * handle is released by the cpp.
         */
      endAt: Date
      /**
         * the local date when query submitted to native driver -
         * it may have been held on a queue waiting to be submitted
         * on the designated connection
         */
      submittedAt: Date
      /**
         * elapsed ms for call to complete
         */
      elapsed: number
      /**
         * for a compund query select * from a; select * from b
         * each time a new statement is started a new elapsed
         * ms count is added such that a breakdown of where
         * time is spent in each statement.
         *
         */
      metaElapsed: number[]
      /**
         * array of meta for each query i.e. an array holding an array of meta descriptions one per column
         */
      meta: Meta[][]
      /**
         * the first meta to arrive for the query submitted which
         * corresponds data rows held in first
         */
      firstMeta: Meta[]
      /**
         * first set of rows i.e. results[0] if any else null
         */
      first: (sqlColumnResultsType[])
      /**
         * each result set either as array of arrays or array of objects with column names as properties
         */
      results: sqlColumnResultsType[][]
      /**
         * output params if any from a proc call
         */
      output: sqlJsColumnType[]
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
      returns: sqlJsColumnType
      /**
         * errors collected by running sql (up to promise reject)
         */
      errors: Error[]
      /**
         * the options submitted on query
         */
      options: QueryAggregatorOptions
      /**
         * a running total incremented on each new row arriving
         * select top 10 ... will expect this to equal 10
         */
      rows: number
      /**
         * the approximate number of rows per second received
         * over duration of query.
         */
      rowRate: number
      /**
         * the sql submitted to server producing these results.
         */
      sql: string
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
      open: () => Promise<Pool>
      /**
         * terminate all open connections.
         * @returns promise to await for close to complete.
         */
      close: () => Promise<any>
      /**
         * utility method to fetch a user table type definition containing
         * the column metadata representing the type.
         * @param name the user type definition to fetch
         * @returns a promise of table type definition
         */
      getUserTypeTable: (name: string) => Promise<Table>
      /**
         * fetch a table definition which can be used for bulk insert operations
         * @param name of table to bind too
         * @returns promise of bound table with methods to insert objects.
         */
      getTable: (name: string) => Promise<BulkTableMgr>
      /**
         * fetch a stored procedure definition which can be called with
         * correctly bound parameter types.
         * @param name of stored procedure to fetch.
         * @returns promise of bound proc to call.
         */
      getProc: (name: string) => Promise<ProcedureDefinition>
   }

   class Pool implements GetSetUTC, SubmitQuery {
      constructor (poolOptions: PoolOptions)
      promises: PoolPromises
      getUseUTC (): boolean
      setUseUTC (utc: boolean): void
      open (cb?: PoolOpenCb): void
      /**
          * close the pool such that all active connections are closed and pool is no longer
          * usable.
          * @param cb callback when operation is complete
          */
      close (cb?: StatusCb): void
      query (sqlOrQuery: sqlQueryType, paramsOrCb?: sqlQueryParamType[] | QueryCb, cb?: QueryCb): Query
      queryRaw (sqlOrQuery: sqlQueryType, paramsOrCb?: sqlQueryParamType[] | QueryRawCb, cb?: QueryRawCb): Query
      isClosed (): boolean
      /**
          * event subscription
          * e.g. pool.on('debug', msg => { console.log(msg) })
          * @param event one of
          *
          * 'debug' - a debug record showing internal state of the pool
          *
          * 'open' - event on the pool being opened and ready to work.
          *
          * 'error' - propagated from connection errors
          *
          * 'status' - information relating to latet operation
          *
          * 'submitted' - raised when query is submitted where previously was on a queue
          *
          * @param cb callback related to event subscribed
          */
      on (event: string, cb?: sqlPoolEventType): void
   }

   interface TableColumn {
      /**
         * unique name for this column unique for this table
         */
      name: string
      /**
         * the type of the column as specified in column definition
         * without any scaling i.e. date,time,bit,char,varchar
         */
      type: string
      schema_name: string
      /**
         * used for bcp based bulk insert and represents the ordinal numeric position
         * of the column within the table.
         */
      ordinal_position: number
      table_catalog: string
      /**
         * schema to which parent user type table belongs e.g. 'dbo'
         */
      table_schema: string
      /**
         * the table name for which this column belongs
         */
      table_name: string
      /**
         * expression or value describing efault for this column
         */
      column_default: string
      /**
         * the max space the column occupies
         */
      max_length: number
      /**
         * related to certain column types e.g. decimal(precision,scale)
         */
      precision: number
      /**
         * related to certain column types e.g. decimal(precision,scale)
         */
      scale: number
      /**
         * is the column nullable = 1, else 0
         */
      is_nullable: number
      /**
         * is the column computed = 1, else 0
         */
      is_computed: number
      /**
         * is the column an identity = 1, else 0
         */
      is_identity: number
      /**
         * unique object id for this column
         */
      object_id: number
      generated_always_type: bigint
      generated_always_type_desc: string
      is_hidden: number
      /**
         * is the column part of primary key for table = 1, else 0
         */
      is_primary_key: number
      /**
         * is the column a foreign key for table = 1, else 0
         */
      is_foreign_key: number
      /**
         * type declaration if using as a proc parameter i.e. without
         * the null decorator char(15)
         */
      procTyped: () => string
      /**
         * sql declared type used by table builder / user type
         * @param user flag is this user type declaration (or table column)
         * @param withDecorator i.e. should include 'null' 'not null' etc
         */
      typed: (user?: boolean, withDecorator?: boolean) => string
      /**
         * is column considered readonly based on is_computed etc
         * @returns flag indicates if this column is insertable or readonly
         */
      isReadOnly: () => boolean
      /**
         * based on type - is date field requiring tz adjustment
         * @returns flag indicating if column is tz adjusted.
         */
      isTzAdjusted: () => boolean
      /**
         * the length decorator for string column description i.e
         * 10 or MAX for
         * @returns decorator part of type description.
         */
      maxLength: () => number | string
      /**
         * specifies if this column is insertable or is computed
         * @param v 0 = not computed, 1 = this column is computed
         * @returns this column instance for fluent calls
         */
      // helper methods when manually adding tables with table builder
      isComputed: (v?: number) => TableColumn
      /**
         * specifies an epression representing this column
         * @param s e.g. 'AS ([OrganizationNode].[GetLevel]())'
         * @returns this column instance for fluent calls
         */
      asExpression: (s: string) => TableColumn
      /**
         * nominates the column as identity type and hence auto increments
         * and maintains a unique identity.
         * @param v 1: is an identity, 0 column is not identity
         * @param start defaults to 1 starting number for identity
         * @param inc defaults to 1 increments by inc on next insert
         */
      isIdentity: (v: number, start?: number, inc?: number) => TableColumn

      isHidden: (v: number) => TableColumn

      isPrimaryKey: (v: number) => TableColumn

      isForeignKey: (v: number) => TableColumn
      /**
         * nominate column as boolean 'bit'
         * @returns this column instance for fluent calls
         */
      asBit: () => TableColumn
      /**
         * nominate column as int32 signed 32 bit 'int'
         * @returns this column instance for fluent calls
         */
      asInt: () => TableColumn
      /**
         * nominate column as int64 signed 64 bit 'bigint'
         * @returns this column instance for fluent calls
         */
      asBigInt: () => TableColumn
      /**
         * nominate column as int16 signed 16 bit 'smallint'
         * @returns this column instance for fluent calls
         */
      asSmallInt: () => TableColumn
      /**
         * nominate column as int8 signed 8 bit 'byte'
         * @returns this column instance for fluent calls
         */
      asTinyInt: () => TableColumn
      /**
         * nominate column as Unicode 'nvarchar(max)'
         * @returns this column instance for fluent calls
         */
      asNVarCharMax: () => TableColumn
      /**
         * nominate column as Unicode 'nvarchar(p)' defaults to nvarchar(28)
         * @returns this column instance for fluent calls
         */
      asNVarChar: (length: number) => TableColumn
      /**
         * nominate column as non-Unicode 'varchar(p)' defaults to varchar(28)
         * @returns this column instance for fluent calls
         */
      asVarChar: (length: number) => TableColumn
      /**
         * nominate column as 'date'
         * @returns this column instance for fluent calls
         */
      asDate: () => TableColumn
      /**
         * nominate column as 'time'
         * @returns this column instance for fluent calls
         */
      asTime: (scale?: number) => TableColumn
      /**
         * nominate column as 'datetime2'
         * @returns this column instance for fluent calls
         */
      asDateTime2: () => TableColumn
      /**
         * nominate column as 'datetime'
         * @returns this column instance for fluent calls
         */
      asDateTime: () => TableColumn
      /**
         * nominate column as 'datetimeoffset'
         * @returns this column instance for fluent calls
         */
      asDateTimeOffset: () => TableColumn
      /**
         * nominate column as 'money'
         * @returns this column instance for fluent calls
         */
      asMoney: () => TableColumn

      asSmallMoney: () => TableColumn
      /**
         * nominate column as 'numeric(p,s)' defaults to numeric(20,15)
         * @returns this column instance for fluent calls
         */
      asNumeric: (precision: number, length: number) => TableColumn
      /**
         * nominate column as 'decimal(p,s)' defaults to decimal(23,18)
         * @returns this column instance for fluent calls
         */
      asDecimal: (precision?: number, scale?: number) => TableColumn
      /**
         * nominate column as 'uniqueidentifier'
         * @returns this column instance for fluent calls
         */
      asUniqueIdentifier: () => TableColumn
      /**
         * nominate column as 'hierarchyid'
         * @returns this column instance for fluent calls
         */
      asHierarchyId: () => TableColumn
      /**
         * nominate column as 'varbinary(l)'
         * @param length of column
         * @returns this column instance for fluent calls
         */
      asVarBinary: (length: number) => TableColumn
      /**
         * nominate column as 'float'
         * @returns this column instance for fluent calls
         */
      asFloat: (scale: number) => TableColumn
      /**
         * nominate column as 'real'
         * @returns this column instance for fluent calls
         */
      asReal: () => TableColumn
      /**
         * nominate column as Unicode 'nchar(l)' defaults nchar(128)
         * @param length of column
         * @returns this column instance for fluent calls
         */
      asNChar: (length: number) => TableColumn
      /**
         * nominate column as non-Unicode'char(l)' defaults char(128)
         * @param length of column
         * @returns this column instance for fluent calls
         */
      asChar: (length: number) => TableColumn
      /**
         * add to the type declaration as part of the column definition
         * e.g. to use always on encryption
         * builder.addColumn('[NationalIDNumber]')
         * .asNVarChar(15)
         * .withDecorator(encryptHelper.txtWithEncrypt)
         * .notNull()`)
         * @param string representing decorator to add to declaration
         */
      withDecorator: (v: string) => TableColumn
      /**
         * specifies if this column is not nullable i.e. adds 'not null' to decorator on type
         * @returns this column instance for fluent calls
         */
      notNull: () => TableColumn
      /**
         * specifies if this column is nullable i.e. adds 'null' to decorator on type
         * @returns this column instance for fluent calls
         */
      null: () => TableColumn
   }

   interface ConnectionPromises extends AggregatorPromises {
      prepare: (sql: sqlQueryType) => Promise<PreparedStatement>
      getTable: (name: string) => Promise<BulkTableMgr>
      getProc: (name: string) => Promise<ProcedureDefinition>
      getUserTypeTable: (name: string) => Promise<Table>
      /**
         * close the active connection and release ODBC handle within
         * native driver.
         * @returns promise to await for connection to close.
         */
      close: () => Promise<void>
      /**
         * cancel the provided query - note await con.promises.cancel(q)
         * is equivalent to await q.promises.cancel()
         * @returns await promise for cancel to complete on provided query.
         */
      cancel: (query: Query) => Promise<void>
      /**
         * open a transaction on this connection instance.  Expected to commit or rollback
         * at some later point in time.
         * @returns promise to await for transaction to be opened
         */
      beginTransaction: () => Promise<void>
      /**
         * commit the currently opened transaction.  Expected to have previously called beginTransaction
         * @returns promise to await for transaction to be committed
         */
      commit: () => Promise<void>
      /**
         * rollback the currently opened transaction.  Expected to have previously called beginTransaction
         * @returns promise to await for transaction to be rolled back
         */
      rollback: () => Promise<void>
   }

   interface Connection extends GetSetUTC, SubmitQuery {
      /**
         * collection of promises to close connection, get a proc, table, prepare a query
         * and transaction management.
         * @returns a set of utility promises on this connection instance.
         */
      promises: ConnectionPromises
      /**
         * given a type of form create type MyType AS TABLE (col1, col2) fetch metadata
         * describing that type.
         * @param name the name as defined in database for table type.
         * @param cb callback containing the metadata describing the table.
         */
      getUserTypeTable: (name: string, cb: TableCb) => void
      /**
         * numeric integer representing this connection instance.
         * @returns the unique id
         */
      id: number
      /**
         * optionally return all number based columns as strings
         * to prevent exceeding max numeric for JS
         * @param numericString boolean true for numers as strings.
         */
      setUseNumericString: (numericString: boolean) => void
      /**
         * returns flag to indicate if numeric conversion to strings is active
         * @returns flag for numeric to string.
         */
      getUseNumericString: () => boolean
      /**
         * set max length of prepared strings or binary columns. Note this
         * will not work for a connection with always on encryption enabled
         * else a column marked nvarchar(max) is given a max size allocated
         * in prepared statement defaults to 8k. Truncation will occur for
         * parameters exceeding this size.
         * @param size
         */
      setMaxPreparedColumnSize: (size: number) => void
      getMaxPreparedColumnSize: () => number
      /**
         * permanently closes connection and frees unmanaged native resources
         * related to connection ie. connection ODBC handle along with any
         * remaining statement handles.
         * @param cb callback when connection closed.
         */
      close: (cb: StatusCb) => void
      beginTransaction: (cb?: StatusCb) => void
      commit: (cb?: StatusCb) => void
      rollback: (cb?: StatusCb) => void
      /**
         *  note - can use promises.callProc, callProc or callprocAggregator directly.
         *  provides access to procedure manager where proc definitions can be manually
         *  registered and called.
         *  @returns the procedure manager instance.
         */
      procedureMgr: () => ProcedureManager
      /**
         * note - can use getTable, promises.getTable directly.
         * provides access to table manager where tables can be manually registered
         * or bound
         * @returns the table manager instance.
         */
      tableMgr: () => TableManager
      pollingMode: (q: Query, v: boolean, cb?: SimpleCb) => void
      cancelQuery: (q: Query, cb?: StatusCb) => void
      prepare: (sql: sqlQueryType, cb: PrepareCb) => void
      setFilterNonCriticalErrors: (flag: boolean) => void
      callproc: (name: string, params?: sqlProcParamType[], cb?: CallProcedureCb) => Query
      getTable: (tableName: string, cb: GetTableCb) => void
      callprocAggregator: (name: string, params?: sqlProcParamType, optons?: QueryAggregatorOptions) => Promise<QueryAggregatorResults>
      /**
         * flag indicating if connection is closed and hence can no longer be used
         * for queries.
         */
      isClosed: () => boolean
   }

   interface QueryPromises {
      /**
         * promise to cancel current executing query - will wait
         * for 'free' event where resources related to query have
         * been cleaned from native driver.  If expected 'error' is
         * raised from driver this is returned by promise. Any other error
         * or if timeout occurs then promise is rejected.
         * @param timeout defaults 5000ms it should not br necessary
         * to change the default as when query is canceled the timer
         * is cleared.
         * @returns the expected error raised by driver when the query
         * is canceled. Any other error will reject promise.
         */
      cancel: (timeout?: number) => Promise<Error>
   }

   interface Query {
      promises: QueryPromises
      /**
         * subscribe for an event relating to query progress where events are
         * @param event - 'meta', 'submitted', 'rowcount', column', 'row', 'error', 'info', 'done', 'free'
         *
         *
         * 'meta' - array of Meta relating to query submitted indexed by column ID
         *
         *
         * 'submitted' - raised when query submitted to native driver (maybe held on outbound q)
         *
         *
         * 'column' - column index and data returned as results are returned - can index into
         *  meta array previously returned.
         *
         *
         * 'row' - indicating the start of a new row of data along with row index 0,1 ..
         *
         *
         * 'rowcount' - number of rows effected
         *
         *
         * 'error' - critical error that caused the query to end
         *
         *
         * 'info' - non-critical warning raised during query execution
         *
         *
         * 'done' - the JS has consumed all data and query is complete.
         *
         *
         * 'free' - when the native driver releases resources relating to query and entire lifecycle
         * comes to an end. the ODBC statement handle has been released at this point by native driver
         *
         *
         * @param cb - callback containing data related to subscription
         */
      on: (event: string, cb: sqlQueryEventType) => void
      /**
         * cancel active query - this will submit cancel on native driver on a different
         * thread such that if the query thread is blocked, the query will still be
         * cancelled.  If results are being streamed then the results are halted
         * and query is terminated.
         * @param qcb status callback indicating the cancel has been actioned.
         */
      cancelQuery: (qcb?: StatusCb) => void
      /**
         * temporarily suspend flow of data sent by native driver to be used
         * as flow control where for example expensive time consuming processing
         * is taken place on a batch - receive N rows, pause, process, resume
         * this prevents large memory build up where data arrives faster than
         * it is being processed.
         * @param qcb callback indicating query is paused.
         */
      pauseQuery: (qcb?: StatusCb) => void
      /**
         * resume processing i.e. instruct native driver to send more data which
         * will continue unless query is paused once more.
         * @param qcb
         */
      resumeQuery: (qcb?: StatusCb) => void
      /**
         * is this instance of query currently paused in which case
         * no more results will be returned until query is resumed.
         * @returns flag indicating if the query is paused.
         */
      isPaused: () => boolean
   }

   interface ConnectDescription {
      conn_str: string
      conn_timeout?: number
   }

   interface QueryDescription {
      /**
         * the sql to submit to server to execute.
         */
      query_str: string
      /**
         * for BigInt can return string to avoid overflow
         */
      numeric_string?: boolean
      query_timeout?: number
      query_polling?: boolean
      query_tz_adjustment?: number
      /**
         * constrain nvarchar(max) columns for prepared statements - i.e. will
         * set aefault 8k max size on nvarchar(max) columns. Note this
         * will not work when an encrypted connection is beng used - the
         * query will not prepare and return an error.
         */
      max_prepared_column_size?: number
   }

   interface Meta {
      name: string
      nullable: boolean
      size: number
      sqlType: string
      type: string
   }

   interface Error {
      code?: number
      severity?: number
      lineNumber?: number
      serverName?: string
      procName?: string
      message: string
      sqlstate?: string
   }

   interface RawData {
      meta: Meta[]
      rows: sqlJsColumnType[][]
   }

   interface PoolStatusRecord {
      time: Date
      parked: number
      idle: number
      busy: number
      pause: number
      parking: number
      workQueue: number
      activity: string
      op: string
      lastSql?: string
   }

   type PoolStatusRecordCb = (status: PoolStatusRecord) => void

   type QueryDescriptionCb = (description: QueryDescription) => void

   type MessageCb = (msg: string) => void

   type PoolOptionsEventCb = (options: PoolOptions) => void

   type PoolOpenCb = (err: Error, options: PoolOptions) => void

   type SimpleCb = () => void

   type TableCb = (err: Error, table: Table) => void

   type BindCb = (cb: BulkTableMgr) => void

   type GetTableCb = (err: Error, table: BulkTableMgr) => void

   type OpenCb = (err: Error, connection: Connection) => void

   type QueryCb = (err?: Error, rows?: sqlObjectType[], more?: boolean) => void

   type CallProcedureCb = (err?: Error, rows?: sqlObjectType[], outputParams?: sqlJsColumnType[]) => void

   type QueryRawCb = (err?: Error, raw?: RawData, more?: boolean) => void

   type StatusCb = (err?: Error) => void

   type PrepareCb = (err?: Error, statement?: PreparedStatement) => void

   type MetaEventCb = (meta: Meta[]) => void

   type RowCountEventCb = (rowcount: number) => void

   type RowEventCb = (row: number) => void

   type ColumnEventCb = (index: number, data: sqlJsColumnType) => void

   type SubmittedEventCb = (description: QueryDescription) => void

   type EventColumnCb = (colIndex: number, data: any, more: boolean) => void

   type BulkSelectCb = (err: Error, rows: sqlObjectType[]) => void

   type DescribeProcedureCb = (description?: ProcedureSummary) => void

   type GetProcedureCb = (procedure?: ProcedureDefinition) => void

   type GetProcCb = (err: Error, procedure?: ProcedureDefinition) => void

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

   interface BulkTableMgrPromises {
      select: (cols: sqlObjectType[]) => Promise<sqlObjectType[]>
      /**
         * promise to submit rows to database where each row is represented
         * by column name
         * {
         *     id: 1,
         *     col_a: 'hello'
         * }
         * each column is bound precisely as defined on the table hence
         * will work with always on encryption.
         * @param rows - array of objects to be inserted as rows.
         */
      insert: (rows: sqlBulkType) => Promise<void>

      delete: (rows: sqlBulkType) => Promise<void>

      update: (rows: sqlBulkType) => Promise<void>
   }

   interface BulkTableMgr {
      asTableType: (name?: string) => Table
      /**
       * utiity method returning a SQL definition of an equivalent user table type
       * that can be used for a TVP stored proc param type allowing bulk select
       * and insert into the table to which this type represents.
       * @param name
       */
      asUserType: (name?: string) => string
      deleteRows: (rows: object[], cb: StatusCb) => void
      getAssignableColumns: () => TableColumn[]

      // the driver will be sent column types in table rather than deriving from data
      // necessary to switch on for TZ adjustment i.e. for non UTC times sent
      /**
       * current driver version used by driver to dynamically load library for bcp
       * @returns the driver version
       */
      getBcpVersion: () => number

      getColumnsByName: () => TableColumn[]

      getDeleteSignature: () => string

      getInsertSignature: () => string

      getPrimaryColumns: () => TableColumn[]

      getSelectSignature: () => string

      getSummary: () => BulkMgrSummary

      getUpdateColumns: () => TableColumn[]

      getUpdateSignature: () => string

      /**
       * get current bcp mode ie. is bcp on
       * @returns bcp status
       */
      getUseBcp: () => boolean

      getWhereColumns: () => TableColumn[]

      insertRows: (rows: object[], cb: StatusCb) => void

      /**
       * for a set of objects extract primary key fields only
       * @param vec - array of objects
       * @returns - array of objects containing only primary keys
       */
      keys: (vec: object[]) => object[]

      promises: BulkTableMgrPromises

      selectRows: (cols: object[], cb: BulkSelectCb) => void

      setBatchSize: (size: number) => void

      /**
       * bcp requires the ms odbc driver to be dynamically loaded as it is not part of
       * ODBC. If driver default as below is used, this method is automatically called
       * with 17, 18 (numeric). The default value is 17. If using an alias or DCN entry
       * may need to manually call this method.
       * "UAT18": "Driver={ODBC Driver 18 for SQL Server}; Server= ... Database=node;TrustServerCertificate=yes;",
       * "UAT": "Driver={ODBC Driver 17 for SQL Server}; Server= ...  Database=node",
       * @param v the driver version used for bcp
       */
      setBcpVersion: (v: number) => void

      setUpdateCols: (cols: object[]) => void

      /**
       * effects insert only - use bcp for increased bcp speed
       * only works on ODBC Driver 17/18 for SQL Server
       * bcp will bind block of memory and copy rows into that block
       * and send to server - resulting in fast insert speeds.
       * @param bcp - switch insert bcp on/off
       */
      setUseBcp: (bcp: boolean) => void

      setWhereCols: (cols: object[]) => void

      updateRows: (rows: object[], cb: StatusCb) => void

      useMetaType: (yn: boolean) => void
   }

   interface TableValueColumn {

      name: string
      column_id: number
      ordered_column: string
      column_name: string
      type_id: string
      data_type: string
      nullable: string
      length: number
      precision: number
      scale: number
      collation: number
   }

   interface ProcedureParam {
      is_user_defined?: boolean
      is_output: boolean
      name: string
      type_id: string
      max_length: number
      precision: number
      scale: number
      order: number
      update_signature: string
      collation: any
      val: sqlProcParamType
   }

   interface TvpParam extends ProcedureParam {
      /**
         * the strongly typed parameters relating to the table type
         * repremted as rows i.e. array of values per column type
         */
      table_value_param: ConcreteColumnType[]
      /**
         * user table type to which the tvp is targetting
         */
      table_name: string
      /**
         * original table used to populate the tvp
         * data within this table has been copied into
         * table_value_param
         */
      value: Table
      /**
         * number rows to be bound
         */
      row_count: number
      /**
         * schema to which table belongs
         */
      schema: string
   }

   interface ProcedureDefinitionPromises {
      call: (params?: sqlProcParamType, options?: QueryAggregatorOptions) => Promise<QueryAggregatorResults>
   }

   interface ProcedureDefinition {
      promises: ProcedureDefinitionPromises
      setDialect: (dialect: ServerDialect) => boolean
      /**
         * @deprecated - given an object containing parameters as proeprties produce
         * an array of parameters that can be provided to call.  This is no longer
         * necessary, an object can be passed directly to call.
         * @param params
         * @returns an array to be used in method 'call'
         */
      paramsArray: (params: sqlObjectType) => sqlProcParamType[]
      /**
         * call a stored procedure witb optional parameters
         * @param params object parameters { p1: 6, p2: 'hello' } or ordered
         * array [ 6, 'p2' ]. Note the values given are enriched with metadata for
         * parameters defined such that they can be precisely bound thus allowing
         * always on encryption to work for procedure calls.
         * @param cb optional callback called when procedure call completes
         * @returns query object which can be used as an event stream or
         * used to cancel query.
         */
      call: (params?: sqlProcParamType, cb?: CallProcedureCb) => Query

      setTimeout: (to: number) => void

      setPolling: (polling: boolean) => void

      getMeta: () => ProcedureSummary
      /**
         *  the name of the bound stored procedure
         */
      getName: () => string
   }

   interface ProcedureSummary {
      select: string
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
         * @deprecated Please use `getProc` - this is not promise friendly
         */
      get: (name: string, cb?: GetProcedureCb) => void // cannot promisify (proc)
      getProc: (name: string, cb?: GetProcCb) => void // promise friendly (err, proc)
      callproc: (name: string, params?: any[], cb?: CallProcedureCb) => Query
      /***
         * manually register a stored procedure.
         *  const params = [
         *         pm.makeParam(spName, '@last_name', 'varchar', 30, false),
         *         pm.makeParam(spName, '@first_name', 'varchar', 18, false)
         *       ]
         * @param procName - name of proc to which this param belongs
         * @param paramName - unique name of the parameter.
         * @param paramType - the undecorated type declaration varchar, int
         * @param paramLength - the length of parameter
         * @param isOutput - is this an output param
         * @returns the param type equivalent to that fetched when using getProc
         */
      makeParam: (procName: string, paramName: string, paramType: string, paramLength: number, isOutput: boolean) => ProcedureParamMeta
      /**
         * manually register a procedure ie pm.addProc(spName, params)
         * @param name of the stored procedure to register
         * @param paramVector the list of parameters making up call
         * @returns defintion equivalent to that fetched in getProc
         */
      addProc: (name: string, paramVector: ProcedureParamMeta[]) => ProcedureDefinition

      describe: (name: string, cb?: DescribeProcedureCb) => void

      setTimeout: (timeout: number) => void

      setPolling: (poll: boolean) => void

      ServerDialect: ServerDialect
   }

   interface ProcedureParamMeta {
      proc_name: string
      type_desc: string
      object_id: number
      has_default_value: boolean
      default_value: string
      is_output: boolean
      name: string
      type_id: string
      max_length: number
      order: number
      collation: string
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
      addColumn: (columnName: string, columnType?: string, maxLength?: number, isPrimaryKey?: number) => TableColumn

      // builder.setDialect(mgr.ServerDialect.Sybase)
      /**
         *
         * @param dialect specifies if using Sybase, defaults to SQL server
         */
      setDialect: (dialect: ServerDialect) => boolean

      /**
         * recompute the table properties based on columns added
         */
      compute: () => void

      /**
         * constructs a bulk table manager to register which will be used
         * rather than via a call to server to obtain meta data.
         * @returns a bulk table that can be registered with table manager.
         */
      toTable: () => BulkTableMgr

      /**
         * used for testing where table can be dropped ready for re-creation.
         * @returns await promise to drop the table
         */
      drop: () => Promise<any>

      /**
         * used for testing where table is created in server based on columns
         * @returns promise to await for table created.
         */
      create: () => Promise<any>

      /**
         * used for testing where table can be truncated.
         * @returns promise to await for table to be truncated.
         */
      truncate: () => Promise<any>

      /**
         * remove all columns added so far
         */
      clear: () => void

      // a wrapper procedure definition with column as parameters
      /**
         * a stored proc which has params representing the columns where a row
         * is inserted into table.
         * @param procname the name of the procedure
         * @returns sql representing a stored proc to insert a row into the table.
         */
      insertProcSql: (procname?: string) => string

      // proc to accept tvp param for table and copy/bulk insert
      /**
         * a stored proc which has a single TVP param representing the columns where rows
         * are inserted into table by selecting from tvp
         * @param procname the name of the procedure
         * @param tableTypeName the name of the tvp type as param of proc
         * @returns sql representing a stored proc to insert a row into the table.
         */
      insertTvpProcSql: (procname?: string, tableTypeName?: string) => string

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

      /**
         * drop the insertProcedureTvpSql proc if it exists
         */
      dropInsertTvpProcedure: string
   }

   interface TableManagerPromises {
      getTable: (name: string) => Promise<BulkTableMgr>

      getUserTypeTable: (name: string) => Promise<Table>
   }

   interface TableManager {
      promises: TableManagerPromises

      /**
         * @deprecated Please use `getTable`
         */
      bind: (tableName: string, cb: BindCb) => void // cannot promisify (table)
      getTable: (tableName: string, cb: GetTableCb) => void // promise friendly (err, table)
      // manually register a table
      addTable: (tableName: string, cols: TableColumn[]) => BulkTableMgr

      // utility class to help manually add tables
      makeBuilder: (tableName: string, tableCatelog?: string, tableSchema?: string) => TableBuilder

      // or use builder to build columns
      ServerDialect: ServerDialect

      makeColumn: (tableName: string, tableSchema: string, position: number, columnName: string, paramType: string, paramLength: number, isPrimaryKey: number) => TableColumn
   }

   interface PreparedPromises {
      /**
         * free the unmanaged resources representing the prepared statement
         * @returns promise to await for statement to be released on server
         */
      free: () => Promise<any>

      /**
         * submit a query on a prepared statement
         * @param params array of parameters previously bound in prepared query.
         * @param options optional params on query such as timeout
         * @returns promise to await for query results
         */
      query: (params?: any[], options?: QueryAggregatorOptions) => Promise<QueryAggregatorResults>
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
      preparedQuery: (params?: any[], cb?: QueryCb) => Query

      /**
         * free the prepared statement
         * @param cb called when server frees the statement
         */
      free: (cb?: StatusCb) => void

      /**
         * the sql representing the bound query.
         * @returns sql submitted to bind statement.
         */
      getSignature: () => string

      /**
         * the id representing the prepared query
         * @returns the numeric id of statement
         */
      getId: () => number

      /**
         * metadata returned by binding the prepared query.
         * @returns array of bound parameter information describing parameter.
         */
      getMeta: () => Meta[]
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
      value?: sqlQueryParamType
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

   enum QueryEvent {
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
      Bit: (v: number) => ConcreteColumnType

      BigInt: (v: number) => ConcreteColumnType

      Int: (v: number) => ConcreteColumnType

      TinyInt: (v: number) => ConcreteColumnType

      SmallInt: (v: number) => ConcreteColumnType

      Float: (v: number) => ConcreteColumnType

      Numeric: (v: number) => ConcreteColumnType

      Money: (v: number) => ConcreteColumnType

      SmallMoney: (v: number) => ConcreteColumnType

      Decimal: (v: number) => ConcreteColumnType

      Double: (v: number) => ConcreteColumnType

      Real: (v: number) => ConcreteColumnType

      WVarChar: (v: string) => ConcreteColumnType

      Char: (v: string) => ConcreteColumnType

      VarChar: (v: string) => ConcreteColumnType

      NChar: (v: string) => ConcreteColumnType

      NVarChar: (v: string) => ConcreteColumnType

      Text: (v: string) => ConcreteColumnType

      NText: (v: string) => ConcreteColumnType

      Xml: (v: string) => ConcreteColumnType

      WLongVarChar: (v: string) => ConcreteColumnType

      UniqueIdentifier: (v: string) => ConcreteColumnType

      VarBinary: (v: Buffer) => ConcreteColumnType

      LongVarBinary: (v: Buffer) => ConcreteColumnType

      Image: (v: Buffer) => ConcreteColumnType

      Time: (v: Date) => ConcreteColumnType

      Date: (v: Date) => ConcreteColumnType

      DateTime: (v: Date) => ConcreteColumnType

      DateTime2: (v: Date) => ConcreteColumnType

      DateRound: (v: Date) => ConcreteColumnType

      SmallDateTime: (v: Date) => ConcreteColumnType

      DateTimeOffset: (v: Date) => ConcreteColumnType
   }

   interface NativeReadColumnInfo {
      end_rows: boolean
      data: any[]
   }

   interface NativeNextResultInfo {
      endOfResults: boolean
      endOfRows: boolean
      preRowCount: boolean
      rowCount: number
      meta?: Meta[]
   }

   type NativeReadColumnCb = (err: Error, results: NativeReadColumnInfo) => void

   type NativeNextResultCb = (err: Error, results: NativeNextResultInfo) => void

   type NativeUnbindCb = (err: Error, outputVector: any[]) => void

   type NativePrepareCb = (err: Error, meta: Meta[]) => void

   type NativeQueryCb = (err: Error, results: NativeNextResultInfo, more: boolean) => void

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
      value?: sqlQueryParamType
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
      value?: sqlQueryParamType
   }

   class NativeConnection {
      constructor ()

      readColumn (queryId: number, rowBatchSize: number, cb: NativeReadColumnCb): void

      nextResult (queryId: number, cb: NativeNextResultCb): void

      unbind (queryId: number, cb: NativeUnbindCb): void

      close (cb: StatusCb): void

      cancelQuery (qid: number, cb: StatusCb): void

      freeStatement (qid: number, cb: StatusCb): void

      beginTransaction (cb: StatusCb): void

      rollback (cb: StatusCb): void

      commit (cb: StatusCb): void

      prepare (qid: number, queryObj: NativeQueryObj, cb: NativePrepareCb): void

      bindQuery (qid: number, params: NativeParam[], cb: NativePrepareCb): void

      query (qid: number, queryObj: NativeQueryObj, params: NativeParam[], cb: NativeQueryCb): void

      callProcedure (qid: number, procedure: string, params: NativeParam[], cb: NativeQueryCb): void
   }

   interface SqlClient extends UserConversion {
      /**
         * helper promises allowing async style await to open connection or
         * submit adhoc query on a temporarily opened connection.
         */
      promises: SqlClientPromises
      /**
         * instanitate an instance of connection pool which improves concurrency
         * by using a number of connections to balance load where a queue of
         * queries is serviced by next available connection. Pool will if configured
         * close idle connections and test with periodic keep alive.
         */
      Pool: ((options: PoolOptions) => Pool) & (new(options?: PoolOptions) => Pool)

      // Connection: { () : NativeConnection } & { new () : NativeConnection }
      /**
         * async operation to open a connection to the database
         * @param connStrOrDescription - either string representing connection of form
         * Driver={ODBC Driver 17 for SQL Server};Server= .. or a connection description
         * containing the connection string.
         * @param cb - return error or connection object in form (err, Connection)
         */
      open: (connStrOrDescription: string | ConnectDescription, cb: OpenCb) => void
      /**
         * adhoc async query with supplied parameters to open connection to database, execute a query
         * and close connection. If a callback is provided results or error are returned when the
         * connection is closed.  The call can be used in an event driven fashion by using
         * the returned query object and using the on notification call.
         *
         * @param conn_str - string representing connection
         * @param sqlOrQuery - the textual string submitted to database or query object containing query and options
         * @param paramsOrCb  - with no callback this represents parameters, if any, provided with query.
         * Note that the supplied parameter can be a raw value such as a string, an array of raw values when
         * binding a bulk query or a concrete type where the specific binding is supplied to the driver. This is
         * done autimatically by the getTable or callProc functions.
         * @param cb - optional callback containing error or array of objects with column names as proeprties
         * @returns - a query object which can be used to monitor progress via event notification
         */
      query: (conn_str: string, sqlOrQuery: sqlQueryType, paramsOrCb?: sqlQueryParamType[] | QueryCb, cb?: QueryCb) => Query
      queryRaw: (conn_str: string, sqlOrQuery: sqlQueryType, paramsOrCb?: sqlQueryParamType[] | QueryRawCb, cb?: QueryRawCb) => Query
      PollingQuery: (s: string) => QueryDescription
      TimeoutQuery: (s: string, to: number) => QueryDescription
      TzOffsetQuery: (s: string, offsetMinutes?: number) => QueryDescription
      /**
         * construct a tvp parameter the native driver will recognise from an input
         * table - note once this parameter has been constructed the input
         * table.rows can be reset table.rows=[] as the data has been
         * copied along with column metadta ready for binding by driver.
         * this parameter can be used as part of a stored prcedure call or
         * query where bulk select from TVP is then possible. It is an efficient
         * way of sending data to the database.
         * @param table
         * @returns the Table Value Parameter instance ready for use in query
         */
      TvpFromTable: (table: Table) => TvpParam
   }
}

declare module 'msnodesqlv8' {
   import { SqlClient } from 'msnodesqlv8/types'
   const sql: SqlClient
   export = sql
}
