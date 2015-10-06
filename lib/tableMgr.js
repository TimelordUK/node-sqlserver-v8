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

var dm = require('./driverMgr');

exports.tableMgr = function (c, ops, ext) {
    var cache = {};
    var bulkTableMgrs = {};
    var conn = c;
    var q = ops;
    var native = ext;

    function describeTable(tableName, callback) {
        var q =
            "SELECT \n"
            + "c.name 'name', \n"
            + "t.Name 'type', \n"
            + "c.max_length 'max_length',\n"
            + "c.precision,\n"
            + "c.scale ,\n"
            + "c.is_nullable,\n"
            + "ISNULL(i.is_primary_key, 0) 'key',\n"
            + "columnproperty(c.object_id, c.name, 'isIdentity') as is_identity\n"
            + "FROM \n"
            + "sys.columns c\n"
            + "INNER JOIN\n"
            + "sys.types t ON c.user_type_id = t.user_type_id\n"
            + "LEFT OUTER JOIN\n"
            + "sys.index_columns ic ON ic.object_id = c.object_id AND ic.column_id = c.column_id\n"
            + "LEFT OUTER JOIN\n"
            + "sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id\n"
            + "WHERE \n"
            + "c.object_id = OBJECT_ID('" + tableName + "')";

        conn.query(q, function (err, results) {
            callback(err, results);
        });
    }

    /*
     based on an instance bind properties of that instance to a given table.
     Will have to allow for not all properties binding i.e. may be partial persistence - and allow for
     mappings i.e. object.myName = table.<name> or table.my_name etc.
     */

    function describe(name, cb) {
        var meta = cache[name];
        if (meta == null) {
            describeTable(name, function (err, cols) {
                var signature = build(name, cols);
                var meta = {
                    insert_signature: signature,
                    columns: cols
                };
                cache[name] = meta;
                cb(meta);
            });
        } else cb(meta);
    }

    /*
     name	        type	max_length	precision	scale	is_nullable	key	is_identity
     id	            int	    4	        10	        0	    0	        0	1
     decimal_test	decimal	9	        18	        7	    1	        0	0
     */

    function build(name, cols) {
        var sql = "insert into " + name + " ( ";
        var count = 0;
        cols.forEach(function (col) {
            if (col.is_identity === 0) {
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

    function bulkTableOpMgr(n, m) {

        this.name = n;
        this.meta = m;

        function prepare(vec, o, arrays) {
            var keys = [];
            if (vec.length === 0) return keys;
            var first = vec[0];
            for (var property in first) {
                if (first.hasOwnProperty(property)) {
                    keys.push(property);
                    var arr = o[property];
                    if (arr == null) {
                        arr = [];
                        o[property] = arr;
                        arrays.push(arr);
                    }
                }
            }
            return keys;
        }

        function asVectors(vec) {

            var o = {};
            var arrays = [];
            var keys = prepare(vec, o, arrays);

            vec.forEach(function (instance) {
                keys.forEach(function (property) {
                    var arr = o[property];
                    arr.push(instance[property]);
                });
            });

            return arrays;
        }

        function insertRows(vec, done) {
            var cols = asVectors(vec);
        }

        function updateRows(vec, done) {
        }

        function deleteRows(vec, done) {
        }

        this.insertRows = insertRows;
        this.updateRows = updateRows;
        this.deleteRows = deleteRows;

        return this;
    }

    function bind(table, cb) {
        describe(table, function (meta) {
            var mgr = bulkTableOpMgr(table, meta);
            bulkTableMgrs[table] = mgr;
            cb(mgr);
        });
    }

    this.describe = describe;
    this.bind = bind;

    return this;
};
