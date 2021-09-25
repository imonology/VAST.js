const client = require('../lib/client');

console.log('I am Client A');

var C1 = new client('127.0.0.1', 20000, 500, 500, 1,
    // When assigned to matcher, callback
    function(){
        console.log('Subscribing around myself')
        C1.subscribe(500, 500, 50, 1);
        console.log('Subscribing to overlap with top-right')
        C1.subscribe(660, 660, 50, 1);
        console.log('Subscribing to the left of myself')
//        C1.subscribe(350, 500, 50, 1);
    });

function publishMessages(){
    C1.publish(500, 350, 75, 'Client A publishing at center-bottom overlap', 1);
    C1.publish(500, 500, 700, 'Client A publishing at center, with huge radius', 1);
}

// give time for clients to join and subscribe first
setTimeout(publishMessages, 1000);

