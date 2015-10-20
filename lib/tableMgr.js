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
        var primaryCols = getPrimaryCols();
        setWhereCols(primaryCols);
        var colByName = {};

        for (var c = 0; c < allColumns.length; ++c) {
            colByName[allColumns[c].name] = allColumns[c];
        }

        function buildDeleteForColumns(colSubSet) {
            var sql = 'delete from ' + name + ' ';
            sql += buildWhereForColumns(colSubSet);
            return sql;
        }

        function columnsSql(colSubSet) {
            var sql = ''
            for (var i = 0; i < colSubSet.length; ++i) {
                var col = colSubSet[i];
                sql += col.name;
                if (i < colSubSet.length - 1) {
                    sql += ", ";
                }
            }
            return sql;
        }

        function buildSelectForColumns(colSubSet) {
            var colList = columnsSql(allColumns);
            var sql = 'select ';
            sql += colList;
            sql += ' from ';
            sql += name + ' ';
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

        function assignableColumns() {
            var subSet = [];
            allColumns.forEach(function (col) {
                if (col.is_identity === 0
                    && col.is_computed === false) {
                    subSet.push(col);
                }
            });
            return subSet;
        }

        function buildInsertForColumns() {
            var sql = "insert into ";
            sql += name;
            var subSet = assignableColumns();
            sql += " ( ";
            sql += columnsSql(subSet);
            sql += ") ";
            if (subSet.length > 0) {
                sql += "values ( ";
                for (var i = 0; i < subSet.length; ++i) {
                    sql += "?";
                    if (i < subSet.length - 1) sql += ", ";
                }
                sql += " )";
            }


            return sql;
        }

        function getSummary() {
            var s = {
                insert_signature: this.insert_signature,
                where_columns: this.where_columns,
                select_signature: this.select_signature,
                delete_signature: this.delete_signature,
                columns: allColumns
            };

            return s;
        }

        function toString() {
            var s = getSummary();
            return JSON.stringify(s);
        }

        // export api

        function setWhereCols(colSubSet) {
            this.where_columns = colSubSet;
            this.insert_signature = buildInsertForColumns();
            this.delete_signature = buildDeleteForColumns(colSubSet);
            this.select_signature = buildSelectForColumns(colSubSet);
        }

        this.columns = allColumns;
        this.toString = toString;
        this.by_name = colByName;
        this.getSummary = getSummary;
        this.setWhereCols = setWhereCols;

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
            var res = [];
            whereForRowsNoBatch(meta.select_signature, rows, function (err, results, more) {
                results.forEach(function (r) {
                    res.push(r);
                });
                if (!more) {
                    callback(err, res);
                }
            });
        }

        // given the input array of objects consisting of potentially all columns, strip out
        // the sub set corresponding to the where column set.

        function arrayPerColumnForWhereCols(rows) {
            var colsByName = arrayPerColumn(rows).arrays_by_name;
            var whereCols = meta.where_columns;
            var colArray = [];

            whereCols.forEach(function (col) {
                if (colsByName.hasOwnProperty(col.name)) {
                    colArray.push(colsByName[col.name]);
                }
            });
            return colArray;
        }

        // for a bulk select, do not use batching.

        function whereForRowsNoBatch(sql, rows, callback) {
            var colArray = arrayPerColumnForWhereCols(rows);
            conn.query(sql, colArray, callback);
        }

        // delete using a batch at a time.

        function whereForRows(sql, rows, callback) {
            function next(batch, done) {
                var colArray = arrayPerColumnForWhereCols(batch);
                conn.query(sql, colArray, done);
            }
            batchIterator(rows, next, callback);
        }

        function batchIterator(rows, iterate, callback) {
            var batches = rowBatches(rows);
            var b = 0;

            iterate(batches[b], done);

            function done(err, results, more) {
                ++b;
                if (err == null && b < batches.length) {
                    if (!more) iterate(batches[b], done);
                } else callback(err, results, more);
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
