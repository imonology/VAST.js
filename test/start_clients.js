// Starts "count" number of random matchers as child processes (seperate node instances)


const { exec } = require("child_process");

// KEEP SIZE 1000
const SIZE = 1000;

const count = parseInt(process.argv[2]) || 5;
const aoi = parseInt(process.argv[3]) || 100;

// Declare funtions

var _addClient = function(x, y, radius){
    var cmd = "node test/random_matcher.js" + " " + aoi;

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

// add matchers
setTimeout(function(){
    
    // must use while loop and setIntervalin order to pause
    var i = 1;
    var generate = setInterval(function(){
        if(i > count){
            clearInterval(generate);
        }else{

            var x = Math.random()*SIZE;
            var y = Math.random()*SIZE;
            _addClient(x, y, aoi);
            i++;
        }
    }, 1500);
}, 1000);