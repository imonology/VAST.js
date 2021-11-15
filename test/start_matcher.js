const matcher = require('../lib/matcher.js');
require('dotenv').config()
var x = parseFloat(process.argv[2]) || Math.random()*1000;
var y = parseFloat(process.argv[3]) || Math.random()*1000;
var radius = parseFloat(process.argv[4]) || 100;

var M;
// find gateway address before instantiating matcher
console.log(process.env.COMPUTER_NAME)
UTIL.lookupIP(process.env.COMPUTER_NAME, function(addr){

    M = new matcher(false, addr, 8000, x, y, radius, function(id){
        console.log('I have joined with id: ' + id);
    });

});
