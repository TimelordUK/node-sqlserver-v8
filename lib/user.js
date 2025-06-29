'use strict'

const userModule = ((() => {
  /*
 sql.UDT(value)
 sql.Geography(value)
 sql.Geometry(value)
 sql.Variant(value)
 */

  function SqlTypes () {
    const SQL_UNKNOWN_TYPE = 0
    const SQL_DECIMAL = 3
    // var SQL_INTERVAL = 10;
    // var SQL_TIMESTAMP = 11;
    const SQL_BINARY = -2
    // var SQL_WCHAR = -8;
    // var SQL_SS_VARIANT = -150;
    // var SQL_SS_UDT = -151;
    // var SQL_SS_XML = -152;
    const SQL_SS_TABLE = -153
    const SQL_CHAR = 1
    const SQL_NUMERIC = 2
    const SQL_INTEGER = 4
    const SQL_SMALLINT = 5
    const SQL_FLOAT = 6
    const SQL_REAL = 7
    const SQL_DOUBLE = 8
    const SQL_VARCHAR = 12
    // var SQL_LONGVARCHAR = -1;
    const SQL_VARBINARY = -3
    const SQL_LONGVARBINARY = -4
    const SQL_BIGINT = -5
    const SQL_TINYINT = -6
    const SQL_BIT = -7
    const SQL_WVARCHAR = -9
    const SQL_WLONGVARCHAR = -10
    const SQL_TYPE_DATE = 91
    const SQL_TYPE_TIMESTAMP = 93
    const SQL_SS_TIME2 = -154
    const SQL_SS_TIMESTAMPOFFSET = -155

    // currently mapped in the driver either through a guess by looking at type or explicitly from user

    class ConcreteColumnType {
      parseHHMMSS (s) {
        const rehhmmss = /(\d?\d):(\d?\d):(\d?\d)$/g
        if (typeof s === 'string') {
          const match = rehhmmss.exec(s)
          if (match) {
            const [, hh, mm, ss] = match
            this.value = new Date(Date.UTC(1900, 0, 1,
              parseInt(hh),
              parseInt(mm),
              parseInt(ss)))
            return true
          }
          return false
        }
      }

      parseMMSS (s) {
        const rehhmmss = /(\d?\d):(\d?\d)$/g
        if (typeof s === 'string') {
          const match = rehhmmss.exec(s)
          if (match) {
            const [, mm, ss] = match
            this.value = new Date(Date.UTC(1900, 0, 1,
              0,
              parseInt(mm),
              parseInt(ss)))
            return true
          }
          return false
        }
      }

      parseSS (s) {
        const rehhmmss = /(\d?\d)$/g
        if (typeof s === 'string') {
          const match = rehhmmss.exec(s)
          if (match) {
            const [, ss] = match
            this.value = new Date(Date.UTC(1900, 0, 1,
              0,
              0,
              parseInt(ss)))
            return true
          }
          return false
        }
      }

      parse (s) {
        if (!this.parseHHMMSS(s) && !this.parseMMSS(s) /* && !this.parseSS(s) */) {
          this.value = (typeof s === 'string') ? new Date(s) : s
        }
      }

      calcFraction (value, fraction) {
        if (!fraction && value) {
          fraction = 0
          if (Array.isArray(value)) {
            if (value.length > 0) {
              const s = value.find(o => !!o)
              if (s) {
                fraction = s.getUTCMilliseconds()
              }
            }
          } else {
            fraction = value.getUTCMilliseconds()
          }
        }
        return fraction
      }

      constructor (sqlType, value, precision, scale, offset, fraction) {
        precision = precision > 0
          ? precision
          : 0
        scale = scale > 0
          ? scale
          : 0

        this.sql_type = sqlType
        this.value = value
        this.precision = precision
        this.scale = scale
        this.offset = offset
        this.isDateTime = sqlType === SQL_TYPE_TIMESTAMP
        if (this.isDateTime) {
          this.fraction = this.calcFraction(value, fraction)
        }
        this.isTime2 = sqlType === SQL_SS_TIME2
        if (this.isTime2) {
          this.precision = this.precision || 16
          this.scale = this.scale || 7
        }
        this.money = false
      }
    }

    function Bit (p) {
      return new ConcreteColumnType(SQL_BIT, p)
    }

    // sql.BigInt(value)

    function BigInt (p) {
      return new ConcreteColumnType(SQL_BIGINT, p)
    }

    // sql.Float(value)

    function Float (p) {
      return new ConcreteColumnType(SQL_FLOAT, p)
    }

    // sql.Real(value)

    function Real (p) {
      return new ConcreteColumnType(SQL_REAL, p)
    }

    // sql.Int(value)

    function Int (p) {
      return new ConcreteColumnType(SQL_INTEGER, p)
    }

    // sql.SmallInt(value)

    function SmallInt (p) {
      return new ConcreteColumnType(SQL_SMALLINT, p)
    }

    // sql.TinyInt(value)

    function TinyInt (p) {
      return new ConcreteColumnType(SQL_TINYINT, p)
    }

    // sql.Numeric(value, [precision], [scale]) -- optional precision and scale definition

    function Numeric (p, precision, scale) {
      return new ConcreteColumnType(SQL_NUMERIC, p, precision, scale)
    }

    function Decimal (p, precision, scale) {
      return new ConcreteColumnType(SQL_DECIMAL, p, precision, scale)
    }

    // sql.Money(value) - uses underlying numeric type with driver computed precision/scale

    function Money (p) {
      const c = new ConcreteColumnType(SQL_NUMERIC, p, 0, 0)
      c.money = true
      return c
    }

    // sql.SmallMoney(value)

    function Binary (p) {
      return new ConcreteColumnType(SQL_BINARY, p, 0, 0)
    }

    function VarBinary (p) {
      return new ConcreteColumnType(SQL_VARBINARY, p, 0, 0)
    }

    function Unknown (p) {
      return new ConcreteColumnType(SQL_UNKNOWN_TYPE, p, 0, 0)
    }

    function LongVarBinary (p) {
      return new ConcreteColumnType(SQL_LONGVARBINARY, p, 0, 0)
    }

    function WVarChar (p) {
      return new ConcreteColumnType(SQL_WVARCHAR, p, 0, 0)
    }

    function WLongVarChar (p) {
      return new ConcreteColumnType(SQL_WLONGVARCHAR, p, 0, 0)
    }

    // sql.DateTimeOffset(value, [scale]) -- optional scale definition

    function DateTimeOffset (p, scale, offset) {
      return new ConcreteColumnType(SQL_SS_TIMESTAMPOFFSET, p, undefined, scale, offset)
    }

    function Double (p) {
      return new ConcreteColumnType(SQL_DOUBLE, p)
    }

    // sql.Char(value, [length]) -- optional length definition

    function Char (p, precision) {
      return new ConcreteColumnType(SQL_CHAR, p, precision)
    }

    // sql.VarChar(value, [length]) -- optional length definition

    function VarChar (p, precision) {
      return new ConcreteColumnType(SQL_VARCHAR, p, precision)
    }

    // sql.Time(value, [scale]) -- optional scale definition

    function Time2 (p, scale, offset) {
      return new ConcreteColumnType(SQL_SS_TIME2, p, undefined, scale, offset)
    }

    function MyDate (p, offset) {
      return new ConcreteColumnType(SQL_TYPE_DATE, p, undefined, undefined, offset)
    }

    function DateTime (p, offset) {
      return new ConcreteColumnType(SQL_TYPE_TIMESTAMP, p, undefined, undefined, offset)
    }

    // fraction is not yet used by driver, this is a placeholder for potential use given
    // a JS date only holds MS resolution.  Also presents an issue of how to pass this
    // additional information back to the client.

    // sql.DateTime2(value, [scale]) -- optional scale definition

    function DateTime2 (p, scale, fraction, offset) {
      return new ConcreteColumnType(SQL_TYPE_TIMESTAMP, p, undefined, scale, offset, fraction)
    }

    // datetime Date round to 10 ms as fraction is not guaranteed

    function DateRound (d, scale) {
      if (!d) {
        d = new Date()
      }
      if (!scale) {
        scale = 10
      }
      const rms = Math.ceil(d.getUTCMilliseconds() / scale) * scale
      return new Date(Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        d.getUTCHours(),
        d.getUTCMinutes(),
        d.getUTCSeconds(),
        rms
      ))
    }

    function TzOffsetQuery (s, offsetMinutes) {
      const offset = offsetMinutes || -new Date().getTimezoneOffset()
      return {
        query_str: s,
        query_timeout: 0,
        query_polling: false,
        query_tz_adjustment: offset
      }
    }

    function PollingQuery (s) {
      return {
        query_str: s,
        query_timeout: 0,
        query_polling: true,
        query_tz_adjustment: 0
      }
    }

    function TimeoutQuery (s, tSecs) {
      return {
        query_str: s,
        query_timeout: tSecs,
        query_polling: false,
        query_tz_adjustment: 0
      }
    }

    function fromRow (rows, c) {
      let v
      if (rows.length === 1) {
        v = rows[0][c]
      } else {
        v = []
        for (let r = 0; r < rows.length; ++r) {
          v[v.length] = rows[r][c]
        }
      }
      return v
    }

    function Table (typeName, cols) {
      const rows = []
      const columns = []
      let schema = 'dbo'
      let unqualifiedTableName = typeName
      const schemaIndex = typeName.indexOf('.')
      if (schemaIndex > 0) {
        schema = typeName.substring(0, schemaIndex)
        unqualifiedTableName = typeName.substring(schemaIndex + 1)
      }

      if (cols && Array.isArray(cols)) {
        cols.forEach(c => {
          columns.push(c)
          if (Object.prototype.hasOwnProperty.call(c, 'schema_name')) {
            schema = c.schema_name
          }
        })
      }

      function addRowsFromObjects (vec) {
        vec.forEach(v => {
          addRowFromObject(v)
        })
      }

      function addRowFromObject (o) {
        const row = []
        columns.forEach(col => {
          row.push(o[col.name])
        })
        rows.push(row)
      }

      return {
        schema,
        name: unqualifiedTableName,
        rows,
        columns,
        addRowsFromObjects
      }
    }

    function TvpFromTable (p) {
      const tp = {
        sql_type: SQL_SS_TABLE,
        table_name: p.name,
        type_id: p.name,
        is_user_defined: true,
        is_output: false,
        value: p,
        table_value_param: [],
        row_count: 1,
        schema: p.schema || 'dbo'
      }
      if (Object.prototype.hasOwnProperty.call(p, 'columns') &&
        Object.prototype.hasOwnProperty.call(p, 'rows')) {
        const cols = p.columns
        const rows = p.rows
        tp.row_count = rows.length
        for (let c = 0; c < cols.length; ++c) {
          const v = rows.length > 0 ? fromRow(rows, c) : []
          const { scale, precision, type: ty } = cols[c]
          tp.table_value_param[c] = getSqlTypeFromDeclaredType({
            scale,
            precision,
            ...ty
          }, v)
        }
      }

      return tp
    }

    function getSqlTypeFromDeclaredType (dt, p) {
      const type = dt.declaration || dt.type || dt.type_id
      switch (type) {
        case 'char':
        case 'nchar':
          return Char(p)

        case 'varchar':
        case 'uniqueidentifier':
          return VarChar(p)

        case 'nvarchar':
          return WVarChar(p)

        case 'text':
          return VarChar(p)

        case 'int':
          return Int(p)

        case 'bigint':
          return BigInt(p)

        case 'tinyint':
          return TinyInt(p)

        case 'smallint':
          return SmallInt(p)

        case 'bit':
          return Bit(p)

        case 'float':
          return Float(p)

        case 'numeric':
          return Numeric(p, dt.precision, dt.scale)

        case 'decimal':
          return Decimal(p, dt.precision, dt.scale)

        case 'real':
          return Real(p)

        case 'date':
          return MyDate(p, dt.offset)

        case 'datetime':
          return DateTime(p, dt.offset)

        case 'datetimeoffset':
          return DateTimeOffset(p, dt.scale, dt.offset)

        case 'datetime2':
          return DateTime2(p, dt.scale, 0, dt.offset)

        case 'smalldatetime':
          return DateTime2(p, dt.scale, 0, dt.offset)

        case 'time':
          return Time2(p, dt.scale, dt.offset)

        case 'money':
          return Money(p)

        case 'smallmoney':
          return Money(p)

        case 'binary':
          return Binary(p)

        case 'varbinary':
        case 'image':
        case 'hierarchyid':
          return VarBinary(p)

        default:
          return Unknown(p)
      }
    }

    return {
      TzOffsetQuery,
      TimeoutQuery,
      PollingQuery,
      Bit,
      BigInt,
      Int,
      TinyInt,
      Numeric,
      Money,
      SmallMoney: Money,
      Binary,
      VarBinary,
      Unknown,
      UniqueIdentifier: WVarChar,
      LongVarBinary,
      Image: LongVarBinary,
      WVarChar,
      Double,
      Decimal,
      SmallInt,
      Float,
      Real,
      Char,
      VarChar,
      WLongVarChar,
      NChar: Char,
      NVarChar: WVarChar,
      Text: VarChar,
      NText: WVarChar,
      Xml: WVarChar,
      Time2,
      Time: Time2,
      MyDate,
      DateTime,
      DateTime2,
      DateRound,
      SmallDateTime: DateTime2,
      DateTimeOffset,
      TvpFromTable,
      Table,
      getSqlTypeFromDeclaredType
    }
  }

  return {
    SqlTypes
  }
})())

exports.userModule = userModule
