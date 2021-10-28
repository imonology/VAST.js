const matcher = require('../lib/matcher.js');

var x = parseFloat(process.argv[2]) || Math.random()*1000;
var y = parseFloat(process.argv[3]) || Math.random()*1000;
var radius = parseFloat(process.argv[4]) || 100;

var M;

// find gateway address before instantiating matcher
UTIL.lookupIP('supernode.local', function(addr){

    M = new matcher(false, addr, 8000, x, y, radius, function(id){
        console.log('I have joined with id: ' + id);
    });

});
