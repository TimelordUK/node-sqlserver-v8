function SqlTypes() {

    // var SQL_UNKNOWN_TYPE = 0;
    // var SQL_DECIMAL = 3;
    // var SQL_INTERVAL = 10;
    // var SQL_TIMESTAMP = 11;
    // var SQL_BINARY = -2;
    // var SQL_WCHAR = -8;
    // var SQL_SS_VARIANT = -150;
    // var SQL_SS_UDT = -151;
    // var SQL_SS_XML = -152;
    // var SQL_SS_TABLE = -153;

    var SQL_CHAR = 1;
    var SQL_NUMERIC = 2;
    var SQL_INTEGER = 4;
    var SQL_SMALLINT = 5;
    var SQL_FLOAT = 6;
    var SQL_REAL = 7;
    var SQL_DOUBLE = 8;
    var SQL_VARCHAR = 12;
    var SQL_LONGVARCHAR = -1;
    var SQL_VARBINARY = -3;
    var SQL_LONGVARBINARY = -4;
    var SQL_BIGINT = -5;
    var SQL_TINYINT = -6;
    var SQL_BIT = -7;
    var SQL_WVARCHAR = -9;
    var SQL_WLONGVARCHAR = -10;
    var SQL_TYPE_DATE = 91;
    var SQL_TYPE_TIMESTAMP = 93;
    var SQL_SS_TIME2 = -154;
    var SQL_SS_TIMESTAMPOFFSET = -155;

    // currently mapped in the driver .. either through a guess by looking at type or explicitly from user

    this.SQL_TINYINT = SQL_TINYINT;
    this.SQL_VARBINARY = SQL_VARBINARY;
    this.SQL_INTEGER = SQL_INTEGER;
    this.SQL_WVARCHAR = SQL_WVARCHAR;
    this.SQL_SS_TIMESTAMPOFFSET = SQL_SS_TIMESTAMPOFFSET;
    this.SQL_BIT = SQL_BIT;
    this.SQL_BIGINT = SQL_BIGINT;
    this.SQL_DOUBLE = SQL_DOUBLE;
    this.SQL_FLOAT = SQL_FLOAT;
    this.SQL_REAL = SQL_REAL;
    this.SQL_NUMERIC = SQL_NUMERIC;
    this.SQL_SMALLINT = SQL_SMALLINT;
    this.SQL_LONGVARBINARY = SQL_LONGVARBINARY;
    this.SQL_CHAR = SQL_CHAR;
    this.SQL_VARCHAR = SQL_VARCHAR;
    this.SQL_LONGVARCHAR = SQL_LONGVARCHAR;
    this.SQL_SS_TIME2 = SQL_SS_TIME2;
    this.SQL_TYPE_DATE = SQL_TYPE_DATE;
    this.SQL_TYPE_TIMESTAMP = SQL_TYPE_TIMESTAMP;
    this.SQL_WLONGVARCHAR = SQL_WLONGVARCHAR;

    return this;
}

var sqlTypes = new SqlTypes();

/*
 sql.UDT(value)
 sql.Geography(value)
 sql.Geometry(value)
 sql.Variant(value)
 */

//  sql.Bit(value)

function Bit(p) {
    return {
        sql_type: sqlTypes.SQL_BIT,
        value: p
    };
}

// sql.BigInt(value)

function BigInt (p) {
    return {
        sql_type: sqlTypes.SQL_BIGINT,
        value: p
    };
}

// sql.Float(value)

 function Float (p) {
    return {
        sql_type: sqlTypes.SQL_FLOAT,
        value: p
    };
}

// sql.Real(value)

function Real (p) {
    return {
        sql_type: sqlTypes.SQL_REAL,
        value: p
    };
}

// sql.Int(value)

function Int(p) {
    return {
        sql_type: sqlTypes.SQL_INTEGER,
        value: p
    };
}

// sql.SmallInt(value)

function SmallInt(p) {
    return {
        sql_type: sqlTypes.SQL_SMALLINT,
        value: p
    };
}

// sql.TinyInt(value)

function TinyInt(p) {
    return {
        sql_type: sqlTypes.SQL_TINYINT,
        value: p
    };
}

// sql.Numeric(value, [precision], [scale]) -- optional precision and scale definition

function Numeric(p, precision, scale) {
    return {
        sql_type: sqlTypes.SQL_NUMERIC,
        value: p,
        precision: precision > 0 ? precision : 0,
        scale: scale > 0 ? scale : 0
    };
}

