class Employee {
  constructor (tableName, helper, connection) {
    this.theConnection = connection
    this.tableName = tableName
    this.helper = helper
  }

  empSelectSQL () {
    return 'SELECT [BusinessEntityID] ' +
       ',[NationalIDNumber] ' +
       ',[LoginID] ' +
       ',[OrganizationNode] ' +
       ',[OrganizationLevel] ' +
       ',[JobTitle] ' +
       ',[BirthDate] ' +
       ',[MaritalStatus] ' +
       ',[Gender] ' +
       ',[HireDate] ' +
       ',[SalariedFlag] ' +
       ',[VacationHours] ' +
       ',[SickLeaveHours] ' +
       ',[CurrentFlag] ' +
       ',[rowguid] ' +
       ',[ModifiedDate] ' +
       'FROM [dbo].[Employee] ' +
       ' WHERE BusinessEntityID = ? '
  }

  empUpdateSQL () {
    return 'UPDATE [dbo].[Employee] SET [LoginID] = ?' +
      ' WHERE BusinessEntityID = ?'
  }

  empDeleteSQL () {
    return 'DELETE FROM [dbo].[Employee] ' +
          'WHERE BusinessEntityID = ?'
  }

  empNoParamsSQL () {
    return 'SELECT [BusinessEntityID] ' +
       ',[NationalIDNumber] ' +
       ',[LoginID] ' +
       ',[OrganizationNode] ' +
       ',[OrganizationLevel] ' +
       ',[JobTitle] ' +
       ',[BirthDate] ' +
       ',[MaritalStatus] ' +
       ',[Gender] ' +
       ',[HireDate] ' +
       ',[SalariedFlag] ' +
       ',[VacationHours] ' +
       ',[SickLeaveHours] ' +
       ',[CurrentFlag] ' +
       ',[rowguid] ' +
       ',[ModifiedDate] ' +
       'FROM [dbo].[Employee]'
  }

  async prepare () {
    const prepared = {}
    const promises = this.theConnection.promises
    prepared.select = await promises.prepare(this.empSelectSQL())
    prepared.scan = await promises.prepare(this.empNoParamsSQL())
    prepared.delete = await promises.prepare(this.empDeleteSQL())
    prepared.update = await promises.prepare(this.empUpdateSQL())
    return prepared
  }

  async free (prepared) {
    if (!prepared) return
    if (prepared.select) {
      await prepared.select.promises.free()
      prepared.select = null
    }
    if (prepared.scan) {
      await prepared.scan.promises.free()
      prepared.scan = null
    }
    if (prepared.delete) {
      await prepared.delete.promises.free()
      prepared.delete = null
    }
    if (prepared.update) {
      await prepared.update.promises.free()
      prepared.update = null
    }
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

  make (n) {
    n = n || 200
    const parsedJSON = this.createEmployees(n)
    return parsedJSON
  }

  async insertSelect (table, parsedJSON) {
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
  Employee
}
