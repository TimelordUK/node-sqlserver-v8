import { SqlClient, Error } from "msnodesqlv8"
const sql: SqlClient = require("msnodesqlv8")

const connectionString = 'Driver={SQL Server Native Client 11.0};Server=(localdb)\\node;Database=AdventureWorks2019;Trusted_Connection=yes;'
const sqlQuery = `BACKUP DATABASE [AdventureWorks2019] TO  DISK = N'H:\\sql server\\backups\\AdventureWorks2019.bak' WITH  COPY_ONLY, 
NOFORMAT, INIT,  NAME = N'SampleDb-Full Database Backup', SKIP, NOREWIND, NOUNLOAD,  STATS = 10`;

const query = sql.query(connectionString, sqlQuery, (err, rows, more) => {
    if (more) return
    console.error(`cb more ${more}`)
    console.error(`cb err`)
    console.log(`cb rows`)
})

query.on('info', (info:Error) => {
    console.log(`info: ${JSON.stringify(info)}`)
})

query.on('error', (e:Error) => {
    console.log(`error: ${JSON.stringify(e)}`)
})

query.on('done', () => {
    console.log('done')
})
