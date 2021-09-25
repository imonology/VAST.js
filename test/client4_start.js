const client = require('../lib/client');

console.log('I am Client D');

var C4 = new client('127.0.0.1', 20000, 680, 680, 10, function(){
    console.log('Subscribing at bottom left, far away');
    C4.subscribe(100, 100, 10, 1); // test if distant sub works

});

function publishMessages(){
    C4.publish(670, 670, 20, 'Client D published at top right corner, near themself', 1);
}

// give time for clients to join and subscribe first
setTimeout(publishMessages, 1000);

