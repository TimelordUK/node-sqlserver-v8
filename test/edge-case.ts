import {MsNodeSqlDriverApiModule as v8} from '../lib/MsNodeSqlDriverApiModule'

import v8Connection = v8.v8Connection;
import v8PreparedStatement = v8.v8PreparedStatement;
import v8BindCb = v8.v8BindCb;
import v8BulkMgr = v8.v8BulkTableMgr;
import v8Error = v8.v8Error;

export const sql: v8.v8driver = require('msnodesqlv8');

let supp = require('../demo-support');
let argv = require('minimist')(process.argv.slice(2));

let support : any = null;
let procedureHelper : any = null;
let helper : any = null;

export interface SimpleTest
{
    run(conn_str:string, argv:any) : void;
}

class RaiseErrors implements SimpleTest {

    public run(conn_str:string, argv :any): void {
        let delay : number = argv.delay || 5000;

        sql.open(conn_str, (err, conn) => {
            if (err) {
                throw err;
            }
            let x = 1;
            if (err) {
                throw err;
            }

            setInterval( () => {
                let qs = '';
                let repeats = 3;
                for (let i = 0; i < repeats; ++i) {
                    qs += `RAISERROR('[${x}]: Error Number ${i + 1}', 1, 1);`;
                }
                let q = conn.query(qs,
                    (err, results, more) => {
                        if (more && !err && results && results.length === 0) {
                            return;
                        }
                        console.log(`[${x}] more = ${more} err ${err} results ${JSON.stringify(results)}`);
                        if (more) return;
                        console.log(`[${x}] completes more = ${more}`);
                        ++x;
                    });
                q.on('msg', (err: v8Error) => {
                    //console.log(`[${x}]: q.msg = ${err.message}`);
                });
            }, delay);
        });
    }
}

class BusyConnection implements SimpleTest {

    public run(conn_str:string, argv :any): void {
        let delay : number = argv.delay || 5000;
        let severity : number = argv.severity || 9;
        sql.open(conn_str, (err, conn) => {
            if (err) {
                throw err;
            }
            let x = 1;
            setInterval(() => {
                let query = `RAISERROR('User JS Error', ${severity}, 1);SELECT ${x}+${x};`;

                conn.queryRaw(query, (err, results, more) => {
                    console.log(">> queryRaw");
                    console.log(err);
                    console.log(JSON.stringify(results, null, 2));
                    if (more) return;
                    conn.queryRaw(query, (e, r) => {
                        console.log(">> queryRaw2");
                        console.log(e);
                        console.log(JSON.stringify(r, null, 2));
                        ++x;
                        console.log("<< queryRaw2");
                    });
                    console.log("<< queryRaw");
                });
            }, delay);
        });
    }
}

class LargeStringSelect implements SimpleTest {

