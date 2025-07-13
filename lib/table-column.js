'use strict'

const { userModule } = require('./user')
const utilModule = require('./util').utilModule
const userTypes = new userModule.SqlTypes()
const splitter = new utilModule.SchemaSplitter()

/*
    use a concrete type to represent a table column
    when binding to a table based on row fetched from
    the metadata query.
 */
/*
       ordinal_position: 2,
       table_catalog: "",
       table_schema: "dbo",
       table_name: "test_default_val_table_bulk",
       column_default: "('def1')",
       name: "s1",
       type: "varchar",
       max_length: 255,
       precision: 0,
       scale: 0,
       is_nullable: false,
       is_computed: false,
       is_identity: false,
       object_id: 2137696055,
       generated_always_type: 0,
       generated_always_type_desc: "NOT_APPLICABLE",
       is_hidden: 0,
       is_primary_key: 0,
       is_foreign_key: 0,
     */
class UserTypeColumn {
  constructor (name, type, declaration, scale, precision, offset, maxLength) {
    let length = 0
    if (maxLength > 0) {
      if (type === 'nvarchar') {
        length = maxLength / 2
      } else if (type === 'varbinary') {
        length = maxLength
      } else {
        length = maxLength
      }
    }
    this.name = name
    this.userType = declaration
    this.scale = scale
    this.precision = precision
    this.type = {
      offset,
      declaration: type,
      length
    }
  }
}

class TableColumn {
  constructor (tableName, tableSchema, ordinalPosition, columnName, type, maxLength, isPrimaryKey) {
    if (!columnName) return
    columnName = splitter.stripEscape(columnName)
    this.table_name = tableName
    this.table_schema = tableSchema
    this.name = columnName
    this.type = type
    this.max_length = maxLength
    this.is_primary_key = isPrimaryKey
    this.ordinal_position = ordinalPosition

    this.table_catalog = ''
    this.column_default = ''
    this.precision = 0
    this.scale = 0
    this.is_nullable = false
    this.is_computed = false
    this.is_identity = false
    this.object_id = 0
    this.generated_always_type = 0
    this.generated_always_type_desc = 'NOT_APPLICABLE'
    this.is_hidden = 0
    this.is_foreign_key = 0
    this.decorator = ''
    this.sql_type = this.getDelcaredType()
  }

  getDelcaredType () {
    return userTypes.getSqlTypeFromDeclaredType(this).sql_type
  }

  static asTableColumn (rawCol) {
    const tp = new TableColumn()
    tp.fromRaw(rawCol)
    return tp
  }

  isReadOnly () {
    return (this.is_identity ||
      this.is_computed ||
      this.is_hidden ||
      this.generated_always_type ||
      this.type === 'timestamp')
  }

  isTzAdjusted () {
    return this.type === 'datetimeoffset' ||
      this.type === 'datetime' ||
      this.type === 'datetime2' ||
      this.type === 'time' ||
      this.type === 'date' ||
      this.type === 'smalldatetime'
  }

  asUserType (useUTC) {
    const declaration = `${this.typed(true)}`
    let offset = 0
    const isDateTime = this.isTzAdjusted()
    if (useUTC === false && isDateTime) {
      offset = new Date().getTimezoneOffset()
    }
    return new UserTypeColumn(this.name, this.type, declaration, this.scale, this.precision, offset, this.max_length)
  }

  procTyped () {
    return this.typed(false, false)
  }

  isOne () {
    return this.type === 'float' ||
      this.type === 'binary' ||
      this.type === 'varbinary' ||
      this.type === 'varchar' ||
      this.type === 'nvarchar' ||
      this.type === 'nchar' ||
      this.type === 'char'
  }

  isTwo () {
    return this.type === 'numeric' ||
      this.type === 'decimal' ||
      this.type === 'time'
  }

