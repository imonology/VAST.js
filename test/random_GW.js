const matcher = require('../lib/matcher.js');

var x = Math.random()*1000;
var y = Math.random()*1000;

var GW = new matcher(true, '127.0.0.1', 8000, x, y, 100, function(){});