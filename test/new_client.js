const client = require('../lib/client');

var sub_x = process.argv[2] || 500;
var sub_y = process.argv[3] || 500;
var sub_radius = process.argv[4] || 100;
var wait_to_ping = process.argv[5] || 1000;
var ping_refresh_time = process.argv[6] || 5000;
var wait_to_unsubscribe = process.argv[7] || 0;

var x = process.argv[8] || Math.random()*1000;
var y = process.argv[9] || Math.random()*1000;
var aoi_radius = process.argv[10] || Math.random()*100;

var _id;


var C = new client('127.0.0.1', 20000, x, y, 1, function(id){
    console.log('Client: ' + id + ' subscribing around themself at {x: '+x+'; y: '+y+'; radius: '+aoi_radius+'}');
    C.subscribe(x, y, aoi_radius, 1);

    //console.log('Client: ' + id + ' subscribing at {x: '+sub_x+'; y: '+sub_y+'; radius: '+sub_radius+'}');
    //C.subscribe(sub_x, sub_y, sub_radius, 1);

    _id = id;    
});


function publishMessage(){
    console.log('I am publishing');

    //C.publish(x, y, 1,'Client: '  + _id + ' published with small radius around themself', 1);

    C.publish(sub_x, sub_y, sub_radius,'Client: '  + _id + ' published with equal radius', 1);
    //C.publish(sub_x, sub_y, 1,'Client: '  + _id + ' published at center of subsciption', 1);
    //C.publish(1, 1, 1000, 'Client: '  + _id + ' published at corner with huge radius', 1)

    //setTimeout(publishMessage, pub_refresh_time);
}

function sendPINGs(){
    console.log('I am pinging');

    console.log('sending ping to entire region');
    C.sendPING(500, 500, 2000, 1);
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