  maxLength () {
    let maxLength = this.max_length || 0
    if (this.type === 'nvarchar' || this.type === 'nchar') {
      if (maxLength === -1) {
        maxLength = 'MAX'
      } else {
        maxLength = maxLength / 2
      }
    } else if (this.type === 'varchar' || this.type === 'char') {
      if (maxLength === -1) {
        maxLength = 'MAX'
      }
    }
    return maxLength
  }

  typed (user, withDecorator) {
    const decorator = withDecorator ? this.decorator : ''
    const oneParam = this.isOne()
    const twoParam = this.isTwo()

    const timeParam =
      this.type === 'time'

    const maxLength = this.maxLength()

    if (this.is_computed) {
      return user ? `${this.type}` : `${decorator}`
    } else if (timeParam) {
      return `${this.type} (${this.scale}) ${decorator}`
    } else if (oneParam) {
      return `${this.type} (${maxLength}) ${decorator}`
    } else if (twoParam) {
      return `${this.type} (${this.precision},${this.scale}) ${decorator}`
    } else {
      return `${this.type} ${decorator}`
    }
  }

  fromRaw (c) {
    this.table_name = c.table_name
    this.table_schema = c.table_schema
    this.name = c.name
    this.type = c.type
    this.sql_type = this.getDelcaredType()
    this.max_length = c.max_length
    this.is_primary_key = c.is_primary_key

    this.ordinal_position = c.ordinal_position
    this.table_catalog = c.table_catalog
    this.column_default = c.column_default
    this.precision = c.precision
    this.scale = c.scale
    this.is_nullable = c.is_nullable
    this.is_computed = c.is_computed
    this.is_identity = c.is_identity
    this.object_id = c.object_id
    this.generated_always_type = c.generated_always_type
    this.generated_always_type_desc = c.generated_always_type_desc
    this.is_hidden = c.is_hidden
    this.is_foreign_key = c.is_foreign_key
    this.decorator = ''
  }

  asExpression (expression) {
    this.is_computed = true
    this.decorator = expression
    return this
  }

  isComputed (v) {
    this.is_computed = v
    return this
  }

  isIdentity (v, start, inc) {
    start = start || 1
    this.is_identity = v
    if (v) {
      inc = inc || 1
      this.decorator = `IDENTITY(${start},${inc})`
    }
    return this
  }

  isHidden (v) {
    this.is_hidden = v
    return this
  }

  isPrimaryKey (v) {
    this.is_primary_key = v
    return this
  }

  isForeignKey (v) {
    this.is_foreign_key = v
    return this
  }

  notNull () {
    this.withDecorator('NOT NULL')
    return this
  }

  null () {
    this.withDecorator('NULL')
    return this
  }

  withDecorator (v) {
    if (this.decorator !== null && this.decorator.length > 0) {
      this.decorator += ' ' + v
    } else {
      this.decorator = v
    }
    return this
  }

  asBit () {
    this.type = 'bit'
    this.sql_type = this.getDelcaredType()
    this.max_length = 1
    this.precision = 1
    this.scale = 0
    return this
  }

  asInt () {
    this.type = 'int'
    this.sql_type = this.getDelcaredType()
    this.length = 4
    this.precision = 10
    this.scale = 0
    return this
  }

  asNVarCharMax () {
    return this.asNVarChar(-1)
  }

  asNVarChar (length) {
    length = length || 56
    this.type = 'nvarchar'
    this.sql_type = this.getDelcaredType()
    this.max_length = length > 0 ? length * 2 : length
    this.precision = length > 0 ? length : 0
    this.scale = 0
    return this
  }

  asBinary (length) {
    this.type = 'binary'
    this.sql_type = this.getDelcaredType()
    this.max_length = length
    this.precision = length
    this.scale = 0
    return this
  }

  asVarBinary (length) {
    this.type = 'varbinary'
    this.sql_type = this.getDelcaredType()
    this.max_length = length
    this.precision = length
    this.scale = 0
    return this
  }

