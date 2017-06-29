/**
 * Created by Stephen on 28/06/2017.
 */

// encapsulate operation management - used by driver manager to queue work to the c++ driver.
// note that item[0] is live with the c++ and remains until the statement is complete.

function WorkQueue() {

    var workQueue = [];

    function emptyQueue() {
        while (workQueue.length > 0) {
            workQueue.shift();
        }
    }

    function enqueue(commandId, fn,  args) {
        var op = makeOp(commandId, fn, args);
        execQueueOp(op);
    }

    function makeOp(commandId, fn,  args) {
        return {
            commandId:commandId,
            fn: fn,
            args: args
        };
    }

    function dropItem(i) {
        for (j = i ; j < workQueue.length - 1; ++j) {
            workQueue[j] = workQueue[j + 1];
        }
        workQueue.pop();
    }

    function nextOp() {
        workQueue.shift();
        if (workQueue.length !== 0) {
            var op = workQueue[0];
            op.fn.apply(op.fn, op.args);
        }
    }

    function execQueueOp(op) {
        workQueue.push(op);
        if (workQueue.length === 1) {
            op.fn.apply(op.fn, op.args);
        }
    }

    function length() {
        return workQueue.length;
    }

    function first(primitive) {
        for(var i = 0; i < workQueue.length; ++i) {
            var item = workQueue[i];
            if (primitive(i, item)) return item;
        }
        return null;
    }

    function get(i) {
        return workQueue[i];
    }

    var public_api = {
        first:first,
        dropItem: dropItem,
        nextOp:nextOp,
        emptyQueue:emptyQueue,
        enqueue:enqueue,
        length:length,
        get:get

    };

    return public_api;
}

exports.WorkQueue = WorkQueue;