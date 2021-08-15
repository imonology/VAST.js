const client = require('../lib/client');

// Testing Spatial Pub / Sub between 3 clients. Client A on left, Client B on right, Client C covers all
// Client B is also subbed to small area at [620, 620]

console.log('I am Client A');

var C1 = new client('127.0.0.1', 10000, 500, 500, 1,
    // When assigned to matcher, callback
    function(){
        C1.subscribe(500, 500, 20, 1);
    });

function publishMessages(){
    C1.publish(510, 500, 1, 'Client A published in centre', 1);
    C1.publish(485, 500, 1, 'Client A published on left', 1);
}

// give time for clients to join and subscribe first
setTimeout(publishMessages, 15000);

