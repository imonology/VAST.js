const client = require('../lib/client');

// Testing Spatial Pub / Sub between 3 clients. Client A on left, Client B on right, Client C covers all
// Client B is also subbed to small area at [620, 620]

console.log('I am Client A');

var C1 = new client('127.0.0.1', 10000, 500, 500, 1,
    // When assigned to matcher, callback
    function(){
        C1.subscribe(660, 660, 50, 1);
    });

function publishMessages(){

}

// give time for clients to join and subscribe first
setTimeout(publishMessages, 5000);

