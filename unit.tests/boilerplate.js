/**
 * Created by admin on 03/07/2016.
 */
var assert = require('assert')
var supp = require('../samples/typescript/demo-support')
var fs = require('fs')
var path = require('path')

function TestHelper (native, cstr) {
  var connStr = cstr
  var sql = native
  var support = new supp.DemoSupport(sql, cstr)
  var async = new support.Async()

  function testBoilerPlate (params, doneFunction) {
    var name = params.name
    var type = params.type
    var conn

    function readFile (f, done) {
      fs.readFile(f, 'utf8', function (err, data) {
        if (err) {
          done(err)
        } else {
          done(data)
        }
      })
    }

    var sequence = [

      function (asyncDone) {
        sql.open(connStr, function (err, c) {
          assert.ifError(err)
          conn = c
          asyncDone()
        })
      },

      function (asyncDone) {
        var dropSql = 'DROP TABLE ' + name
        conn.query(dropSql, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        var file = path.join(__dirname, '/sql/', name)
        file += '.sql'

        function inChunks (arr, callback) {
          var i = 0
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
        readFile(file, function (createSql) {
          createSql = createSql.replace(/<name>/g, name)
          createSql = createSql.replace(/<type>/g, type)
          var arr = createSql.split('GO')
          for (var i = 0; i < arr.length; ++i) {
            arr[i] = arr[i].replace(/^\s+|\s+$/g, '')
          }
          inChunks(arr, function () {
            asyncDone()
          })
        })
      },
      function (asyncDone) {
        conn.close(function () {
          asyncDone()
        })
      }
    ]

    async.series(sequence,
      function () {
        doneFunction()
      })
  }

  function getJSON () {
    var folder = __dirname
    var fs = require('fs')
    var parsedJSON = JSON.parse(fs.readFileSync(folder + '/json/employee.json', 'utf8'))

    for (var i = 0; i < parsedJSON.length; ++i) {
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
