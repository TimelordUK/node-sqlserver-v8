class Employee {
  constructor (tableName, helper, connection) {
    this.theConnection = connection
    this.tableName = tableName
    this.helper = helper
  }

  dropCreate (name) {
    return new Promise((resolve, reject) => {
      this.helper.dropCreateTable({
        tableName: name
      }, (e) => {
        if (e) {
          reject(e)
        } else {
          resolve(null)
        }
      })
    })
  }

  async create () {
    const dropTableSql = `IF OBJECT_ID('${this.tableName}', 'U') IS NOT NULL DROP TABLE ${this.tableName};`
    await this.theConnection.promises.query(dropTableSql)
    await this.dropCreate(this.tableName)
    const table = await this.theConnection.promises.getTable(this.tableName)
    return table
  }

  createEmployees (count) {
    const parsedJSON = this.helper.getJSON()
    const res = []
    for (let i = 0; i < count; ++i) {
      const x = this.helper.cloneEmployee(parsedJSON[i % parsedJSON.length])
      x.BusinessEntityID = i
      res.push(x)
    }
    return res
  }

  async insertSelect (table) {
    const parsedJSON = this.createEmployees(200)
    table.setUseBcp(true)
    const d = new Date()
    await table.promises.insert(parsedJSON)
    console.log(`ms = ${new Date() - d}`)
    const keys = this.helper.extractKey(parsedJSON, 'BusinessEntityID')
    const results = await table.promises.select(keys)
    return results
  }
}

module.exports = {
  Employee: Employee
}
