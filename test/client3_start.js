const client = require('../lib/client');

// Testing Spatial Pub / Sub between 3 clients. Client A on left, Client B on right, Client C covers all
// Client B is also subbed to small area at [620, 620]

console.log('I am Client C');

var C3 = new client('127.0.0.1', 20000, 120, 120, 1, function(){
    //console.log('subscribing at bottom left, around myself')
    //C3.subscribe(120, 120, 30, 1);
});

function publishMessages(){
    C3.publish(120, 120, 30,'Client C published at bottom left', 1);
}

// give time for clients to join and subscribe first
setTimeout(publishMessages, 5000);

