import { expect, assert } from 'chai'

import { Connection } from '../../src'
import * as nativeModule from '../../src/module-bridge'
import { TestConnectionFactory } from '../common/test-connection-factory'
import { QueryReader } from '../../src/query-reader'

import { logger, LogLevel } from '../../src/logger-facade'

describe('params query', function () {
    this.timeout(0)
    let theConnection: Connection
    const factory = new TestConnectionFactory()

    beforeEach(async function () {
        // Set logging options
        logger.configureDevelopment({
            logLevel: LogLevel.TRACE
        })

        // Create connection using the default connection string
        theConnection = await factory.createTestConnection()
    })

    afterEach(async function () {
        if (theConnection) {
            await theConnection.promises.close()
        }
    })

    function dropTableSql (tableName: string) {
        return `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE ${tableName}`
    }

    type HandlerFunction =  () => Promise<void>;

    async function testBoilerPlateAsync (tableName: string, tableFields: Record<string, string>, insertFunction: HandlerFunction, verifyFunction: HandlerFunction) {
        const fieldsSql = Object.keys(tableFields).map(field => `${field} ${tableFields[field]}`)
        const tableFieldsSql = `(id int identity, ${fieldsSql.join(', ')})`
        const promises = theConnection.promises
        const todrop = dropTableSql(tableName)
        await promises.submitReadAll(todrop)
        const createQuery = `CREATE TABLE ${tableName}${tableFieldsSql}`
        await promises.submitReadAll(createQuery)
        const clusteredIndexSql = ['CREATE CLUSTERED INDEX IX_', tableName, ' ON ', tableName, ' (id)'].join('')
        await promises.submitReadAll(clusteredIndexSql)
        if (insertFunction) await insertFunction()
        if (verifyFunction) await verifyFunction()
    }

    it('insert bigint as parameter', async function handler () {
        const tableName = 'test_bigint'
        await testBoilerPlateAsync(tableName, { bigint_test: 'bigint' },
            async function () {
                await theConnection.promises.submitReadAll(`INSERT INTO ${tableName} VALUES (?)`, [0x80000000])
            },
            async function handler () {
                const r = await theConnection.promises.submitReadAll(`SELECT bigint_test FROM ${tableName}`, [])
                const expectedMeta = [
                    {
                        name: 'bigint_test',
                        size: 19, nullable: true,
                        type: 'number',
                        sqlType: 'bigint'
                    }
                ]
                const expected = [
                    [0x80000000]
                ]
                const r0 = r.resultSets[0]
                //assert.deepStrictEqual(expected, r0.rows)
                //assert.deepStrictEqual(expectedMeta, r0.meta)
            })
    })
})
