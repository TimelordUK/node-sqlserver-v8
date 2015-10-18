/**
 * Created by Stephen on 9/28/2015.
 */

/*
 supports bulk table operations, delete, modify and insert. Also capture table definition such that
 template sql statements can be used to insert single entries.  For insert, the first element
 represents the definition to use for all elements i.e. to bind to the statement in the native driver.
 the manager supports batches where preparation in driver can be preserved i.e. prepare batch
 of 100 against object will then allow 100 rows at a time to be sent to server before the entire
 transaction is ultimately committed.  Also provide some performance metrics to allow fine tuning
 of batch size.

 this manager will ultimately become the underlying mechanism for simple "entity framework" like
 transactions i.e. working with a concrete java script type that requires efficient binding to
 the database, thus it must be robust and simple to enhance.
 */

/*
 todo:
 1. delete via primary key - done - or allow user specified where columns.
 2. simple translation - e.g. json "buffer" to actual Buffer, parse string to int etc - can turn feature off.
 3. update - how to define where, need to know all index columns - or allow user specified.
 4. unit tests.
 */


var dm = require('./driverMgr');
var fs = require('fs');

var folder = __dirname;

exports.tableMgr = function (c) {
    var cache = {};
    var bulkTableManagers = {};
    var conn = c;
    var batch = 0;

    function readFile(f, done) {
        fs.readFile(f, 'utf8', function (err, data) {
            if (err) {
                done(err);
            } else
                done(data);
        });
    }

    function describeTable(tableName, callback) {

        var sql;
        readFile(folder + '/describe.sql', done);

        function done(data) {
            sql = data.replace("<table_name>", tableName);
            conn.query(sql, function (err, results) {
                callback(err, results);
            });
        }
    }

    /*
     based on an instance bind properties of that instance to a given table.
     Will have to allow for not all properties binding i.e. may be partial persistence - and allow for
     mappings i.e. object.myName = table.<name> or table.my_name etc.
     */

    function meta(tableName, cols) {

        var name = tableName;
        var allColumns = cols;
        var insertSignature = buildInsertForColumns();
        var primaryCols = getPrimaryCols();
        var whereCols = primaryCols;
        var deleteSignature = buildDeleteForColumns(whereCols);
        var selectSignature = buildSelectForColumns(whereCols);
        var colByName = {};
        for (var c = 0; c < allColumns.length; ++c) {
            colByName[allColumns[c].name] = allColumns[c];
        }

        function buildDeleteForColumns(colSubSet) {
            var sql = 'delete from ' + name + ' ';
            sql += buildWhereForColumns(colSubSet);
            return sql;
        }

        function buildSelectForColumns(colSubSet) {
            var sql = 'select * from ' + name + ' ';
            sql += buildWhereForColumns(colSubSet);
            return sql;
        }

        function getPrimaryCols() {
            var primaryKeyCols = [];
            allColumns.forEach(function (col) {
                if (col.is_primary_key) {
                    primaryKeyCols.push(col);
                }
            });
            return primaryKeyCols;
        }

        function buildWhereForColumns(colSubSet) {
            var sql = "where ( ";
            for (var i = 0; i < colSubSet.length; ++i) {
                var col = colSubSet[i];
                sql += col.name;
                sql += ' = ? '
                if (i < colSubSet.length - 1) sql += ' and ';
            }

            sql += " )";
            return sql;
        }

        function buildInsertForColumns() {
            var sql = "insert into " + name + " ( ";
            var count = 0;
            allColumns.forEach(function (col) {
                if (col.is_identity === 0
                    && col.is_computed === false) {
                    ++count;
                    sql += col.name;
                    sql += ", ";
                }
            });

            if (count > 0) {
                sql = sql.substr(0, sql.length - 2);
            }

            sql += " ) ";

            if (count > 0) {
                sql += "values (";
                for (var i = 0; i < count; ++i) {
                    sql += "?";
                    if (i < count - 1) sql += ", ";
                }
                sql += ")";
            }

            return sql;
        }

        function toString() {
            var s = {
                insert_signature: insertSignature,
                primary_columns: primaryCols,
                delete_signature: deleteSignature,
                columns: allColumns
            };
            return JSON.stringify(s);
        }

        // export api
        this.insert_signature = insertSignature;
        this.primary_columns = primaryCols;
        this.where_columns = whereCols;
        this.delete_signature = deleteSignature;
        this.select_signature = selectSignature;
        this.columns = allColumns;
        this.toString = toString;
        this.by_name = colByName;

        return this;
    }

    function describe(name, cb) {
        var tableMeta = cache[name];
        if (tableMeta == null) {
            describeTable(name, function (err, cols) {
                tableMeta = meta(name, cols);
                cache[name] = tableMeta;
                cb(tableMeta);
            });
        } else cb(tableMeta);
    }

    function bulkTableOpMgr(m) {

        var meta = m;

        // create an object of arrays where each array represents all values
        // for the batch.

        function prepare(vec, o, arrays) {
            var keys = [];
            if (vec.length === 0) return keys;
            meta.columns.forEach(function (col) {
                var property = col.name;
                if (meta.by_name.hasOwnProperty(property)
                    && meta.by_name[property].is_computed === false) {
                    keys.push(property);
                    var arr = o[property];
                    if (arr == null) {
                        arr = [];
                        o[property] = arr;
                        arrays.push(arr);
                    }
                }
            });
            return keys;
        }

        function arrayPerColumn(vec) {

            var o = {};
            var arrays = [];
            var keys = prepare(vec, o, arrays);

            vec.forEach(function (instance) {
                keys.forEach(function (property) {
                    var arr = o[property];
                    var val = instance.hasOwnProperty(property) ? instance[property] : null;
                    arr.push(val);
                });
            });

            return {
                arrays_by_name: o,
                array_of_arrays: arrays
            };
        }

        // if batch size is set, split the input into that batch size.

        function rowBatches(rows) {
            var batches = [];

            if (batch === 0) {
                batches.push(rows);
            } else {
                var b = [];
                for (var i = 0; i < rows.length; ++i) {
                    b.push(rows[i]);
                    if (b.length === batch) {
                        batches.push(b);
                        b = [];
                    }
                }
            }

            return batches;
        }

        // driver will have to recognise this is an array of arrays where each array
        // represents all values for that particular column.

        function insertRows(rows, callback) {

            function next(batch, done) {
                var sql = meta.insert_signature;
                var colArray = arrayPerColumn(batch).array_of_arrays;
                conn.query(sql, colArray, done);
            }

            batchIterator(rows, next, callback);
        }

        function updateRows(vec, done) {
        }

        function deleteRows(rows, callback) {
            whereForRows(meta.delete_signature, rows, callback);
        }

        function selectRows(rows, callback) {
            whereForRows(meta.select_signature, rows, callback);
        }

        function whereForRows(sql, rows, callback) {

            function next(batch, done) {
                var colsByName = arrayPerColumn(batch).arrays_by_name;
                var whereCols = meta.where_columns;
                var colArray = [];
                whereCols.forEach(function (col) {
                    if (colsByName.hasOwnProperty(col.name)) {
                        colArray.push(colsByName[col.name]);
                    }
                });
                conn.query(sql, colArray, done);
            }

            batchIterator(rows, next, callback);
        }

        function batchIterator(rows, iterate, callback) {
            var batches = rowBatches(rows);
            var b = 0;

            iterate(batches[b], done);

            function done(err, results) {
                ++b;
                if (err == null && b < batches.length) {
                    iterate(batches[b], done);
                } else callback(err, results);
            }
        }

        function getMeta() {
            return meta;
        }

        // public api

        this.insertRows = insertRows;
        this.selectRows = selectRows;
        this.deleteRows = deleteRows;
        this.getMeta = getMeta;

        return this;
    }

    function bind(table, cb) {
        describe(table, function (meta) {
            var mgr = bulkTableOpMgr(meta);
            bulkTableManagers[table] = mgr;
            cb(mgr);
        });
    }

    function setBatchSize(bs) {
        batch = bs;
    }

    this.describe = describe;
    this.bind = bind;
    this.setBatchSize = setBatchSize;

    return this;
};
