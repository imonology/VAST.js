const matcher = require('../lib/matcher.js');
require('../lib/common.js');

var x = parseFloat(process.argv[2]) || Math.random()*1000;
var y = parseFloat(process.argv[3]) || Math.random()*1000;
var radius = parseFloat(process.argv[3]) || 100;

var M;

UTIL.lookupIP('LAPTOP-JJ5440PB.local', function(addr){

    M = new matcher(false, addr, 8000, x, y, radius, function(id){
        console.log('I have joined with id: ' + id);
    });

});
