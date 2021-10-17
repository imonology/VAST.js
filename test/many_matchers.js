var matcherCount = 3;

const { spawn } = require('child_process');

const { exec } = require("child_process");
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



//GW first
//spawn('echo "hello"');

for (var i = 1; i < matcherCount; i++){
}



