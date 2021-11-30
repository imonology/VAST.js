const client = require('../lib/client');
require('../lib/common.js');
require('dotenv').config()
const SIZE = 1000; // world size

// my position and AoI to subscribe for PONG messages
var x = process.argv[2] || Math.random()*SIZE;
var y = process.argv[3] || Math.random()*SIZE;
var r = process.argv[4] || 10;

// secondary aoi for subs / or pubs
var x2 = process.argv[5] || SIZE/2;
var y2 = process.argv[6] || SIZE/2;
var r2 = process.argv[7] || SIZE;


// Argument for request type
var type = process.argv[8] || "";
console.log (type)


// if type == sub:
//     {
//         //do something
//     }

// =======
//WORKING HERE
var type=process.argv[8]
if(type=='sub'){
    console.log("Sub req made");
}else if(type=='pub'){
    console.log("pub req made");
}
console.log(type)


// Publisher? aoi2 used for pubs. Otherwise, for subs
var bool = process.argv[8];
if (typeof(bool) != 'undefined' && bool.toString() === 'true'){
    specifyPublishing = true;
}
else{
    specifyPublishing = false;
}


var wait_to_ping =  parseInt(process.argv[9]) || 1000; // wait 1 min for all clients to finish joining
var ping_refresh_time = parseInt(process.argv[10]) || 1000; // time between pings

var _id;

var GW_addr; // Address of first matcher we establish socket connection with

var C;

var isStarted = false; //started performig tests?

function sendPINGs(){

    // only start recording once we start pinging, and give some extra time for all other clients to join as well
    C.startRecordingPONGs();
    C.startRecordingBandwidth();


    // aoi2 specifies publications
    if (specifyPublishing === true){
        console.log(_id + ' is pinging to specified location: [x:'+x2+'; y:'+y2+'; r2:'+r2);
    
        C.sendPING(x2, y2, r2, 64, 'PING');
        setInterval(function(){
            C.sendPING(x2, y2, r2, 64, 'PING');
        }, ping_refresh_time);
    }
    else{
        console.log(_id + ' is pinging to local aoi');

        C.sendPING(x, y, r, 64, 'PING');
        setInterval(function(){
            C.sendPING(x, y, r, 64, 'PING');
        }, ping_refresh_time);
    }
}

function clearSubscriptions(){
    console.log('clearing all my subs');
    C.clearSubscriptions();
}

// init
// get GW address before attempting init
UTIL.lookupIP("127.0.0.1", function(addr){
    GW_addr = addr;

    C = new client(GW_addr, 20000, x, y, r, function(id){
        _id = id;    

        if (isStarted === false){
            // subscribe to receive pongs (ping responses) around my aoi
            // use id as channel so that only I can receive these responses 
            console.log(_id + ' is subscribing for PONGS around themself at:{x: '+x+'; y: '+y+'; radius: '+r+'}');
            C.subscribe(x, y, r, _id);
        
            // subscribe to receive pings on the PING channel
            if (specifyPublishing === true){
                console.log('Client: ' + id + ' subscribing for pings locally');
                C.subscribe(x, y, r, 'PING');
            }
            else {
                console.log('Client: ' + id + ' subscribing for pings at {x: '+x2+'; y: '+y2+'; radius: '+r2+'}');
                C.subscribe(x2, y2, r2, 'PING');
            }

            // give time for clients to join and subscribe first
            isStarted = true;
            setTimeout(sendPINGs, wait_to_ping);
        }
    });

});
