const http = require('http')
const hostname = 'localhost'
const port = 2020
const { TestEnv } = require('../../test/env/test-env')
const env = new TestEnv()
const connectionString = env.connectionString

const query = 'select top 50 object_name(c.object_id), (select dc.definition from sys.default_constraints as dc where dc.object_id = c.default_object_id) as DefaultValueExpression from sys.columns as c'

async function test (request, response) {
  response.statusCode = 200
  response.setHeader('Content-Type', 'text/plain')

  console.log('>> test')
  try {
    console.log('sqlOpen ....')
    const connection = await env.sql.promises.open(connectionString)
    console.log('..... sqlOpen')
    try {
      const d = new Date()
      console.log('connectionQuery 1 ....')
      const data = await connection.promises.query(query)
      console.log('... connectionQuery 1')
      const elapsed = new Date() - d
      console.log(`rows.length ${data.first.length} elapsed ${elapsed}`)
      response.end(JSON.stringify(data, null, 4))
      console.log('close ...')
      await connection.promises.close()
      console.log('... close')
      console.log('<< test')
    } catch (err) {
      response.end(err.message)
    }
  } catch (err) {
    response.end(err.message)
  }
}

const httpServer = http.createServer((request, response) => {
  test(request, response)
})
httpServer.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`)
})
