class SchemaSplitter {
  stripEscape (columnName) {
    const columnParts = columnName.split(/\.(?![^[]*])/g)
    const qualified = columnParts[columnParts.length - 1]
    const columnNameRegexp = /\[?(.*?)]?$/g
    const match = columnNameRegexp.exec(qualified)
    const trim = match.filter(r => r !== '')
    return trim[trim.length - 1]
  }

  strip (name) {
    return name.replace(/^\[|]$/g, '').replace(/]]/g, ']')
  }

  substitute (sql, decomp) {
    // removes brackets at start end, change ']]' to ']'
    sql = sql.replace(/<table_name>/g, this.strip(decomp.table))
      // removes brackets at start end, change ']]' to ']'
      .replace(/<table_schema>/g, this.strip(decomp.schema))
      // use the escaped table name for the OBJECT_ID() function
      .replace(/<escaped_table_name>/g, decomp.fullTableName)
      // use the escaped table name for the OBJECT_ID() function
      .replace(/<table_catalog>/g, decomp.cat)
    return sql
  }

  decomposeSchema (qualifiedName, cat) {
    cat = cat || ''
    // Split table names like 'dbo.table1' to: ['dbo', 'table1'] and 'table1' to: ['table1']
    const tableParts = qualifiedName.split(/\.(?![^[]*])/g)
    const table = tableParts[tableParts.length - 1] // get the table name
    let fullTableName = table
    // get the table schema, if missing set schema to ''
    const schema = tableParts.length >= 2 ? tableParts[tableParts.length - 2] || '' : ''
    if (tableParts.length > 2) {
      cat = tableParts[tableParts.length - 3]
    } else if (table[0] === '#') {
      cat = '[tempdb]'
      fullTableName = `${cat}.${schema}.${table}`
    }
    return {
      qualifiedName,
      fullTableName,
      cat,
      schema,
      table
    }
  }
}
exports.SchemaSplitter = SchemaSplitter
