declare module 'msnodesqlv8' {
  /**
   * Query callback receiving rows of data from SQL Server
   */
  export type QueryCallback = (err?: Error, rows?: any[], more?: boolean) => void;

  /**
   * Status callback for operations like close, transactions
   */
  export type StatusCallback = (err?: Error) => void;

  /**
   * Connection callback
   */
  export type ConnectionCallback = (err?: Error, connection?: Connection) => void;

  /**
   * Query object returned from query operations
   */
  export interface Query {
    /**
     * Subscribe to query events
     * @param event Event type ('meta', 'column', 'row', 'done', 'error', etc.)
     * @param callback Callback for the event
     */
    on: (event: string, callback: Function) => void;

    /**
     * Cancel an in-progress query
     * @param callback Called when query is cancelled
     */
    cancelQuery: (callback?: StatusCallback) => void;

    /**
     * Pause a streaming query
     * @param callback Called when query is paused
     */
    pauseQuery: (callback?: StatusCallback) => void;

    /**
     * Resume a paused query
     * @param callback Called when query is resumed
     */
    resumeQuery: (callback?: StatusCallback) => void;

    /**
     * Check if the query is currently paused
     */
    isPaused: () => boolean;
  }

  /**
   * Connection to a SQL Server database
   */
  export interface Connection {
    /**
     * Execute a SQL query
     * @param sql SQL string to execute
     * @param paramsOrCallback Parameters for the query or callback for results
     * @param callback Callback for query results
     */
    query: (sql: string, paramsOrCallback?: any[] | QueryCallback, callback?: QueryCallback) => Query;

    /**
     * Close the database connection
     * @param callback Called when connection is closed
     */
    close: (callback: StatusCallback) => void;

    /**
     * Begin a transaction
     * @param callback Called when transaction begins
     */
    beginTransaction: (callback?: StatusCallback) => void;

    /**
     * Commit a transaction
     * @param callback Called when transaction commits
     */
    commit: (callback?: StatusCallback) => void;

    /**
     * Rollback a transaction
     * @param callback Called when transaction rolls back
     */
    rollback: (callback?: StatusCallback) => void;

    /**
     * Check if the connection is closed
     */
    isClosed: () => boolean;
  }

  /**
   * Connection class constructor
   */
  export class Connection implements Connection {
    constructor();

    /**
     * Open a connection to SQL Server
     * @param connectionString ODBC connection string
     * @param callback Called when connection is open or with error
     */
    open(connectionString: string, callback: ConnectionCallback): void;
  }

  /**
   * Set the log level for the driver
   * @param level Log level (0=Silent, 1=Error, 2=Warning, 3=Info, 4=Debug, 5=Trace)
   */
  export function setLogLevel(level: number): void;

  /**
   * Enable or disable console logging
   * @param enabled Whether console logging is enabled
   */
  export function enableConsoleLogging(enabled: boolean): void;

  /**
   * Set the log file path
   * @param filePath Path to log file
   */
  export function setLogFile(filePath: string): void;

  /**
   * Open a connection to a SQL Server database
   * @param connectionString ODBC connection string
   * @param callback Called with connection object or error
   */
  export function open(connectionString: string, callback: ConnectionCallback): void;

  /**
   * Execute a query against a SQL Server database
   * @param connectionString ODBC connection string
   * @param sql SQL query to execute
   * @param paramsOrCallback Query parameters or callback
   * @param callback Callback for query results
   */
  export function query(
      connectionString: string,
      sql: string,
      paramsOrCallback?: any[] | QueryCallback,
      callback?: QueryCallback
  ): Query;
}