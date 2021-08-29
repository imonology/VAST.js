const matcher = require('../lib/matcher.js');

var matcherCount = 0;

function createGW(){
    var GW = new matcher(true, '127.0.0.1', 8000, 166.5, 832.5, 10, function(){
        matcherCount++;
    });
}
function createM2(){
    var M2 = new matcher(false, '127.0.0.1', 8000, 500, 832.5, 10, function(){
        matcherCount++;
    });
}
function createM3(){
    var M3 = new matcher(false, '127.0.0.1', 8000, 832.5, 832.5, 10, function(){
        matcherCount++;
    });
}
function createM4(){
    var M4 = new matcher(false, '127.0.0.1', 8000, 166.5, 500, 10, function(){
        matcherCount++;
    });
}
function createM5(){
    var M5 = new matcher(false, '127.0.0.1', 8000, 500, 500, 10, function(){
        matcherCount++;
    });
}
function createM6(){
    var M6 = new matcher(false, '127.0.0.1', 8000, 832.5, 500, 10, function(){
        matcherCount++;
    });
}
function createM7(){
    var M7 = new matcher(false, '127.0.0.1', 8000, 166.5, 166.5, 10, function(){
        matcherCount++;
    });
}
function createM8(){
    var M8 = new matcher(false, '127.0.0.1', 8000, 500, 166.5, 10, function(){
        matcherCount++;
    });
}
function createM9(){
    var M9 = new matcher(false, '127.0.0.1', 8000, 832.5, 166.5, 10, function(){
        matcherCount++;
        console.log('Matchers are set up');
    });
}
createGW();
setTimeout(createM2, 2000);
setTimeout(createM3, 3000);
setTimeout(createM4, 4000);
setTimeout(createM5, 5000);
setTimeout(createM6, 6000);
setTimeout(createM7, 7000);
setTimeout(createM8, 8000);
setTimeout(createM9, 9000);

