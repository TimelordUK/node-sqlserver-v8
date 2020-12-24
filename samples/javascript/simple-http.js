const http = require('http')
const hostname = 'localhost'
const port = 2020
const sql = require('msnodesqlv8')
const util = require('util')

function getConnection () {
  const path = require('path')
  const config = require(path.join(__dirname, 'config.json'))
  return config.connection.local
}

const connectionString = getConnection()

const query = 'select top 50 object_name(c.object_id), (select dc.definition from sys.default_constraints as dc where dc.object_id = c.default_object_id) as DefaultValueExpression from sys.columns as c'

async function test (request, response) {
  response.statusCode = 200
  response.setHeader('Content-Type', 'text/plain')

  console.log('>> test')
  const sqlOpen = util.promisify(sql.open)
  try {
    console.log('sqlOpen ....')
    const connection = await sqlOpen(connectionString)
    console.log('..... sqlOpen')
    const connectionQuery = util.promisify(connection.queryRaw)
    const close = util.promisify(connection.close)
    try {
      const d = new Date()
      console.log('connectionQuery 1 ....')
      const data = await connectionQuery(query)
      console.log('... connectionQuery 1')
      const elapsed = new Date() - d
      console.log(`rows.length ${data.rows.length} elapsed ${elapsed}`)
      response.end(JSON.stringify(data, null, 4))
      console.log('close ...')
      await close()
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