    public run(conn_str:string, argv :any): void {
        let delay : number = argv.delay || 5000;
        sql.open(conn_str, (err, conn) => {
            if (err) {
                throw err;
            }
            let x = 1;
            if (err) {
                throw err;
            }
            const query = `
SELECT 'Result' AS [Result], 
'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec tincidunt, metus id vulputate convallis, ligula magna ultricies eros, et convallis leo odio vel sem. Cras ut leo quam. Fusce mattis risus eleifend justo facilisis molestie. Aliquam efficitur posuere nibh ut gravida. Phasellus mauris mi, venenatis sed neque in, rutrum aliquet leo. Nam molestie sapien sem, sed commodo ipsum ullamcorper ac. Etiam mattis fringilla lectus non interdum. Vivamus mi lectus, dictum quis ipsum in, varius pellentesque lacus. Sed vitae pharetra nisl. Fusce ullamcorper molestie leo, vel commodo sem fringilla vel. Nulla tempor libero lectus, eu eleifend ex hendrerit eu. Maecenas sodales ultrices massa.Donec gravida magna lectus, non hendrerit tellus commodo eget. Vivamus porttitor justo in orci semper, a commodo ipsum scelerisque. Nulla tortor leo, tincidunt in convallis sit amet, iaculis sed justo. Nunc rhoncus eget justo quis hendrerit. Ut ornare sit amet mauris nec tincidunt. Phasellus mattis ipsum a libero malesuada, at vestibulum mi facilisis. Mauris posuere erat eget mauris ultrices aliquam.Donec ultricies tellus a augue pulvinar, eget varius urna venenatis. Quisque nisl nulla, gravida quis risus sit amet, scelerisque suscipit tellus. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Quisque sem ex, pretium a condimentum a, semper id massa. Aenean vitae viverra tortor. Mauris sed purus lacinia, laoreet nulla nec, pretium felis. Vivamus quis laoreet purus, nec ultricies orci. Nam purus quam, tincidunt faucibus posuere at, scelerisque nec tortor. In eget urna tincidunt, rutrum tortor vitae, porttitor mi. Quisque faucibus est ut metus bibendum eleifend. Fusce rutrum placerat quam, sed porttitor elit luctus ac. Etiam dictum sagittis sem blandit auctor. Aenean et porta ante, ut imperdiet massa. Vivamus a porttitor risus, porta rhoncus enim. Suspendisse euismod ornare convallis.Vestibulum sit amet nibh tincidunt, lacinia diam sit amet, posuere risus. Curabitur quis malesuada erat. Phasellus ultricies pellentesque blandit. Suspendisse ultricies molestie mollis. Cras vitae ullamcorper est. Donec lacinia, neque vitae pharetra tincidunt, eros libero consequat mauris, vitae dictum erat odio at lectus. Nam tempus, turpis mattis sagittis viverra, nisi nulla fermentum ante, ut rhoncus tortor erat sed massa. Nulla bibendum in mauris at viverra. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Vivamus lacinia nibh aliquet facilisis vehicula. Donec ut porttitor quam. Etiam sagittis magna urna, vitae rutrum dui gravida eu. Nullam molestie leo eros, a condimentum velit ultrices vitae. Duis efficitur tortor arcu, ac facilisis velit accumsan vel.Curabitur elementum tortor nec leo bibendum lobortis porta id neque. Suspendisse quis orci ligula. Nulla sodales, dolor at tincidunt accumsan, nulla turpis fringilla urna, at sagittis dolor tellus eu felis. Nullam sodales quam sed lacus egestas, vitae rutrum orci ornare. Ut magna nisl, porttitor sit amet libero venenatis, facilisis vehicula enim. Vivamus erat nulla, auctor a elementum convallis, malesuada sed elit. Praesent justo elit, rhoncus et magna eget, imperdiet accumsan tellus. Nam sit amet tristique orci, eu mattis justo. Ut elementum erat vel risus fringilla, vel rhoncus neque finibus. Curabitur aliquet felis varius pharetra suscipit. Integer id ullamcorper nunc.Sed nec porta metus. Vivamus aliquam cursus tellus. Nunc aliquam hendrerit justo, vitae semper lectus lobortis quis. Morbi commodo felis eget imperdiet feugiat. Sed ante magna, gravida in metus in, consectetur accumsan risus. Pellentesque sit amet tellus quis ipsum lobortis bibendum vitae efficitur leo. Aliquam a ante justo. Integer pharetra, odio id convallis congue, lectus erat molestie arcu, quis cursus nibh arcu in elit. Ut magna nibh, consectetur sit amet augue eu, mattis lacinia lectus. Phasellus sed enim quis metus maximus ultrices. Proin euismod, odio mollis viverra scelerisque, diam orci porta diam, a elementum nulla dui vitae diam. Morbi nec dapibus purus, non placerat ipsum. Vivamus viverra neque eu pellentesque venenatis. Nulla malesuada ex erat, nec consectetur magna rutrum vitae. Aliquam aliquam turpis nec turpis hendrerit venenatis.Ut ligula sem, convallis vitae tempor in, interdum id odio. Interdum et malesuada fames ac ante ipsum primis in faucibus. Maecenas at euismod felis. Duis cursus arcu ac rutrum finibus. Ut congue dapibus nisi quis facilisis. Vestibulum ultricies faucibus enim aliquam vehicula. Praesent ultrices tortor quis arcu finibus, a fermentum quam blandit. Nullam odio mi, facilisis vitae purus vel, posuere efficitur ipsum.Vestibulum mattis, felis scelerisque ornare posuere, nulla eros mattis dolor, vitae facilisis tortor quam non odio. Donec pretium diam in felis semper lacinia. Cras congue laoreet ipsum, id rutrum magna interdum quis. Donec tristique lectus et cursus porttitor. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Nullam imperdiet maximus elit, a placerat dui sagittis rutrum. Morbi odio odio, eleifend quis venenatis non, mattis quis ligula.Pellentesque nec diam ac nisl suscipit facilisis. Integer finibus, orci vel blandit lacinia, magna elit gravida magna, eget lacinia sapien magna ac risus. Fusce convallis purus eu mattis faucibus. Curabitur porttitor tempor lorem quis sagittis. Ut congue ipsum egestas nunc porta, a semper lacus suscipit. Cras pellentesque aliquam dui, ut mattis purus vulputate ut. Nullam vel euismod odio. Vestibulum eros est, blandit non tortor at, pulvinar egestas est. Suspendisse potenti. Fusce sit amet turpis ligula.Suspendisse pharetra est purus, sed hendrerit arcu cursus elementum. Curabitur a nunc rhoncus, laoreet dui et, aliquet velit. Duis ornare egestas rhoncus. Aenean id nisl vitae risus vehicula scelerisque. Cras ac eros a quam interdum facilisis vitae vel risus. Etiam gravida feugiat nulla, eleifend placerat odio. Aliquam id feugiat justo, vel sollicitudin ante. Proin venenatis orci non pulvinar molestie. Ut auctor vel mauris vel varius. Aenean placerat justo sit amet nibh sollicitudin suscipit et dapibus felis. Quisque et ipsum id arcu fermentum pretium in eu quam.Cras sed tincidunt velit, sed tincidunt neque. In tempor nunc at gravida blandit. Nulla facilisi. Nulla egestas ante eget lacus semper egestas. Aliquam ornare felis urna, ut maximus purus rutrum nec. Cras non ultrices felis. Aenean vitae facilisis orci, sed eleifend tellus. Integer laoreet sollicitudin elementum. Donec massa metus, hendrerit et vehicula id, blandit id lacus.Praesent blandit sapien sit amet libero pellentesque feugiat. Curabitur pretium fermentum eleifend. Ut tempor diam in fermentum placerat. Sed commodo eget ipsum quis convallis. Donec vulputate velit non purus scelerisque convallis. Duis urna lacus, semper in porta non, sollicitudin in neque. Sed et facilisis lacus, congue sagittis leo. Duis dictum ac lacus et viverra. Donec tristique dui et faucibus rutrum.Curabitur lacinia ipsum in ligula finibus volutpat. Sed ornare lorem quis faucibus faucibus. Ut gravida quis augue vel vestibulum. Aenean aliquam sapien quis neque faucibus, a condimentum nisl malesuada. Maecenas tellus enim, efficitur ut nunc ac, faucibus ultrices mauris. Praesent ac sem id purus finibus sagittis a sed tortor. Suspendisse aliquet hendrerit magna tincidunt fringilla.Sed at dui eu lectus bibendum sollicitudin. Nullam tincidunt, enim malesuada lobortis gravida, arcu metus accumsan lectus, quis dictum dui purus vel justo. Nulla gravida, mauris a commodo tempor, felis quam hendrerit libero, in feugiat nisl nisi ut purus. Ut eleifend odio faucibus odio condimentum, imperdiet imperdiet ex finibus. Pellentesque quis purus sit amet dui pellentesque dignissim eget posuere dolor. Duis ultrices quam elementum nisl porttitor tristique id in arcu. Pellentesque vulputate ex quis sem mattis, sed suscipit lorem ullamcorper. In in tempus erat. Nulla dictum, dolor nec pretium blandit, ante tellus luctus nisi, ut tincidunt lacus elit sodales posuere. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec tincidunt, metus id vulputate convallis, ligula magna ultricies eros, et convallis leo odio vel sem. Cras ut leo quam. Fusce mattis risus eleifend justo facilisis molestie. Aliquam efficitur posuere nibh ut gravida. Phasellus mauris mi, venenatis sed neque in, rutrum aliquet leo. Nam molestie sapien sem, sed commodo ipsum ullamcorper ac. Etiam mattis fringilla lectus non interdum. Vivamus mi lectus, dictum quis ipsum in, varius pellentesque lacus. Sed vitae pharetra nisl. Fusce ullamcorper molestie leo, vel commodo sem fringilla vel. Nulla tempor libero lectus, eu eleifend ex hendrerit eu. Maecenas sodales ultrices massa.Donec gravida magna lectus, non hendrerit tellus commodo eget. Vivamus porttitor justo in orci semper, a commodo ipsum scelerisque. Nulla tortor leo, tincidunt in convallis sit amet, iaculis sed justo. Nunc rhoncus eget justo quis hendrerit. Ut ornare sit amet mauris nec tincidunt. Phasellus mattis ipsum a libero malesuada, at vestibulum mi facilisis. Mauris posuere erat eget mauris ultrices aliquam.Donec ultricies tellus a augue pulvinar, eget varius urna venenatis. Quisque nisl nulla, gravida quis risus sit amet, scelerisque suscipit tellus. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Quisque sem ex, pretium a condimentum a, semper id massa. Aenean vitae viverra tortor. Mauris sed purus lacinia, laoreet nulla nec, pretium felis. Vivamus quis laoreet purus, nec ultricies orci. Nam purus quam, tincidunt faucibus posuere at, scelerisque nec tortor. In eget urna tincidunt, rutrum tortor vitae, porttitor mi. Quisque faucibus est ut metus bibendum eleifend. Fusce rutrum placerat quam, sed porttitor elit luctus ac. Etiam dictum sagittis sem blandit auctor. Aenean et porta ante, ut imperdiet massa. Vivamus a porttitor risus, porta rhoncus enim. Suspendisse euismod ornare convallis.Vestibulum sit amet nibh tincidunt, lacinia diam sit amet, posuere risus. Curabitur quis malesuada erat. Phasellus ultricies pellentesque blandit. Suspendisse ultricies molestie mollis. Cras vitae ullamcorper est. Donec lacinia, neque vitae pharetra tincidunt, eros libero consequat mauris, vitae dictum erat odio at lectus. Nam tempus, turpis mattis sagittis viverra, nisi nulla fermentum ante, ut rhoncus tortor erat sed massa. Nulla bibendum in mauris at viverra. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Vivamus lacinia nibh aliquet facilisis vehicula. Donec ut porttitor quam. Etiam sagittis magna urna, vitae rutrum dui gravida eu. Nullam molestie leo eros, a condimentum velit ultrices vitae. Duis efficitur tortor arcu, ac facilisis velit accumsan vel.Curabitur elementum tortor nec leo bibendum lobortis porta id neque. Suspendisse quis orci ligula. Nulla sodales, dolor at tincidunt accumsan, nulla turpis fringilla urna, at sagittis dolor tellus eu felis. Nullam sodales quam sed lacus egestas, vitae rutrum orci ornare. Ut magna nisl, porttitor sit amet libero venenatis, facilisis vehicula enim. Vivamus erat nulla, auctor a elementum convallis, malesuada sed elit. Praesent justo elit, rhoncus et magna eget, imperdiet accumsan tellus. Nam sit amet tristique orci, eu mattis justo. Ut elementum erat vel risus fringilla, vel rhoncus neque finibus. Curabitur aliquet felis varius pharetra suscipit. Integer id ullamcorper nunc.Sed nec porta metus. Vivamus aliquam cursus tellus. Nunc aliquam hendrerit justo, vitae semper lectus lobortis quis. Morbi commodo felis eget imperdiet feugiat. Sed ante magna, gravida in metus in, consectetur accumsan risus. Pellentesque sit amet tellus quis ipsum lobortis bibendum vitae efficitur leo. Aliquam a ante justo. Integer pharetra, odio id convallis congue, lectus erat molestie arcu, quis cursus nibh arcu in elit. Ut magna nibh, consectetur sit amet augue eu, mattis lacinia lectus. Phasellus sed enim quis metus maximus ultrices. Proin euismod, odio mollis viverra scelerisque, diam orci porta diam, a elementum nulla dui vitae diam. Morbi nec dapibus purus, non placerat ipsum. Vivamus viverra neque eu pellentesque venenatis. Nulla malesuada ex erat, nec consectetur magna rutrum vitae. Aliquam aliquam turpis nec turpis hendrerit venenatis.Ut ligula sem, convallis vitae tempor in, interdum id odio. Interdum et malesuada fames ac ante ipsum primis in faucibus. Maecenas at euismod felis. Duis cursus arcu ac rutrum finibus. Ut congue dapibus nisi quis facilisis. Vestibulum ultricies faucibus enim aliquam vehicula. Praesent ultrices tortor quis arcu finibus, a fermentum quam blandit. Nullam odio mi, facilisis vitae purus vel, posuere efficitur ipsum.Vestibulum mattis, felis scelerisque ornare posuere, nulla eros mattis dolor, vitae facilisis tortor quam non odio. Donec pretium diam in felis semper lacinia. Cras congue laoreet ipsum, id rutrum magna interdum quis. Donec tristique lectus et cursus porttitor. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Nullam imperdiet maximus elit, a placerat dui sagittis rutrum. Morbi odio odio, eleifend quis venenatis non, mattis quis ligula.Pellentesque nec diam ac nisl suscipit facilisis. Integer finibus, orci vel blandit lacinia, magna elit gravida magna, eget lacinia sapien magna ac risus. Fusce convallis purus eu mattis faucibus. Curabitur porttitor tempor lorem quis sagittis. Ut congue ipsum egestas nunc porta, a semper lacus suscipit. Cras pellentesque aliquam dui, ut mattis purus vulputate ut. Nullam vel euismod odio. Vestibulum eros est, blandit non tortor at, pulvinar egestas est. Suspendisse potenti. Fusce sit amet turpis ligula.Suspendisse pharetra est purus, sed hendrerit arcu cursus elementum. Curabitur a nunc rhoncus, laoreet dui et, aliquet velit. Duis ornare egestas rhoncus. Aenean id nisl vitae risus vehicula scelerisque. Cras ac eros a quam interdum facilisis vitae vel risus. Etiam gravida feugiat nulla, eleifend placerat odio. Aliquam id feugiat justo, vel sollicitudin ante. Proin venenatis orci non pulvinar molestie. Ut auctor vel mauris vel varius. Aenean placerat justo sit amet nibh sollicitudin suscipit et dapibus felis. Quisque et ipsum id arcu fermentum pretium in eu quam.Cras sed tincidunt velit, sed tincidunt neque. In tempor nunc at gravida blandit. Nulla facilisi. Nulla egestas ante eget lacus semper egestas. Aliquam ornare felis urna, ut maximus purus rutrum nec. Cras non ultrices felis. Aenean vitae facilisis orci, sed eleifend tellus. Integer laoreet sollicitudin elementum. Donec massa metus, hendrerit et vehicula id, blandit id lacus.Praesent blandit sapien sit amet libero pellentesque feugiat. Curabitur pretium fermentum eleifend. Ut tempor diam in fermentum placerat. Sed commodo eget ipsum quis convallis. Donec vulputate velit non purus scelerisque convallis. Duis urna lacus, semper in porta non, sollicitudin in neque. Sed et facilisis lacus, congue sagittis leo. Duis dictum ac lacus et viverra. Donec tristique dui et faucibus rutrum.Curabitur lacinia ipsum in ligula finibus volutpat. Sed ornare lorem quis faucibus faucibus. Ut gravida quis augue vel vestibulum. Aenean aliquam sapien quis neque faucibus, a condimentum nisl malesuada. Maecenas tellus enim, efficitur ut nunc ac, faucibus ultrices mauris. Praesent ac sem id purus finibus sagittis a sed tortor. Suspendisse aliquet hendrerit magna tincidunt fringilla.Sed at dui eu lectus bibendum sollicitudin. Nullam tincidunt, enim malesuada lobortis gravida, arcu metus accumsan lectus, quis dictum dui purus vel justo. Nulla gravida, mauris a commodo tempor, felis quam hendrerit libero, in feugiat nisl nisi ut purus. Ut eleifend odio faucibus odio condimentum, imperdiet imperdiet ex finibus. Pellentesque quis purus sit amet dui pellentesque dignissim eget posuere dolor. Duis ultrices quam elementum nisl porttitor tristique id in arcu. Pellentesque vulputate ex quis sem mattis, sed suscipit lorem ullamcorper. In in tempus erat. Nulla dictum, dolor nec pretium blandit, ante tellus luctus nisi, ut tincidunt lacus elit sodales posuere. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec tincidunt, metus id vulputate convallis, ligula magna ultricies eros, et convallis leo odio vel sem. Cras ut leo quam. Fusce mattis risus eleifend justo facilisis molestie. Aliquam efficitur posuere nibh ut gravida. Phasellus mauris mi, venenatis sed neque in, rutrum aliquet leo. Nam molestie sapien sem, sed commodo ipsum ullamcorper ac. Etiam mattis fringilla lectus non interdum. Vivamus mi lectus, dictum quis ipsum in, varius pellentesque lacus. Sed vitae pharetra nisl. Fusce ullamcorper molestie leo, vel commodo sem fringilla vel. Nulla tempor libero lectus, eu eleifend ex hendrerit eu. Maecenas sodales ultrices massa.Donec gravida magna lectus, non hendrerit tellus commodo eget. Vivamus porttitor justo in orci semper, a commodo ipsum scelerisque. Nulla tortor leo, tincidunt in convallis sit amet, iaculis sed justo. Nunc rhoncus eget justo quis hendrerit. Ut ornare sit amet mauris nec tincidunt. Phasellus mattis ipsum a libero malesuada, at vestibulum mi facilisis. Mauris posuere erat eget mauris ultrices aliquam.Donec ultricies tellus a augue pulvinar, eget varius urna venenatis. Quisque nisl nulla, gravida quis risus sit amet, scelerisque suscipit tellus. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Quisque sem ex, pretium a condimentum a, semper id massa. Aenean vitae viverra tortor. Mauris sed purus lacinia, laoreet nulla nec, pretium felis. Vivamus quis laoreet purus, nec ultricies orci. Nam purus quam, tincidunt faucibus posuere at, scelerisque nec tortor. In eget urna tincidunt, rutrum tortor vitae, porttitor mi. Quisque faucibus est ut metus bibendum eleifend. Fusce rutrum placerat quam, sed porttitor elit luctus ac. Etiam dictum sagittis sem blandit auctor. Aenean et porta ante, ut imperdiet massa. Vivamus a porttitor risus, porta rhoncus enim. Suspendisse euismod ornare convallis.Vestibulum sit amet nibh tincidunt, lacinia diam sit amet, posuere risus. Curabitur quis malesuada erat. Phasellus ultricies pellentesque blandit. Suspendisse ultricies molestie mollis. Cras vitae ullamcorper est. Donec lacinia, neque vitae pharetra tincidunt, eros libero consequat mauris, vitae dictum erat odio at lectus. Nam tempus, turpis mattis sagittis viverra, nisi nulla fermentum ante, ut rhoncus tortor erat sed massa. Nulla bibendum in mauris at viverra. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Vivamus lacinia nibh aliquet facilisis vehicula. Donec ut porttitor quam. Etiam sagittis magna urna, vitae rutrum dui gravida eu. Nullam molestie leo eros, a condimentum velit ultrices vitae. Duis efficitur tortor arcu, ac facilisis velit accumsan vel.Curabitur elementum tortor nec leo bibendum lobortis porta id neque. Suspendisse quis orci ligula. Nulla sodales, dolor at tincidunt accumsan, nulla turpis fringilla urna, at sagittis dolor tellus eu felis. Nullam sodales quam sed lacus egestas, vitae rutrum orci ornare. Ut magna nisl, porttitor sit amet libero venenatis, facilisis vehicula enim. Vivamus erat nulla, auctor a elementum convallis, malesuada sed elit. Praesent justo elit, rhoncus et magna eget, imperdiet accumsan tellus. Nam sit amet tristique orci, eu mattis justo. Ut elementum erat vel risus fringilla, vel rhoncus neque finibus. Curabitur aliquet felis varius pharetra suscipit. Integer id ullamcorper nunc.Sed nec porta metus. Vivamus aliquam cursus tellus. Nunc aliquam hendrerit justo, vitae semper lectus lobortis quis. Morbi commodo felis eget imperdiet feugiat. Sed ante magna, gravida in metus in, consectetur accumsan risus. Pellentesque sit amet tellus quis ipsum lobortis bibendum vitae efficitur leo. Aliquam a ante justo. Integer pharetra, odio id convallis congue, lectus erat molestie arcu, quis cursus nibh arcu in elit. Ut magna nibh, consectetur sit amet augue eu, mattis lacinia lectus. Phasellus sed enim quis metus maximus ultrices. Proin euismod, odio mollis viverra scelerisque, diam orci porta diam, a elementum nulla dui vitae diam. Morbi nec dapibus purus, non placerat ipsum. Vivamus viverra neque eu pellentesque venenatis. Nulla malesuada ex erat, nec consectetur magna rutrum vitae. Aliquam aliquam turpis nec turpis hendrerit venenatis.Ut ligula sem, convallis vitae tempor in, interdum id odio. Interdum et malesuada fames ac ante ipsum primis in faucibus. Maecenas at euismod felis. Duis cursus arcu ac rutrum finibus. Ut congue dapibus nisi quis facilisis. Vestibulum ultricies faucibus enim aliquam vehicula. Praesent ultrices tortor quis arcu finibus, a fermentum quam blandit. Nullam odio mi, facilisis vitae purus vel, posuere efficitur ipsum.Vestibulum mattis, felis scelerisque ornare posuere, nulla eros mattis dolor, vitae facilisis tortor quam non odio. Donec pretium diam in felis semper lacinia. Cras congue laoreet ipsum, id rutrum magna interdum quis. Donec tristique lectus et cursus porttitor. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Nullam imperdiet maximus elit, a placerat dui sagittis rutrum. Morbi odio odio, eleifend quis venenatis non, mattis quis ligula.Pellentesque nec diam ac nisl suscipit facilisis. Integer finibus, orci vel blandit lacinia, magna elit gravida magna, eget lacinia sapien magna ac risus. Fusce convallis purus eu mattis faucibus. Curabitur porttitor tempor lorem quis sagittis. Ut congue ipsum egestas nunc porta, a semper lacus suscipit. Cras pellentesque aliquam dui, ut mattis purus vulputate ut. Nullam vel euismod odio. Vestibulum eros est, blandit non tortor at, pulvinar egestas est. Suspendisse potenti. Fusce sit amet turpis ligula.Suspendisse pharetra est purus, sed hendrerit arcu cursus elementum. Curabitur a nunc rhoncus, laoreet dui et, aliquet velit. Duis ornare egestas rhoncus. Aenean id nisl vitae risus vehicula scelerisque. Cras ac eros a quam interdum facilisis vitae vel risus. Etiam gravida feugiat nulla, eleifend placerat odio. Aliquam id feugiat justo, vel sollicitudin ante. Proin venenatis orci non pulvinar molestie. Ut auctor vel mauris vel varius. Aenean placerat justo sit amet nibh sollicitudin suscipit et dapibus felis. Quisque et ipsum id arcu fermentum pretium in eu quam.Cras sed tincidunt velit, sed tincidunt neque. In tempor nunc at gravida blandit. Nulla facilisi. Nulla egestas ante eget lacus semper egestas. Aliquam ornare felis urna, ut maximus purus rutrum nec. Cras non ultrices felis. Aenean vitae facilisis orci, sed eleifend tellus. Integer laoreet sollicitudin elementum. Donec massa metus, hendrerit et vehicula id, blandit id lacus.Praesent blandit sapien sit amet libero pellentesque feugiat. Curabitur pretium fermentum eleifend. Ut tempor diam in fermentum placerat. Sed commodo eget ipsum quis convallis. Donec vulputate velit non purus scelerisque convallis. Duis urna lacus, semper in porta non, sollicitudin in neque. Sed et facilisis lacus, congue sagittis leo. Duis dictum ac lacus et viverra. Donec tristique dui et faucibus rutrum.Curabitur lacinia ipsum in ligula finibus volutpat. Sed ornare lorem quis faucibus faucibus. Ut gravida quis augue vel vestibulum. Aenean aliquam sapien quis neque faucibus, a condimentum nisl malesuada. Maecenas tellus enim, efficitur ut nunc ac, faucibus ultrices mauris. Praesent ac sem id purus finibus sagittis a sed tortor. Suspendisse aliquet hendrerit magna tincidunt fringilla.Sed at dui eu lectus bibendum sollicitudin. Nullam tincidunt, enim malesuada lobortis gravida, arcu metus accumsan lectus, quis dictum dui purus vel justo. Nulla gravida, mauris a commodo tempor, felis quam hendrerit libero, in feugiat nisl nisi ut purus. Ut eleifend odio faucibus odio condimentum, imperdiet imperdiet ex finibus. Pellentesque quis purus sit amet dui pellentesque dignissim eget posuere dolor. Duis ultrices quam elementum nisl porttitor tristique id in arcu. Pellentesque vulputate ex quis sem mattis, sed suscipit lorem ullamcorper. In in tempus erat. Nulla dictum, dolor nec pretium blandit, ante tellus luctus nisi, ut tincidunt lacus elit sodales posuere.'
 AS [ReallyLongString]
`;
            setInterval( () => {
                conn.query(query,
                    (err, results, more) => {
                        console.log(`[${x}] more = ${more} err ${err} results ${JSON.stringify(results)}`);
                        if (more) return;
                        ++x;
                    })
            }, delay);
        });
    }
}

