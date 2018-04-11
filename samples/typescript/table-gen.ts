let argv = require('minimist')(process.argv.slice(2));
const sql: SqlClient = require('msnodesqlv8');
let supp = require('./demo-support');
import {MsNodeSqlWrapperModule} from "../../lib/MsNodeSqWrapperModule";
import SqlWrapper = MsNodeSqlWrapperModule.Sql;
import CommandResponse = MsNodeSqlWrapperModule.SqlCommandResponse;
let ASQ = require('asynquence-contrib');

import {
    SqlClient
} from 'msnodesqlv8';

enum ColumnType {
    bit = 0,
    date = 1,
    string = 2,
    binary = 3,
    decimal =4,
    int = 5
}

class TableGenerator {

    public dropSql: string = '';
    public defSql: string = '';
    conn_str: string = "";
    sqlWrapper:SqlWrapper;

    private init() : Promise<any>
    {
        return new Promise((resolve, reject) => {
            if (this.sqlWrapper != null) resolve(this.sqlWrapper);
            supp.GlobalConn.init(sql, (co: any) => {
                if (co == null) reject('no db.');
                this.conn_str = co.conn_str;
                this.sqlWrapper = new MsNodeSqlWrapperModule.Sql(this.conn_str);
                resolve(this.sqlWrapper);
            });
        })
    }

    public create() : Promise<any>
    {
        return new Promise((resolve, reject) => {
            let inst = this;
            ASQ().runner(function*() {
                let wrapper = yield inst.init();
                console.log('open question');
                let connection = yield wrapper.open();
                console.log(`drop table ${inst.dropSql}`);
                let dropCommand = connection.getCommand().sql(inst.dropSql);
                yield dropCommand.execute();
                console.log('create table');
                let createCommand = connection.getCommand().sql(inst.defSql);
                yield createCommand.execute();
                console.log('close connection');
                yield connection.close();
                resolve();
            }).or((e: any) => {
                reject(e);
            });
        })
    }

    static colOfType(type: string, notNull: boolean) {
        notNull = notNull || true;
        let postFix = notNull ? ' NOT NULL' : '';
        return `${type}${postFix}`;
    }

    static nvarchar(width: number, notNull: boolean) {
        return TableGenerator.colOfType(`nvarchar(${width})`,notNull);
    }

    static varbinary(width: number, notNull: boolean) {
        return TableGenerator.colOfType(`varbinary(${width})`,notNull);
    }

    static nchar(width: number, notNull: boolean) {
        return TableGenerator.colOfType(`nchar(${width})`,notNull);
    }

    static decimal(width: number, precision:number, notNull: boolean) {
        return TableGenerator.colOfType(`decimal(${width}, ${precision})`,notNull);
    }

    static date(notNull: boolean) {
        return TableGenerator.colOfType('date',notNull);
    }

    static int(notNull: boolean) {
        return TableGenerator.colOfType('int',notNull);
    }

    static bit(notNull: boolean) {
        return TableGenerator.colOfType('bit',notNull);
    }

    static smallint(notNull: boolean) {
        return TableGenerator.colOfType('smallint',notNull);
    }

    static fromColumnType(index:number, colType: ColumnType ): string {
        let c:string = null;
        switch (colType) {
            case ColumnType.string:
                c = `col_str_${index} ${TableGenerator.nvarchar(20, true)}`;
                break;

            case ColumnType.decimal:
                c = `col_dec_${index} ${TableGenerator.decimal(34, 18, true)}`;
                break;

            case ColumnType.date:
                c = `col_dat_${index} ${TableGenerator.date(true)}`;
                break;

            case ColumnType.bit:
                c = `col_bit_${index} ${TableGenerator.bit(true)}`;
                break;

            case ColumnType.binary:
                c = `col_bin_${index} ${TableGenerator.varbinary(100,true)}`;
                break;

            case ColumnType.int:
                c = `col_int_${index} ${TableGenerator.int(true)}`;
                break;
        }
        return c;
    }

    public static getRandomInt(min:number, max:number) :number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    static roundRobinCol(index:number ): string {
        return TableGenerator.fromColumnType(index, index % 6)
    }

    static randomCol(index:number ): string {
        let n = TableGenerator.getRandomInt(0, 5);
        return TableGenerator.fromColumnType(index, n)
    }

    public generate(argv: any): void {
        let columns: number = argv.columns || 10;
        let schema: string = argv.schema || 'dbo';
        let table: string = argv.table || 'test_table';
        let random: boolean = argv.random || false;
        let qualifiedName = `${schema}.${table}`;

        this.dropSql = `
IF OBJECT_ID('${qualifiedName}', 'U') IS NOT NULL
    DROP TABLE ${qualifiedName}
`;
        let cols:string[] = [];
        for (let i = 0; i < columns; ++i) {
            cols[cols.length] = random ? TableGenerator.randomCol(i) : TableGenerator.roundRobinCol(i);
        }

        let body = cols.join(',\n\t');
        this.defSql = `
CREATE TABLE ${qualifiedName} (
    ${body},
    ID int NOT NULL,
    PRIMARY KEY (ID)
);`;
    }
}

let g = new TableGenerator();
g.generate(argv);
let s = g.defSql;
console.log(s);
let create: boolean = argv.create || false;
if (create) {
    g.create().then(() => {
        console.log('done');
    }).catch( (e : CommandResponse) => {
        console.log(e.error);
    })
}
