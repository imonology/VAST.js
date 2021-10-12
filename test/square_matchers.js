const matcher = require('../lib/matcher.js');

var matcherCount = 0;

function random(){
    return Math.random()*1000;
}

// slightly non-square
function createGW(){
    var GW = new matcher(true, '127.0.0.1', 8000, 150, 832.5, 100, function(){
        matcherCount++;
    });
}
function createM2(){
    var M2 = new matcher(false, '127.0.0.1', 8000, 480, 832.5, 100, function(){
        matcherCount++;
    });
}
function createM3(){
    var M3 = new matcher(false, '127.0.0.1', 8000, 800, 832.5, 100, function(){
        matcherCount++;
    });
}
function createM4(){
    var M4 = new matcher(false, '127.0.0.1', 8000, 170, 500, 100, function(){
        matcherCount++;
    });
}
function createM5(){
    var M5 = new matcher(false, '127.0.0.1', 8000, 520, 500, 100, function(){
        matcherCount++;
    });
}
function createM6(){
    var M6 = new matcher(false, '127.0.0.1', 8000, 850, 500, 100, function(){
        matcherCount++;
    });
}
function createM7(){
    var M7 = new matcher(false, '127.0.0.1', 8000, 166.5, 166.5, 100, function(){
        matcherCount++;
    });
}
function createM8(){
    var M8 = new matcher(false, '127.0.0.1', 8000, 500, 166.5, 100, function(){
        matcherCount++;
    });
}
function createM9(){
    var M9 = new matcher(false, '127.0.0.1', 8000, 832.5, 166.5, 100, function(){
        matcherCount++;
        console.log('Matchers are set up');
    });
}





// square grid
/*
function createGW(){
    var GW = new matcher(true, '127.0.0.1', 8000, 166.5, 832.5, 100, function(){
        matcherCount++;
    });
}
function createM2(){
    var M2 = new matcher(false, '127.0.0.1', 8000, 500, 832.5, 100, function(){
        matcherCount++;
    });
}
function createM3(){
    var M3 = new matcher(false, '127.0.0.1', 8000, 832.5, 832.5, 100, function(){
        matcherCount++;
    });
}
function createM4(){
    var M4 = new matcher(false, '127.0.0.1', 8000, 166.5, 500, 100, function(){
        matcherCount++;
    });
}
function createM5(){
    var M5 = new matcher(false, '127.0.0.1', 8000, 500, 500, 100, function(){
        matcherCount++;
    });
}
function createM6(){
    var M6 = new matcher(false, '127.0.0.1', 8000, 832.5, 500, 100, function(){
        matcherCount++;
    });
}
function createM7(){
    var M7 = new matcher(false, '127.0.0.1', 8000, 166.5, 166.5, 100, function(){
        matcherCount++;
    });
}
function createM8(){
    var M8 = new matcher(false, '127.0.0.1', 8000, 500, 166.5, 100, function(){
        matcherCount++;
    });
}
function createM9(){
    var M9 = new matcher(false, '127.0.0.1', 8000, 832.5, 166.5, 100, function(){
        matcherCount++;
        console.log('Matchers are set up');
    });
}
*/

createGW();
setTimeout(createM2, 200);
setTimeout(createM3, 300);
setTimeout(createM4, 400);
setTimeout(createM5, 500);
setTimeout(createM6, 600);
setTimeout(createM7, 700);
setTimeout(createM8, 800);
setTimeout(createM9, 900);


