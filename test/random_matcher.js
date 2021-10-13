const matcher = require('../lib/matcher.js');
require('../lib/common.js');

var x = Math.random()*1000;
var y = Math.random()*1000;

var M;

UTIL.lookupIP('Matcher_GW', function(addr){

    M = new matcher(false, addr, 8000, x, y, 100, function(id){
        console.log('I have joined with id: ' + id);
    });

});
