const Sequelize = require('sequelize')

let sequelize = new Sequelize({
  dialect: 'mssql',
  dialectModulePath: 'msnodesqlv8/lib/sequelize',
  dialectOptions: {
    'user': '',
    'password': '',
    'database': 'scratch',
    'connectionString': 'Driver={SQL Server Native Client 11.0};Server= np:\\\\.\\pipe\\LOCALDB#2DD5ECA9\\tsql\\query;Database=scratch;Trusted_Connection=yes;',
    'options': {
      'driver': 'SQL Server Native Client 11.0',
      'trustedConnection': true,
      'instanceName': ''
    }
  },
  pool: {
    min: 0,
    max: 5,
    idle: 10000
  }
})

function createUserModel () {
  return sequelize.define('user', {
    username: {
      type: Sequelize.STRING
    },
    job: {
      type: Sequelize.STRING
    }
  })
}

function userModel () {
  return new Promise(async (resolve, reject) => {
    let user = createUserModel()
    // force: true will drop the table if it already exists
    await user.sync({ force: true })
    await Promise.all([
      user.create({
        username: 'techno01',
        job: 'Programmer'
      }),
      user.create({
        username: 'techno02',
        job: 'Head Programmer'
      }),
      user.create({
        username: 'techno03',
        job: 'Agile Leader'
      })
    ]).catch((e) => reject(e))

    let id1 = await user.findByPk(3)
    console.log(JSON.stringify(id1, null, 4))

    let agile = await user.findOne({
      where: { job: 'Agile Leader' }
    })
    console.log(JSON.stringify(agile, null, 4))

    let all = await user.findAll()
    console.log(JSON.stringify(all, null, 4))

    let programmers = await user
      .findAndCountAll({
        where: {
          job: {
            [Sequelize.Op.like]: '%Programmer'
          }
        },
        limit: 2
      })
    console.log(programmers.count)
    const dataValues = programmers.rows.reduce((aggregate, latest) => {
      aggregate.push(latest.dataValues)
      return aggregate
    }, [])
    console.log(dataValues)

    resolve()
  })
}

userModel().then(() => {
  sequelize.close()
  console.log('done')
})
