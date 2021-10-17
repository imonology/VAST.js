var matcherCount = 10;

const { spawn } = require('child_process');

const { exec } = require("child_process");

// start global server
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

//start GW
exec("start node test/random_GW.js", (error, data, getter) => {
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

var _addMatcher = function(){
    exec("start node test/random_matcher.js", (error, data, getter) => {
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

// add matchers
setTimeout(function(){
    for (var i = 1; i < matcherCount; i++){
        console.log('Adding matcher ' + i);
        setTimeout(_addMatcher, 300);
    }
}, 2000);





