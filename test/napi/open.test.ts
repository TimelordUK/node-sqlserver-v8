// test/napi/open.ts
import { expect } from 'chai';
import { Connection } from '../../src';
import * as nativeModule from 'msnodesqlv8';
import { TestConnectionFactory } from '../common/test-connection-factory'


// Set logging options
nativeModule.setLogLevel(4); // Debug level
nativeModule.enableConsoleLogging(true);

describe('open', function() {
  this.timeout(0)
  let connection: Connection | null = null;
  const factory = new TestConnectionFactory();

  beforeEach(async function() {
    // Create connection using the default connection string
    connection = await factory.createTestConnection();
  });

  afterEach(async function() {
    if (connection) {
      await connection.promises.close();
    }
  });

  it('will call open on the cpp object', async function() {
    console.log('Connection opened successfully');
    expect(connection).to.not.be.null;
  });

  // Additional test to verify we can connect with a specific key
  it('can open connection with a specific key if available', async function() {
    // Get the first available connection key
    const connectionKeys = factory.getAvailableConnectionKeys();
    if (connectionKeys.length > 0) {
      const specificKey = connectionKeys[0];
      console.log(`Testing connection with key: ${specificKey}`);

      // Close the existing connection first
      if (connection) {
        await connection.promises.close();
      }

      // Create a new connection with the specific key
      connection = await factory.createConnectionByKey(specificKey);
      expect(connection).to.not.be.null;
    } else {
      this.skip();
    }
  });
});
