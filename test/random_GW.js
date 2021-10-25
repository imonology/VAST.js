const matcher = require('../lib/matcher.js');

var x = parseFloat(process.argv[2]) || Math.random()*1000;
var y = parseFloat(process.argv[3]) || Math.random()*1000;
var radius = parseFloat(process.argv[3]) || 100;

var GW = new matcher(true, '0.0.0.0', 8000, x, y, radius, function(id){
    console.log('I have joined as gateway with ID: '+id);
});