  asVarChar (length) {
    length = length || 28
    this.type = 'varchar'
    this.sql_type = this.getDelcaredType()
    this.max_length = length
    this.precision = length
    this.scale = 0
    return this
  }

  asVarCharMax () {
    return this.asVarChar(-1)
  }

  asDate () {
    this.type = 'date'
    this.sql_type = this.getDelcaredType()
    this.max_length = 3
    this.precision = 10
    this.scale = 0
    return this
  }

  asTime (scale) {
    this.type = 'time'
    this.sql_type = this.getDelcaredType()
    this.max_length = 5
    this.precision = 16
    this.scale = scale || 7
    return this
  }

  asDateTime2 () {
    this.type = 'datetime2'
    this.sql_type = this.getDelcaredType()
    this.max_length = 8
    this.precision = 23
    this.scale = 3
    return this
  }

  asDateTime () {
    this.type = 'datetime'
    this.sql_type = this.getDelcaredType()
    this.max_length = 8
    this.precision = 23
    this.scale = 3
    return this
  }

  asDateTimeOffset () {
    this.type = 'datetimeoffset'
    this.sql_type = this.getDelcaredType()
    this.max_length = 10
    this.precision = 34
    this.scale = 7
    return this
  }

  asMoney () {
    this.type = 'money'
    this.sql_type = this.getDelcaredType()
    this.max_length = 9
    this.precision = 10
    this.scale = 4
    return this
  }

  asSmallMoney () {
    return this.asNumeric(10, 4)
  }

  asNumeric (precision, scale) {
    this.type = 'numeric'
    this.sql_type = this.getDelcaredType()
    this.max_length = 9
    this.precision = precision || 20
    this.scale = scale || 15
    return this
  }

  /*
If 1<=n<=24, n is treated as 24. If 25<=n<=53, n is treated as 53.
*/
  asFloat (scale) {
    scale = scale || 25
    this.type = 'float'
    this.sql_type = this.getDelcaredType()
    this.max_length = scale > 24 ? 8 : 4
    this.precision = this.max_length === 4 ? 7 : 15
    this.scale = scale
    return this
  }

  asDecimal (precision, scale) {
    this.type = 'decimal'
    this.sql_type = this.getDelcaredType()
    this.max_length = 9
    this.precision = precision || 23
    this.scale = scale || 18
    return this
  }

  asUniqueIdentifier () {
    this.type = 'uniqueidentifier'
    this.sql_type = this.getDelcaredType()
    this.max_length = 16
    this.precision = 36
    this.scale = 0
    return this
  }

  asHierarchyId () {
    this.type = 'hierarchyid'
    this.sql_type = this.getDelcaredType()
    this.max_length = 892
    this.precision = 0
    this.scale = 0
    return this
  }

  asBigInt () {
    this.type = 'bigint'
    this.sql_type = this.getDelcaredType()
    this.max_length = 8
    this.precision = 19
    this.scale = 0
    return this
  }

  asSmallInt () {
    this.type = 'smallint'
    this.sql_type = this.getDelcaredType()
    this.max_length = 2
    this.precision = 5
    this.scale = 0
    return this
  }

  asTinyInt () {
    this.type = 'tinyint'
    this.sql_type = this.getDelcaredType()
    this.max_length = 1
    this.precision = 3
    this.scale = 0
    return this
  }

  asReal () {
    this.type = 'real'
    this.sql_type = this.getDelcaredType()
    this.max_length = 4
    this.precision = 24
    this.scale = 0
    return this
  }

  asChar (length) {
    length = length || 128
    this.type = 'char'
    this.sql_type = this.getDelcaredType()
    this.max_length = length
    this.precision = 0
    this.scale = 0
    return this
  }

  asNChar (length) {
    length = length || 256
    this.type = 'nchar'
    this.sql_type = this.getDelcaredType()
    this.max_length = length > 0 ? length * 2 : length
    this.precision = 0
    this.scale = 0
    return this
  }
}

exports.TableColumn = TableColumn
