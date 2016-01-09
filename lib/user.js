function SqlTypes() {

    var SQL_UNKNOWN_TYPE = 0;
    var SQL_CHAR = 1;
    var SQL_NUMERIC = 2;
    var SQL_DECIMAL = 3;
    var SQL_INTEGER = 4;
    var SQL_SMALLINT = 5;
    var SQL_FLOAT = 6;
    var SQL_REAL = 7;
    var SQL_DOUBLE = 8;
    var SQL_INTERVAL = 10;
    var SQL_TIMESTAMP = 11;
    var SQL_VARCHAR = 12;
    var SQL_LONGVARCHAR = -1;
    var SQL_BINARY = -2;
    var SQL_VARBINARY = -3;
    var SQL_LONGVARBINARY = -4;
    var SQL_BIGINT = -5;
    var SQL_TINYINT = -6;
    var SQL_BIT = -7;
    var SQL_WCHAR = -8;
    var SQL_WVARCHAR = -9;
    var SQL_WLONGVARCHAR = -10;
    var SQL_SS_VARIANT = -150;
    var SQL_SS_UDT = -151;
    var SQL_SS_XML = -152;
    var SQL_SS_TABLE = -153;
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
}

var sqlTypes = new SqlTypes();

/*
 sql.Xml(value)
 sql.UniqueIdentifier(value)

 sql.Time(value, [scale]) -- optional scale definition
 sql.Date(value)
 sql.DateTime(value)
 sql.DateTime2(value, [scale]) -- optional scale definition
 sql.DateTimeOffset(value, [scale]) -- optional scale definition
 sql.SmallDateTime(value)

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

function SSTimeStampOffset(p) {
    return {
        sql_type: sqlTypes.SQL_SS_TIMESTAMPOFFSET,
        value: p
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

exports.Bit = Bit;
exports.BigInt = BigInt;
exports.Float = Float;
exports.Int = Int;
exports.TinyInt = TinyInt;
exports.Numeric = Numeric;
exports.Money = Money;
exports.SmallMoney = Money;
exports.VarBinary = VarBinary;
exports.LongVarBinary = LongVarBinary;
exports.Image = LongVarBinary;
exports.WVarChar = WVarChar;
exports.SSTimeStampOffset = SSTimeStampOffset;
exports.Double = Double;
exports.Decimal = Numeric;
exports.SmallInt = SmallInt;
exports.Float = Float;
exports.Real = Real;
exports.Char = Char;
exports.VarChar = VarChar;
exports.NChar = Char;
exports.NVarChar = WVarChar;
exports.Text = VarChar;
exports.NText = WVarChar;
exports.Xml = WVarChar;