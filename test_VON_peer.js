/*
    unit test for VON_peer

    2012.07.10
*/

/*
process.on('uncaughtException', function(err) {
  console.log(err);
});
*/

// flags
var AUTOMATIC_LEAVE_PERIOD = 3;     // number of seconds 

require('./common');

//var curr = new Date();
//LOG.debug(curr.toLocaleString());

// do not show debug
//LOG.setLevel(2);

// set default IP/port
var ip_port = {host: "127.0.0.1", port: 37700};

var port = process.argv[2];
if (port !== undefined)
    ip_port.port = port;

var host = process.argv[3];
var is_client = false;
if (host !== undefined) {
    ip_port.host = host;
    is_client = true;
}

LOG.debug('host: ' + ip_port.host + ' port: ' + ip_port.port + ' is_client: ' + is_client);

var x = Math.floor(Math.random() * 100);
var y = Math.floor(Math.random() * 100);

// create GW or a connecting client;
var peer = new VON.peer((is_client ? VAST_ID_UNASSIGNED : VAST_ID_GATEWAY), ip_port.port);
var aoi  = new VAST.area(new VAST.pos(x, y), 100);
        
var moveAround = function () {
     
    // move if not GW
    if (peer.getSelf().id !== VAST_ID_GATEWAY) {
        // random walk new location (5 units within current center position)
        aoi.center.x += Math.floor((Math.random()%10 - 5));
        aoi.center.y += Math.floor((Math.random()%10 - 5));
    }
    
    var neighbor_size = Object.keys(peer.list()).length;
    console.log('move around to ' + aoi.center.toString() + ' neighbor size: ' + neighbor_size);    
    peer.move(aoi);
}

// join to myself as the gateway
// NOTE: interesting idea to always be able to "join self" (i.e., everyone is a gateway)
var interval_id = undefined;

peer.join(ip_port, aoi, 

    // done callback
    function (id) {
        LOG.warn('joined successfully! id: ' + id + '\n');
        
        // try to move around once in a while...  (if not gateway)        
        if (id !== VAST_ID_GATEWAY) {
            interval_id = setInterval(function(){ moveAround() }, 1000); 
        }        
    }
);
