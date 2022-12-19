const { ServerDialect } = require('./dialect')

class PrcedureParamMeta {
  constructor (raw) {
    this.proc_name = raw.proc_name
    this.type_desc = raw.type_desc
    this.object_id = raw.object_id
    this.has_default_value = raw.has_default_value
    this.default_value = raw.default_value
    this.is_output = raw.is_output
    this.name = raw.name
    this.type_id = raw.type_id
    this.max_length = raw.max_length
    this.order = raw.order
    this.collation = raw.collation
    this.is_user_defined = raw.is_user_defined
  }
}
/*
{
proc_name: "test_sp",
type_desc: "SQL_STORED_PROCEDURE",
object_id: 1446165539,
has_default_value: false,
default_value: null,
is_output: false,
name: "@param",
type_id: "varchar",
max_length: 50,
order: 1,
collation: "SQL_Latin1_General_CP1_CI_AS",
is_user_defined: null,
}
*/

class ProcedureParamFactory {
  makeParam (procName, paramName, paramType, paramLength, isOutput) {
    return {
      proc_name: procName,
      type_desc: 'SQL_STORED_PROCEDURE',
      object_id: -1,
      has_default_value: false,
      default_value: null,
      is_output: isOutput,
      name: paramName,
      type_id: paramType,
      max_length: paramLength,
      order: 1,
      collation: '',
      is_user_defined: null
    }
  }

  returnParam () {
    return {
      is_output: true,
      name: '@returns',
      type_id: 'int',
      max_length: 4,
      order: 0,
      is_user_defined: false,
      has_default_value: false,
      default_value: null,
      collation: null
    }
  }
}

class ProcedureMeta {
  constructor (name, paramVector) {
    this.name = name
    this.dialect = ServerDialect.SqlServer
    this.paramVector = paramVector.map(p => new PrcedureParamMeta(p))
    const summary = this.constructMeta(name, this.paramVector)
    this.select = summary.select
    this.signature = summary.signature
    this.summary = summary
    this.params = summary.params
    this.outputParams = summary.outputParams
    this.inputParams = summary.inputParams
    this.paramByName = summary.paramByName
  }

  reconstruct () {
    this.constructMeta(this.name, this.paramVector)
  }

  constructMeta (name, paramVector) {
    paramVector = paramVector.filter(p => p.object_id !== null)
    const outputParams = paramVector.filter(p => p.is_output)
    const inputParams = paramVector.filter(p => !p.is_output)

    const signature = this.buildSignature(paramVector, name)
    const select = this.asSelect(paramVector, name)
    const summary = this.summarise(name, paramVector)
    const paramByName = paramVector.reduce((agg, latest) => {
      if (latest.name) {
        agg[latest.name.slice(1)] = latest
      }
      return agg
    }, {})

    return {
      select,
      signature,
      summary,
      params: paramVector,
      outputParams,
      inputParams,
      paramByName
    }
  }

  isSybase () {
    return this.dialect === ServerDialect.Sybase
  }

  isSqlServer () {
    return this.dialect === ServerDialect.SqlServer
  }

  buildSignature (pv, name) {
    const pars = pv.reduce((aggr, latest, i) => {
      if (i > 0) {
        aggr.push(`${latest.name} = ?`)
      }
      return aggr
    }, []).join(', ')
    return `{ ? = call ${name}(${pars}) }`
  }

  asSelect (pv, procedure) {
    if (this.isSqlServer()) {
      return this.asSelectSqlServer(pv, procedure)
    } else {
      return this.asSelectSybase(pv, procedure)
    }
  }

  asSelectSqlServer (pv, procName) {
    const params = []
    const parameters = []
    pv.forEach(param => {
      if (param.name !== '@returns') {
        parameters.push(param)
      }
    })

    parameters.forEach(param => {
      if (param.is_output) {
        const s = `${param.name} ${param.type_id}`
        params.push(s)
      }
    })

    const cmdParam = ['@___return___ int'].concat(params).join(', ')
    let cmd = `declare ${cmdParam};`
    cmd += `exec @___return___ = ${procName} `

    const spp = parameters.map(param => {
      return (param.is_output)
        ? `${param.name}=${param.name} output`
        : param.name + '=?'
    })

    const params2 = this.asOutput(parameters)

    const sppJoined = spp.join(', ')
    cmd += sppJoined + ';'
    const selectCmd = `select ${['@___return___ as \'___return___\''].concat(params2).join(', ')}`
    cmd += selectCmd + ';'

    return cmd
  }

  asSelectSybase (pv, procName) {
    const params = []
    const parameters = []
    pv.forEach(param => {
      if (param.name !== '@returns') {
        parameters.push(param)
      }
    })

    parameters.forEach(param => {
      if (param.is_output) {
        const size = param.type_id === 'varchar' ? `(${param.max_length})` : ''
        const s = `${param.name} ${param.type_id}${size}`
        params.push(s)
      }
    })

    let cmdParam = ['@___return___ int'].concat(params).join(', ')
    let cmd = `declare ${cmdParam} `
    cmd += `exec @___return___ = ${procName} `

    const spp = []
    parameters.forEach(param => {
      if (param.is_output) {
        // output parameter
        cmdParam = `${param.name} output`
        spp.push(cmdParam)
      } else {
        // input parameter
        cmdParam = param.name + '=?'
        spp.push(cmdParam)
      }
    })

    const params2 = this.asOutput(parameters)

    const sppJoined = spp.join(', ')
    cmd += sppJoined + ' '
    const selectCmd = `select ${['@___return___ as \'___return___\''].concat(params2).join(', ')}`
    cmd += selectCmd + ' '

    return cmd
  }

  asOutput (parameters) {
    const params2 = []
    parameters.forEach(param => {
      if (param.is_output) {
        let paramName = param.name
        if (paramName[0] === '@') {
          paramName = paramName.substring(1)
        }
        const cmdParam = `${param.name} as ${paramName}`
        params2.push(cmdParam)
      }
    })
    return params2
  }

  summarise (name, pv) {
    if (!pv || pv.length === 0) return 'proc does not exist.'
    let s = `${this.descp(pv[0])} ${name}( `
    for (let i = 1; i < pv.length; i += 1) {
      s += this.descp(pv[i])
      if (i < pv.length - 1) {
        s += ', '
      }
    }
    s += ' ) '
    return s
  }

  descp (p) {
    let s = ''
    s += `${p.name} [ ${p.type_id}${p.is_output
      ? ' out '
      : ' in '} ] `
    return s
  }
}

exports.ProcedureMeta = ProcedureMeta
exports.ProcedureParamFactory = ProcedureParamFactory
