const matcher = require('../lib/matcher.js');

var GW, L1, L2, L3, L4, R1, R2, R3, R4;
var matcherCount = 0;

function createGW(){
    GW = new matcher(true, '127.0.0.1', 8000, 166.5, 166.5, 500, function(){
        matcherCount++
    });
}
function createM2(){
    var M2 = new matcher(false, '127.0.0.1', 8000, 166.5, 832.5, 500, function(){
        matcherCount++
    });
}
function createM3(){
    var M3 = new matcher(false, '127.0.0.1', 8000, 832.5, 832.5, 500, function(){
        matcherCount++
    });
}
function createM4(){
    var M4 = new matcher(false, '127.0.0.1', 8000, 832.5, 166.5, 500, function(){
        matcherCount++
    });
}
function createM5(){
    var M5 = new matcher(false, '127.0.0.1', 8000, 500, 500, 500, function(){
        matcherCount++
    });
}
function createM6(){
    var M6 = new matcher(false, '127.0.0.1', 8000, 166.5, 500, 500, function(){
        matcherCount++
    });
}
function createM7(){
    var M7 = new matcher(false, '127.0.0.1', 8000, 500, 832.5, 500, function(){
        matcherCount++
    });
}
function createM8(){
    var M8 = new matcher(false, '127.0.0.1', 8000, 832.5, 500, 500, function(){
        matcherCount++
    });
}
function createM9(){
    var M9 = new matcher(false, '127.0.0.1', 8000, 500, 166.5, 500, function(){
        matcherCount++
        console.log('Matchers are set up');
    });
}
createGW();
setTimeout(createM2, 1000);
setTimeout(createM3, 2000);
setTimeout(createM4, 3000);
setTimeout(createM5, 4000);
setTimeout(createM6, 5000);
setTimeout(createM7, 6000);
setTimeout(createM8, 7000);
setTimeout(createM9, 8000);

/*
// Callback hell, use promises or a timer in larger system

// BL
var GW = new matcher(true, '127.0.0.1', 8000, 166.5, 166.5, 500, function(){
    mactherCount++;
    // TL
    var M2 = new matcher(false, '127.0.0.1', 8000, 166.5, 832.5, 500, function(){
        mactherCount++;
        //TR
        var M3 = new matcher(false, '127.0.0.1', 8000, 832.5, 832.5, 500, function(){
            mactherCount++;
            // BR
            var M4 = new matcher(false, '127.0.0.1', 8000, 832.5, 166.5, 500, function(){
                mactherCount++;
                // C
                var M5 = new matcher(false, '127.0.0.1', 8000, 500, 500, 500, function(){
                    mactherCount++;
                    // CL
                    var M6 = new matcher(false, '127.0.0.1', 8000, 166.5, 500, 500, function(){
                        mactherCount++;
                        // TC
                        var M7 = new matcher(false, '127.0.0.1', 8000, 500, 832.5, 500, function(){
                            mactherCount++;
                            // CR
                            var M8 = new matcher(false, '127.0.0.1', 8000, 832.5, 500, 500, function(){
                                mactherCount++;
                                // BC
                                var M9 = new matcher(false, '127.0.0.1', 8000, 500, 166.5, 500, function(){
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});
*/