// sql.Money(value) - uses underlying numeric type with driver computed precision/scale

function Money(p) {
    return {
        sql_type: sqlTypes.SQL_NUMERIC,
        value: p,
        precision: 0,
        scale: 0
    };
}

// sql.SmallMoney(value)

function VarBinary(p) {
    return {
        sql_type: sqlTypes.SQL_VARBINARY,
        value: p
    };
}

function LongVarBinary(p) {
    return {
        sql_type: sqlTypes.SQL_LONGVARBINARY,
        value: p
    };
}

function WVarChar(p) {
    return {
        sql_type: sqlTypes.SQL_WVARCHAR,
        value: p
    };
}

function WLongVarChar(p) {
    return {
        sql_type: sqlTypes.SQL_WLONGVARCHAR,
        value: p
    };
}

// sql.DateTimeOffset(value, [scale]) -- optional scale definition

function DateTimeOffset(p, scale, offset) {
    return {
        sql_type: sqlTypes.SQL_SS_TIMESTAMPOFFSET,
        value: p,
        scale: scale > 0 ? scale : 0,
        offset: offset > 0 ? offset : 0
    };
}

function Double(p) {
    return {
        sql_type: sqlTypes.SQL_DOUBLE,
        value: p
    };
}

// sql.Char(value, [length]) -- optional length definition

function Char(p, precision) {
    return {
        sql_type: sqlTypes.SQL_CHAR,
        value: p,
        precision: precision > 0 ? precision : 0
    };
}

// sql.VarChar(value, [length]) -- optional length definition

function VarChar(p, precision) {
    return {
        sql_type: sqlTypes.SQL_VARCHAR,
        value: p,
        precision: precision > 0 ? precision : 0
    };
}

// sql.Time(value, [scale]) -- optional scale definition

function Time2(p, scale) {
    return {
        sql_type: sqlTypes.SQL_SS_TIME2,
        value: p,
        scale: scale > 0 ? scale : 0
    };
}

function MyDate(p) {
    return {
        sql_type: sqlTypes.SQL_TYPE_DATE,
        value: p
    };
}

function DateTime(p) {
    return {
        sql_type: sqlTypes.SQL_TYPE_TIMESTAMP,
        value: p
    };
}

// fraction is not yet used by driver, this is a placeholder for potential use given
// a JS date only holds MS resolution.  Also presents an issue of how to pass this
// additional information back to the client.

// sql.DateTime2(value, [scale]) -- optional scale definition

function DateTime2(p, scale, fraction) {
    if (fraction == null && p) fraction = p.getUTCMilliseconds();
    return {
        sql_type: sqlTypes.SQL_TYPE_TIMESTAMP,
        value: p,
        fraction: fraction,
        scale: scale > 0 ? scale : 0
    };
}

// datetime Date round to 10 ms as fraction is not guaranteed

function DateRound(d, scale) {
    if (d == null) d = new Date();
    if (scale == null) scale = 10;
    var rms = Math.ceil(d.getUTCMilliseconds() / scale) * scale;
    return new Date(Date.UTC(d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        d.getUTCHours(),
        d.getUTCMinutes(),
        d.getUTCSeconds(),
        rms
    ));
}

exports.Bit = Bit;
exports.BigInt = BigInt;
exports.Float = Float;
exports.Int = Int;
exports.TinyInt = TinyInt;
exports.Numeric = Numeric;
exports.Money = Money;
exports.SmallMoney = Money;
exports.VarBinary = VarBinary;
exports.UniqueIdentifier = WVarChar;
exports.LongVarBinary = LongVarBinary;
exports.Image = LongVarBinary;
exports.WVarChar = WVarChar;
exports.Double = Double;
exports.Decimal = Numeric;
exports.SmallInt = SmallInt;
exports.Float = Float;
exports.Real = Real;
exports.Char = Char;
exports.VarChar = VarChar;
exports.WLongVarChar = WLongVarChar;
exports.NChar = Char;
exports.NVarChar = WVarChar;
exports.Text = VarChar;
exports.NText = WVarChar;
exports.Xml = WVarChar;
exports.Time2 = Time2;
exports.Time = Time2;
exports.MyDate = MyDate;
exports.DateTime = DateTime;
exports.DateTime2 = DateTime2;
exports.DateRound = DateRound;
exports.SmallDateTime = DateTime2;
exports.DateTimeOffset = DateTimeOffset;