/**
 * Created by Stephen on 9/28/2015.
 */

/*
 supports bulk table operations, delete, modify and insert. Also capture table definition such that
 template sql statements can be used to insert single entries.

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

var fs = require('fs');

var folder = __dirname;

function TableMgr(c) {

    var cache = {};
    var bulkTableManagers = {};
    var theConnection = c;

    function readFile(f, done) {
        fs.readFile(f, 'utf8', function (err, data) {
            if (err) {
                done(err);
            } else
                done(data);
        });
    }

    function describeTable(tableName, callback) {

        var cat;
        theConnection.query('select DB_NAME() as cat', read);
        function read(err, res) {
            if (err != null) callback(err, res);
            cat = res[0]['cat'];
            var sql;
            readFile(folder + '/describe.sql', done);

            function done(data) {
                var tableParts = tableName.split(/\.(?![^\[]*\])/g); //Split table names like 'dbo.table1' to: ['dbo', 'table1'] and 'table1' to: ['table1']
                var table = tableParts[tableParts.length - 1]; //get the table name
                var fullTableName = table;
                var schema = tableParts[tableParts.length - 2] || ''; //get the table schema, if missing set schema to ''
                if (tableParts.length > 2) {
                    cat = tableParts[tableParts.length - 3];
                }else if (table[0] == '#') {
                    cat = 'tempdb';
                    fullTableName = cat + '.' + schema + '.' + table;
                }
                sql = data.replace(/<table_name>/g, table.replace(/^\[|\]$/g, '').replace(/\]\]/g, ']')) //removes brackets at start end end, change ']]' to ']'
                    .replace(/<table_schema>/g, schema.replace(/^\[|\]$/g, '').replace(/\]\]/g, ']')) //removes brackets at start end end, change ']]' to ']'
                    .replace(/<escaped_table_name>/g, fullTableName) // use the escaped table name for the OBJECT_ID() function
                    .replace(/<table_catalog>/g, cat); // use the escaped table name for the OBJECT_ID() function

                theConnection.query(sql, function (err, results) {
                    callback(err, results);
                });
            }
        }
    }

    /*
     based on an instance bind properties of that instance to a given table.
     Will have to allow for not all properties binding i.e. may be partial persistence - and allow for
     mappings i.e. object.myName = table.<name> or table.my_name etc.
     */

