/*
    unit test for VON_peer

    2012.07.10
*/


// flags
var AUTOMATIC_LEAVE_PERIOD = 3;     // number of seconds 

require('../VAST');

// do not show debug
LOG.setLevel(2);

// set default IP/port
var gateway_addr = {host: "127.0.0.1", port: 37700};
var is_client = false;

// IP/port
if (process.argv[2] !== undefined) {
    var ip_port = process.argv[2];
    // check if this is port only
    var idx = ip_port.search(':');
    
    // ':' not found, port only
    if (idx === (-1))
        gateway_addr.port = parseInt(ip_port);       
    else {
        var ip = ip_port.slice(0, idx);
        var port = ip_port.slice(idx+1, ip_port.length);
        gateway_addr.host = ip;
        gateway_addr.port = parseInt(port);        
        
        is_client = true;
    }
}

LOG.debug('GW ip: ' + gateway_addr.host + ' port: ' + gateway_addr.port);
LOG.debug('is_client: ' + is_client);

var x = Math.floor(Math.random() * 100);
var y = Math.floor(Math.random() * 100);

// create GW or a connecting client;
var peer = new VON.peer();
var aoi  = new VAST.area(new VAST.pos(x, y), 100);
        
var moveAround = function () {
     
    // move if not GW
    if (peer.getSelf().id !== VAST_ID_GATEWAY) {
        // random walk new location (5 units within current center position)
        aoi.center.x += Math.floor((Math.random()%10) - 5);
        aoi.center.y += Math.floor((Math.random()%10) - 5);
        
        if (aoi.center.x < 0)
            aoi.center.x *= -1;
        if (aoi.center.y < 0)
            aoi.center.y *= -1;
            
    }
    
    var neighbor_size = Object.keys(peer.list()).length;
    console.log('move around to ' + aoi.center.toString() + ' neighbor size: ' + neighbor_size);    
    peer.move(aoi);
}

// join to myself as the gateway
// NOTE: interesting idea to always be able to "join self" (i.e., everyone is a gateway)
var interval_id = undefined;

// after init the peer will bind to a local port
peer.init((is_client ? VAST_ID_UNASSIGNED : VAST_ID_GATEWAY), gateway_addr.port, function () {

    peer.join(gateway_addr, aoi, 

        // done callback
        function (id) {
            LOG.warn('joined successfully! id: ' + id + '\n');
            
            // try to move around once in a while...  (if not gateway)        
            if (id !== VAST_ID_GATEWAY) {
                interval_id = setInterval(function(){ moveAround() }, 1000); 
            }        
        }
    );
});