class PrintSelect implements SimpleTest {

    public run(conn_str:string, argv :any): void {
        let delay : number = argv.delay || 5000;

        sql.open(conn_str, (err, conn) => {
            if (err) {
                throw err;
            }
            let x = 1;
            if (err) {
                throw err;
            }

            setInterval( () => {
                conn.query(`print 'JS status message ${x}'; SELECT ${x} + ${x} as res;SELECT ${x} * ${x} as res2`,
                    (err, results, more) => {
                        if (more && !err && results && results.length === 0) {
                            return;
                        }
                        console.log(`[${x}] more = ${more} err ${err} results ${JSON.stringify(results)}`);
                        if (more) return;
                        ++x;
                    })
            }, delay);
        });
    }
}

class MemoryStress implements SimpleTest {

    public run(conn_str:string, argv :any): void {
        let delay : number = argv.delay || 5000;

        sql.open(conn_str, (err, conn) => {
            if (err) {
                throw err;
            }
            let x = 1;
            if (err) {
                throw err;
            }
            setInterval(() => {
                conn.queryRaw(`SELECT ${x}+${x};`, (err, results) => {
                    if (err) {
                        throw err;
                    }
                    console.log(results);
                });
            }, delay);
        });
    }
}

let test : SimpleTest;

switch (argv.t) {
    case "busy":
        test = new BusyConnection();
        break;

    case "large":
        test = new LargeStringSelect();
        break;

    case "memory":
        test = new MemoryStress();
        break;

    case "print":
        test = new PrintSelect();
        break;

    case "errors":
        test = new RaiseErrors();
        break;

    default:
        console.log(`test ${test} is not valid.`);
        break;
}

supp.GlobalConn.init(sql, (co: any) => {
        let conn_str = co.conn_str;
        support = co.support;
        procedureHelper = new support.ProcedureHelper(conn_str);
        procedureHelper.setVerbose(false);
        helper = co.helper;
        test.run(conn_str, argv);
    }
);