const client = require('../lib/client');
require('../lib/common.js');

var sub_x = process.argv[2] || 500;
var sub_y = process.argv[3] || 500;
var sub_radius = process.argv[4] || 20;

var pub_x = process.argv[5] || 500;
var pub_y = process.argv[6] || 500;
var pub_radius = process.argv[7] || 20;

var x = process.argv[8] || Math.random()*1000;
var y = process.argv[9] || Math.random()*1000;
var aoi_radius = process.argv[10] || 10;

var wait_to_ping =  1000;
var ping_refresh_time = 100;
var wait_to_unsubscribe = process.argv[7] || 0;
var randomisation = Math.pow(Math.random()*5, 3); // higher powers increases variability (apparently)

var _id;

var GW_addr; // Address of first matcher we establish socket connection with

var C;

// get GW address before attempting init
UTIL.lookupIP('LAPTOP-JJ5440PB', function(addr){
    GW_addr = addr;

    C = new client(GW_addr, 20000, x, y, aoi_radius, function(id){
        console.log('Client: ' + id + ' subscribing around themself at {x: '+x+'; y: '+y+'; radius: '+aoi_radius+'}');
        C.subscribe(x, y, aoi_radius, 2);
    
        console.log('Client: ' + id + ' subscribing at {x: '+sub_x+'; y: '+sub_y+'; radius: '+sub_radius+'}');
        C.subscribe(sub_x, sub_y, sub_radius, 1);
    
        _id = id;    
    });

});

function publishMessage(){
    console.log('I am publishing');

    //C.publish(x, y, 1,'Client: '  + _id + ' published with small radius around themself', 1);

    //C.publish(sub_x, sub_y, sub_radius,'Client: '  + _id + ' published with equal radius', 1);
    //C.publish(sub_x, sub_y, 1,'Client: '  + _id + ' published at center of subsciption', 1);
    C.publish(1, 1, 1000, 'Client: '  + _id + ' published at corner with huge radius', 1)

    //setTimeout(publishMessage, pub_refresh_time);
}

function sendPINGs(){
    console.log('I am pinging to random location');
    var xx = Math.random()*1000;
    var yy = Math.random()*1000;
    C.sendPING(330,330, 100, 1);

    setInterval(function(){
        xx = Math.random()*1000;
        yy = Math.random()*1000;
        C.sendPING(xx,yy, 500, 1);
    }, ping_refresh_time);
}

function clearSubscriptions(){
    console.log('clearing all my subs');
    C.clearSubscriptions();
}

// give time for clients to join and subscribe first
setTimeout(sendPINGs, wait_to_ping);

if (wait_to_unsubscribe > 1000){
    //setTimeout(clearSubscriptions, wait_to_unsubscribe);
}


