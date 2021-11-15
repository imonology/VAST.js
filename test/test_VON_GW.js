// flags
var AUTOMATIC_LEAVE_PERIOD = 3;     // number of seconds 
require('dotenv').config()

require('../lib/common.js');

// do not show debug
LOG.setLevel(3);

// set default IP/port
var gateway_addr = {host: VAST.Settings.IP_gateway, port: VAST.Settings.port_gateway};
var is_client = false;

// IP/port
if (process.argv[2]) {
	var addr = UTIL.parseAddress(process.argv[2]);

	// if this is IP + port
	if (addr.host === '')
		addr.host = VAST.Settings.IP_gateway;
	else
		is_client = true;
		
	gateway_addr = addr;
}

LOG.debug('GW ip: ' + gateway_addr.host + ' port: ' + gateway_addr.port);
LOG.debug('is_client: ' + is_client);

var peer = new VON.peer();
// var aoi  = new VAST.area(new VAST.pos(x, y), 100);

var interval_id = undefined;

// after init the peer will bind to a local port
peer.init((is_client ? VAST.ID_UNASSIGNED : VAST.ID_GATEWAY), gateway_addr.port, function () {

    peer.join(gateway_addr, aoi, 

        // done callback
        function (id) {
            LOG.warn('joined successfully! id: ' + id + '\n');
            
            // try to move around once in a while...  (if not gateway)        
            if (id !== VAST.ID_GATEWAY) {
                interval_id = setInterval(function(){ moveAround() }, 1000); 
            }        
        }
    );
});

// var moveAround = function () {    
//     var neighbor_size = Object.keys(peer.list()).length;
//     console.log('move around to ' + aoi.center.toString() + ' neighbor size: ' + neighbor_size);    
//     peer.move(aoi);
// }
