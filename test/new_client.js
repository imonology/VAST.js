const client = require('../lib/client');
require('../lib/common.js');

const SIZE = 1000; // world size

// my position and AoI to subscribe for PONG messages
var x = process.argv[2] || Math.random()*SIZE;
var y = process.argv[3] || Math.random()*SIZE;
var r = process.argv[4] || 10;

// secondary aoi for subs / or pubs
var x2 = process.argv[5] || SIZE/2;
var y2 = process.argv[6] || SIZE/2;
var r2 = process.argv[7] || SIZE;

// Publisher? aoi2 used for pubs. Otherwise, for subs
var boolStr = process.argv[8] || 'false';
var specifyPublishing = boolStr == 'true' ? true : false;

var wait_to_ping =  parseInt(process.argv[9]) || 1000; // wait 1 min for all clients to finish joining
var ping_refresh_time = parseInt(process.argv[10]) || 1000; // time between pings

var _id;

var GW_addr; // Address of first matcher we establish socket connection with

var C;

function sendPINGs(){
    // aoi2 specifies publications
    if (specifyPublishing === true){
        console.log(_id + ' is pinging to specified location: [x:'+x2+'; y:'+y2+'; r2:'+r2);
    
        setInterval(function(){
            C.sendPING(x2, y2, r2, 256, 'PING');
        }, ping_refresh_time);
    }
    else{
        // ping around my local aoi
        console.log(_id + ' is pinging to local aoi');
        setInterval(function(){
            C.sendPING(x, y, r, 256, 'PING');
        }, ping_refresh_time);
    }
}

function clearSubscriptions(){
    console.log('clearing all my subs');
    C.clearSubscriptions();
}

// init
// get GW address before attempting init
UTIL.lookupIP('supernode.local', function(addr){
    GW_addr = addr;

    C = new client(GW_addr, 20000, x, y, r, function(id){
        _id = id;    

        // subscribe to receive pongs (ping responses) around my aoi
        // use id as channel so that only I can receive these responses 
        console.log(_id + ' is subscribing for PONGS around themself at:{x: '+x+'; y: '+y+'; radius: '+r+'}');
        C.subscribe(x, y, r, _id);
    
        // subscribe to receive pings on the PING channel
        if (specifyPublishing === false){
            console.log('Client: ' + id + ' subscribing for pings at {x: '+x2+'; y: '+y2+'; radius: '+r2+'}');
            C.subscribe(x2, y2, r2, 'PING');
        }
        else {
            console.log('Client: ' + id + ' subscribing at for pings at {x: '+x+'; y: '+y+'; radius: '+r+'}');
            C.subscribe(x, y, r, 'PING');
        }

        // give time for clients to join and subscribe first
        setTimeout(sendPINGs, wait_to_ping);
    });

});



