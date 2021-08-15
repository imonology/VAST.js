const client = require('../lib/client');

// Testing Spatial Pub / Sub between 3 clients. Client A on left, Client B on right, Client C covers all
// Client B is also subbed to small area at [620, 620]

console.log('I am Client B');

var C2 = new client('127.0.0.1', 10000, 520, 520, 1, function(){
    C2.subscribe(520, 500, 20, 1);
    C2.subscribe(620, 620, 10, 1); // test if multiple subs works
});


function publishMessages(){
    C2.publish(510, 500, 1, 'Client B published in centre', 1);
    C2.publish(535, 500, 1, 'Client B published on right', 1);
    C2.publish(600, 600, 20, 'Client B publishing at distant area');
}

// give time for clients to join and subscribe first
setTimeout(publishMessages, 5000);

