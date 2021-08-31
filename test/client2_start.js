const client = require('../lib/client');

console.log('I am Client B');

var C2 = new client('127.0.0.1', 20000, 800, 800, 1, function(){
    console.log('Subscribing at center-bottom. Far away and overlapping');
    C2.subscribe(500, 300, 75, 1);    
});


function publishMessages(){
    C2.publish(680, 680,10,'Client B published at top-right, near themself', 1)
}

// give time for clients to join and subscribe first
setTimeout(publishMessages, 5000);

