const Sequelize = require('sequelize')
const { TestEnv } = require('../../test/env/test-env')
const env = new TestEnv()
const connectionString = env.connectionString

const sequelize = new Sequelize({
  dialect: 'mssql',
  dialectModulePath: 'msnodesqlv8/lib/sequelize',
  dialectOptions: {
    user: '',
    password: '',
    database: 'node',
    options: {
      driver: '',
      connectionString,
      trustedConnection: true,
      instanceName: ''
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

async function userModel () {
  const user = createUserModel()
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
  ])

  const id1 = await user.findByPk(3)
  console.log(JSON.stringify(id1, null, 4))

  const agile = await user.findOne({
    where: { job: 'Agile Leader' }
  })
  console.log(JSON.stringify(agile, null, 4))

  const all = await user.findAll()
  console.log(JSON.stringify(all, null, 4))

  const programmers = await user
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

  const updated = await user.update(
    { job: 'Scrum Master' },
    { where: { id: 3 } })
  console.log(updated)
}

userModel().then(() => {
  sequelize.close()
  console.log('done')
})
