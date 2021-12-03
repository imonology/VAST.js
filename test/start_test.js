// This file starts a number of matchers all on localhost. Each matcher is instantiaied in a new node process.
// This file also starts the global server for visualisation purposes

// How many matchers in this test?
var matcherCount = parseInt(process.argv[2]) || 5;

// the desired aoi radius for the matchers
var aoi = parseInt(process.argv[3]) || 100;

var timeBetweenMatchers = parseInt(process.argv[4]) || 2000; // 2 s

var worldSize = 1000; // size of the environment (assuming square)

const { spawn } = require('child_process');

const { exec } = require("child_process");

// Declare funtions
var _addMatcher = function(x, y, radius){
    var cmd = "start node test/start_matcher.js" + " " + x + " " + y + " " + radius;
    exec(cmd, (error, data, getter) => {
        if (error) {
            console.log("error",error.message);
            return;
        }
        if (getter) {
            console.log("data",data);
            return;
        }
        console.log("data",data);   
    });
}

//  First start the global server
exec("start node test/global_server_starter.js", (error, data, getter) => {
	if (error) {
		console.log("error",error.message);
		return;
	}
	if (getter) {
		console.log("data",data);
		return;
	}
	console.log("data",data);
});


//start the Gateway matcher with random coords
var xx = Math.random() * worldSize;
var yy = Math.random() * worldSize;
var cmd = "start node test/start_GW.js" + " " + xx + " " + yy + " " + aoi;
exec(cmd, (error, data, getter) => {
	if (error) {
		console.log("error",error.message);
		return;
	}
	if (getter) {
		console.log("data",data);
		return;
	}
	console.log("data",data);

});

// add matchers
setTimeout(function(){
    var i = 1; // GW counts is the first matcher already

    // must use while loop and setInterval in order to pause properly
    var generate = setInterval(function(){
        if (i >= matcherCount) {
            clearInterval(generate);
        } else{
            var xx = Math.random() * worldSize;
            var yy = Math.random() * worldSize;
            _addMatcher(xx, yy, aoi);
            i++;
        }
    }, timeBetweenMatchers);
}, timeBetweenMatchers);