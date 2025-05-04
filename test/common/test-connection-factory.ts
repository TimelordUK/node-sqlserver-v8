// test/common/test-connection-factory.ts
import { Connection, createConnection } from '../../src';
import connectionConfig from './connection-config';

export class TestConnectionFactory {
  constructor () {
  }
  public async createTestConnection (): Promise<Connection> {
    // Get the connection string from config
    const connectionString = connectionConfig.getConnectionString();

    // Create and open the connection
    const connection = createConnection();
    await connection.open(connectionString);
    return connection;
  }

  /**
   * Create a connection using a specific connection key
   * @param key Connection key (e.g., SQLSERVER_DEV18)
   * @returns Promise resolving to a Connection object
   */
  public async createConnectionByKey (key: string): Promise<Connection> {
    // Get the connection string for the specified key
    const connectionString = connectionConfig.getConnectionByKey(key);

    // Create and open the connection
    const connection = createConnection();
    await connection.open(connectionString);
    return connection;
  }

  /**
   * Get all available connection keys
   * @returns Array of connection keys
   */
  public getAvailableConnectionKeys (): string[] {
    return connectionConfig.getAvailableConnectionKeys();
  }

  /**
   * Check if a connection key exists
   * @param key Connection key to check
   * @returns True if the connection key exists
   */
  public hasConnectionKey (key: string): boolean {
    return connectionConfig.hasConnectionKey(key);
  }
}
