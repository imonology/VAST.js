const client = require('../lib/client');

// Testing Spatial Pub / Sub between 3 clients. Client A on left, Client B on right, Client C covers all
// Client B is also subbed to small area at [620, 620]

console.log('I am Client C');

var C3 = new client('127.0.0.1', 10000, 510, 510, 1, function(){
    C3.subscribe(510, 500, 30, 1);
});

function publishMessages(){
    C3.publish(510, 500, 1, 'Client C published in centre', 1);
    C3.publish(485, 500, 1, 'Client C published on left', 1);
    C3.publish(460, 500, 15, 'Client C published on left edge (centre outside, aoi intesects)', 1);
    C3.publish(550, 500, 15, 'Client C published on right edge (centre outside, aoi intesects)', 1);
    C3.publish(510, 525, 1, 'Client C published above', 1);
    C3.publish(620, 620, 15, 'Client C published at distant area', 1);
}

// give time for clients to join and subscribe first
setTimeout(publishMessages, 5000);

