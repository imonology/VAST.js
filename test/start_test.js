var matcherCount = 10;

const { spawn } = require('child_process');

const { exec } = require("child_process");

const aoi = 100;

// KEEP SIZE 1000
const SIZE = 1000;
var x = [];
var y = [];

var count = 3;

const pi = Math.PI;

// Declare funtions



var _addMatcher = function(x, y, radius){
    var cmd = "start node test/random_matcher.js" + " " + x + " " + y + " " + radius;

    exec(cmd, (error, data, getter) => {
        if(error){
            console.log("error",error.message);
            return;
        }
        if(getter){
            console.log("data",data);
            return;
        }
        console.log("data",data);
    
    });
}

// INIT

// start global server
/*
exec("start node test/global_server_starter.js", (error, data, getter) => {
	if(error){
		console.log("error",error.message);
		return;
	}
	if(getter){
		console.log("data",data);
		return;
	}
	console.log("data",data);
});
*/

//start GW

var cmd = "start node test/random_GW.js" + " " + x[0] + " " + y[0] + " " + aoi;
exec(cmd, (error, data, getter) => {
	if(error){
		console.log("error",error.message);
		return;
	}
	if(getter){
		console.log("data",data);
		return;
	}
	console.log("data",data);

});

// add matchers
setTimeout(function(){
    
    // must use while loop and setIntervalin order to pause
    var i = 1;
    var generate = setInterval(function(){
        if(i >= x.length || i >= y.length || i >= count){
            clearInterval(generate);
        }else{

            //console.log('i: ' + i);
            _addMatcher(x[i], y[i], aoi);
            i++;
        }
    }, 1500);
}, 1000);





/*
// generate coords for evenly spaced hexagons
var tesselate = function(count){
    x = [];
    y = [];

    cent_x = SIZE/2;
    cent_y = SIZE/2;

    // CENTRE is first position (GW)
    x.push(cent_x);
    y.push(cent_y);

    var a = 0;  // temp (1 + 2 + 3 + 4....)
    var b = 0;  // rings
    var c = 0;  // count
    var bool = false;
    while( c < count){
        c = a*6 + 1;
        a = a + b + 1
        b += 1;
    }

    var rings = b - 1;

    var unit_length = (SIZE/2)/(rings*2+1);

    var alt = 0;
    var offset; 
    var theta, radius;

    b = 1;  // ring number
    c = 6;  // divisions on radius
    for (var r = 1; r <= rings; r++){

        radius = 2*r*unit_length;

        for (var i = 1; i <= c; i++){
            theta = (i*2*pi)/(c);
            x.push(cent_x + Math.cos(theta)*radius);
            y.push(cent_y + Math.sin(theta)*radius);
        }

        b += 1;
        c += b*6;
    }
}


// old code that lays matchers out on concentric rings
var matchersI = setInterval(function(){
    if(i >= I){
        clearInterval(matchersI);
    }else{
        var theta = (i*2*pi)/I;
        var x = center.x + Math.cos(theta)*r1;
        var y = center.y + Math.sin(theta)*r1;
        //console.log('i: ' + i);
        _addMatcher(x, y, aoi);
        i++;
    }
}, 333);

var j = 0;
var matchersJ = setInterval(function(){
    if(j >= J){
        clearInterval(matchersJ);
    }else{
        var theta = (j*2*pi)/J;
        var x = center.x + Math.cos(theta)*r2;
        var y = center.y + Math.sin(theta)*r2;
        //console.log('j: '+j);
        _addMatcher(x, y, aoi);
        j++;
    }
}, 500);

var k = 0;
var matchersK = setInterval(function(){
    if(k >= K){
        clearInterval(matchersK);
    }else{
        var theta = (k*2*pi)/K;
        var x = center.x + Math.cos(theta)*r3;
        var y = center.y + Math.sin(theta)*r3;
        //console.log('k: '+k);
        _addMatcher(x, y, aoi);
        k++;
    }
}, 1200);

*/