/*
    table_catalog	table_schema	table_name	name	type	max_length	precision	scale	is_nullable	is_computed	is_identity	object_id	is_primary_key	is_foreign_key
    tempdb	dbo	##gtt_tmpsj	id	int	4	10	0	0	0	1	309576141	0	0
    tempdb	dbo	##gtt_tmpsj	money_test	money	8	19	4	1	0	0	309576141	0	0
    */

    function Meta(tableName, cols) {

        var fullTableName = cols.length > 0 ?  getFullName() : tableName;

        function getFullName() {
            var first = cols[0];
            var table_catalog = first['table_catalog'];
            var table_schema = first['table_schema'];
            var table_name =  first['table_name'];
            return table_catalog + '.' + table_schema + '.' + table_name;
        }

        var allColumns = cols;

        var insert_signature;
        var where_columns;
        var update_columns;
        var select_signature;
        var delete_signature;
        var update_signature;
        var assignableColumns = recalculateAssignableColumns();

        var primaryCols = recalculatePrimaryColumns();
        var primaryByName = {};
        var c;

        for (c = 0; c < primaryCols.length; ++c) {
            primaryByName[primaryCols[c].name] = primaryCols[c];
        }

        var colByName = {};

        for (c = 0; c < allColumns.length; ++c) {
            colByName[allColumns[c].name] = allColumns[c];
        }

        setWhereCols(primaryCols);
        setUpdateCols(recalculateUpdateColumns());

        function buildDeleteForColumns(colSubSet) {
            var sql = 'delete from ' + fullTableName + ' ';
            sql += buildWhereForColumns(colSubSet);
            return sql;
        }

        function columnsSql(colSubSet) {
            var sql = '';
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
            sql += fullTableName + ' ';
            sql += buildWhereForColumns(colSubSet);
            return sql;
        }

        function recalculatePrimaryColumns() {
            var primaryKeyCols = [];
            allColumns.forEach(function (col) {
                //noinspection JSUnresolvedVariable
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
                sql += ' = ? ';
                if (i < colSubSet.length - 1) sql += ' and ';
            }

            sql += " )";
            return sql;
        }

        function recalculateAssignableColumns() {
            var subSet = [];
            allColumns.forEach(function (col) {
                //noinspection JSUnresolvedVariable
                if (col.is_identity === false
                    && col.is_computed === false) {
                    subSet.push(col);
                }
            });
            return subSet;
        }

        function recalculateUpdateColumns() {
            var assignable = recalculateAssignableColumns();
            var subSet = [];
            assignable.forEach(function (col) {
                if (!primaryByName.hasOwnProperty(col.name))
                    subSet.push(col);
            });
            return subSet;
        }

        function buildUpdateForColumns(subSet) {
            var sql = "update " + fullTableName;
            sql += " set ";
            for (var i = 0; i < subSet.length; ++i) {
                sql += subSet[i].name;
                sql += ' = ?';
                if (i < subSet.length - 1) sql += ", ";
            }
            var where = buildWhereForColumns(where_columns);
            sql += ' ';
            sql += where;
            return sql;
        }

        function buildInsertForColumns() {
            var sql = "insert into ";
            sql += fullTableName;
            var subSet = recalculateAssignableColumns();
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
            return {
                insert_signature : insert_signature,
                where_columns : where_columns,
                update_columns : update_columns,
                select_signature : select_signature,
                delete_signature : delete_signature,
                update_signature : update_signature,
                columns : allColumns,
                primaryColumns : primaryCols,
                assignableColumns : assignableColumns,
                by_name : colByName
            };
        }

        function toString() {
            var s = getSummary();
            return JSON.stringify(s);
        }

        // export api

        function setWhereCols(colSubSet) {
            var subSet = [];
            colSubSet.forEach(function (c) {
                if (colByName.hasOwnProperty(c.name))
                    subSet.push(colByName[c.name]);
            });

            where_columns = subSet;
            insert_signature = buildInsertForColumns();
            delete_signature = buildDeleteForColumns(subSet);
            select_signature = buildSelectForColumns(subSet);
            update_signature = buildUpdateForColumns(subSet);

            return select_signature;
        }

        function setUpdateCols(colSubSet) {
            var subSet = [];
            colSubSet.forEach(function (c) {
                if (colByName.hasOwnProperty(c.name))
                    subSet.push(colByName[c.name]);
            });
            update_columns = subSet;
            update_signature = buildUpdateForColumns(update_columns);

            return update_signature;
        }

        function getAllColumns() {
            return allColumns;
        }

        function getInsertSignature() {
            return insert_signature;
        }

        function getWhereColumns() {
            return where_columns;
        }

        function getUpdateColumns() {
            return update_columns;
        }

        function getSelectSignature() {
            return select_signature;
        }

        function getDeleteSignature() {
            return delete_signature;
        }

        function getUpdateSignature() {
            return update_signature;
        }

        function getPrimaryColumns() {
            return primaryCols;
        }

        function getAssignableColumns() {
            return assignableColumns;
        }

        function getColumnsByName() {
            return colByName;
        }

        var public_api = {
            getAllColumns : getAllColumns,
            toString : toString,
            getSummary : getSummary,
            setWhereCols : setWhereCols,
            setUpdateCols : setUpdateCols,

            getInsertSignature : getInsertSignature,
            getSelectSignature : getSelectSignature,
            getDeleteSignature : getDeleteSignature,
            getUpdateSignature : getUpdateSignature,
            getColumnsByName : getColumnsByName,
            getWhereColumns : getWhereColumns,
            getUpdateColumns : getUpdateColumns,
            getPrimaryColumns : getPrimaryColumns,
            getAssignableColumns : getAssignableColumns
        };

        return public_api;
    }

    function describe(name, cb) {
        var tableMeta = cache[name];
        if (tableMeta == null) {
            describeTable(name, function (err, cols) {
                tableMeta = new Meta(name, cols);
                cache[name] = tableMeta;
                cb(tableMeta);
            });
        } else cb(tableMeta);
    }

    function BulkTableOpMgr(m) {

        var meta = m;
        var batch = 0;
        var summary = meta.getSummary();

        // create an object of arrays where each array represents all values
        // for the batch.

        function prepare(vec, o, arrays) {
            var keys = [];
            if (vec.length === 0) return keys;
            summary.columns.forEach(function (col) {
                var property = col.name;
                //noinspection JSUnresolvedVariable
                if (summary.by_name.hasOwnProperty(property)
                    && summary.by_name[property].is_computed === false) {
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

            var arrayColumnByName = {};
            var arrayOfArrays = [];
            var keys = prepare(vec, arrayColumnByName, arrayOfArrays);

            vec.forEach(function (instance) {
                keys.forEach(function (property) {
                    var columnValues = arrayColumnByName[property];
                    var val = instance.hasOwnProperty(property) ? instance[property] : null;
                    columnValues.push(val);
                });
            });

            return {
                arrays_by_name: arrayColumnByName,
                array_of_arrays: arrayOfArrays
            };
        }

        // if batch size is set, split the input into that batch size.

        function rowBatches(rows) {
            var batches = [];
            if (batch === 0) {
                batches.push(rows);
            } else {
                var singleBatch = [];
                for (var i = 0; i < rows.length; ++i) {
                    singleBatch.push(rows[i]);
                    if (singleBatch.length === batch) {
                        batches.push(singleBatch);
                        singleBatch = [];
                    }
                }
            }

            return batches;
        }

        // driver will have to recognise this is an array of arrays where each array
        // represents all values for that particular column.

        function insertRows(rows, callback) {

            function next(batch, done) {
                var sql = summary.insert_signature;
                var colArray = arrayPerColumnForCols(batch, summary.assignableColumns);
                theConnection.query(sql, colArray, done);
            }

            batchIterator(rows, next, callback);
        }

        function updateRows(rows, callback) {
            updateForRows(summary.update_signature, rows, callback);
        }

        function deleteRows(rows, callback) {
            whereForRows(summary.delete_signature, rows, callback);
        }

        function selectRows(rows, callback) {
            var res = [];
            whereForRowsNoBatch(summary.select_signature, rows, function (err, results, more) {
                results.forEach(function (r) {
                    res.push(r);
                });
                if (!more) {
                    callback(err, res);
                }
            });
        }

        // given the input array of asObjects consisting of potentially all columns, strip out
        // the sub set corresponding to the where column set.

        function arrayPerColumnForCols(rows, colSubSet) {
            var colsByName = arrayPerColumn(rows).arrays_by_name;
            var colArray = [];

            colSubSet.forEach(function (col) {
                if (colsByName.hasOwnProperty(col.name)) {
                    colArray.push(colsByName[col.name]);
                }
            });
            return colArray;
        }

        // for a bulk select, do not use batching.

        function whereForRowsNoBatch(sql, rows, callback) {
            var colArray = arrayPerColumnForCols(rows, summary.where_columns);
            theConnection.query(sql, colArray, callback);
        }

        // delete using a batch at a time.

        function whereForRows(sql, rows, callback) {
            function next(batch, done) {
                var colArray = arrayPerColumnForCols(batch, summary.where_columns);
                theConnection.query(sql, colArray, done);
            }

            batchIterator(rows, next, callback);
        }

        function updateForRows(sql, rows, callback) {
            function next(batch, done) {
                var updateArray = arrayPerColumnForCols(batch, summary.update_columns);
                var whereArray = arrayPerColumnForCols(batch, summary.where_columns);
                var colArray = updateArray.concat(whereArray);
                theConnection.query(sql, colArray, done);
            }

            batchIterator(rows, next, callback);
        }

        function batchIterator(rows, iterate, callback) {
            var batches = rowBatches(rows);
            var batchIndex = 0;

            iterate(batches[batchIndex], done);

            function done(err, results, more) {
                ++batchIndex;
                if (err == null && batchIndex < batches.length) {
                    if (!more) iterate(batches[batchIndex], done);
                } else callback(err, results, more);
            }
        }

        function getMeta() {
            return meta;
        }

        function setBatchSize(batchSize) {
            batch = batchSize;
        }

        function setWhereCols(whereCols) {
            meta.setWhereCols(whereCols);
            summary = meta.getSummary();
        }

        function setUpdateCols(updateCols) {
            meta.setUpdateCols(updateCols);
            summary = meta.getSummary();
        }

        function getSummary() {
            return meta.getSummary();
        }

        // public api

        var public_api = {
            insertRows : insertRows,
            selectRows : selectRows,
            deleteRows : deleteRows,
            updateRows : updateRows,
            setBatchSize : setBatchSize,
            setWhereCols : setWhereCols,
            setUpdateCols : setUpdateCols,
            getMeta : getMeta,
            meta : meta,
            columns : meta.getAllColumns(),
            getSummary : getSummary
        };

        return public_api;
    }

    function bind(table, cb) {
        describe(table, function (meta) {
            var bulkMgr = new BulkTableOpMgr(meta);
            bulkTableManagers[table] = bulkMgr;
            cb(bulkMgr);
        });
    }

    var public_api = {
        describe: describe,
        bind: bind
    };

    return public_api;
}

exports.TableMgr = TableMgr;
