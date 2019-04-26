/**
 * Created by admin on 03/07/2016.
 */
const assert = require('assert')
const supp = require('../samples/typescript/demo-support')
const fs = require('fs')
const path = require('path')

function TestHelper (native, cstr) {
  const connStr = cstr
  const sql = native
  const support = new supp.DemoSupport(sql, cstr)
  const async = new support.Async()

  function testBoilerPlate (params, doneFunction) {
    const name = params.name
    const type = params.type
    let conn

    function readFile (f, done) {
      fs.readFile(f, 'utf8', (err, data) => {
        if (err) {
          done(err)
        } else {
          done(data)
        }
      })
    }

    const sequence = [

      asyncDone => {
        sql.open(connStr, (err, c) => {
          assert.ifError(err)
          conn = c
          asyncDone()
        })
      },

      asyncDone => {
        var dropSql = 'DROP TABLE ' + name
        conn.query(dropSql, () => {
          asyncDone()
        })
      },

      asyncDone => {
        let file = path.join(__dirname, '/sql/', name)
        file += '.sql'

        function inChunks (arr, callback) {
          let i = 0
          conn.query(arr[i], next)

          function next (err, res) {
            assert.ifError(err)
            assert(res.length === 0)
            ++i
            if (i < arr.length) {
              conn.query(arr[i], next)
            } else {
              callback()
            }
          }
        }

        // submit the SQL one chunk at a time to create table with constraints.
        readFile(file, createSql => {
          createSql = createSql.replace(/<name>/g, name)
          createSql = createSql.replace(/<type>/g, type)
          var arr = createSql.split('GO')
          for (var i = 0; i < arr.length; ++i) {
            arr[i] = arr[i].replace(/^\s+|\s+$/g, '')
          }
          inChunks(arr, () => {
            asyncDone()
          })
        })
      },
      asyncDone => {
        conn.close(() => {
          asyncDone()
        })
      }
    ]

    async.series(sequence,
      () => {
        doneFunction()
      })
  }

  function getJSON () {
    const folder = __dirname
    const fs = require('fs')
    const parsedJSON = JSON.parse(fs.readFileSync(folder + '/json/employee.json', 'utf8'))

    for (let i = 0; i < parsedJSON.length; ++i) {
      parsedJSON[i].OrganizationNode = Buffer.from(parsedJSON[i].OrganizationNode.data, 'utf8')
      parsedJSON[i].BirthDate = new Date(parsedJSON[i].BirthDate)
      parsedJSON[i].HireDate = new Date(parsedJSON[i].HireDate)
      parsedJSON[i].ModifiedDate = new Date(parsedJSON[i].ModifiedDate)
    }
    return parsedJSON
  }

  this.testBoilerPlate = testBoilerPlate
  this.getJSON = getJSON

  return this
}

exports.TestHelper = TestHelper
