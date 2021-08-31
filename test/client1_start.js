const client = require('../lib/client');

console.log('I am Client A');

var C1 = new client('127.0.0.1', 20000, 500, 500, 1,
    // When assigned to matcher, callback
    function(){
        console.log('Subscribing to overlap with top-right')
        C1.subscribe(650, 650, 50, 1);
    });

function publishMessages(){
    C1.publish(500, 350, 75, 'Client A publishing at center-bottom overlap', 1);
}

// give time for clients to join and subscribe first
setTimeout(publishMessages, 5000);

