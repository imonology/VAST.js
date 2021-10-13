const matcher = require('../lib/matcher.js');

var x = Math.random()*1000;
var y = Math.random()*1000;

var GW = new matcher(true, '0.0.0.0', 8000, x, y, 100, function(id){
    console.log('I have joined as gateway with ID: '+id);
});