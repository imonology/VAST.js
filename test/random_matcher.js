const matcher = require('../lib/matcher.js');

var x = Math.random()*1000;
var y = Math.random()*1000;
var radius = parseFloat(process.argv[2]) || 100;

var M;

// find gateway address before instantiating matcher
UTIL.lookupIP('supernode.local', function(addr){

    M = new matcher(false, addr, 8000, x, y, radius, function(id){
        console.log('I have joined with id: ' + id);
    });

});
