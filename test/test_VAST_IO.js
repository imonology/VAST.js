
// Test various inputs and outputs to the VAST Lib


require('../lib/common');

LOG.setLevel(3);

// // capture variables
// LOG.info("Capturing variables")
// var is_Client = JSON.parse(process.argv[2]);
// var host = process.argv[3];
// var port = process.argv[4];
// var radius = process.argv[5];
// var local_IP = process.argv[6];
// //var x = parseInt(process.argv[7]);
// //var y = parseInt(process.argv[8]);
// var entryServers = parseInt(process.argv[9]);
// var clientThreshold = parseInt(process.argv[10]);
// var subThreshold = parseInt(process.argv[11]);
// LOG.debug("Done capturing variables");

// // node test_VAST_client.js false 10.110.117.14 37700 100 10.110.117.14 300 300 1 70 80
// var vast = new VAST.client(is_Client, host, port, radius, local_IP, undefined, undefined, entryServers, clientThreshold, subThreshold);


//Create gateway node

// set default IP/port
var gateway_addr = {host: VAST.Settings.IP_gateway, port: VAST.Settings.port_gateway};
var is_client = false;

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

// create GW or a connecting client;
var peer = new VON.peer();
// peer.debug(false);
var aoi  = new VAST.area(new VAST.pos(x, y), 10)

var x = Math.floor(Math.random() * 100);
var y = Math.floor(Math.random() * 100);

LOG.debug('x is: '+ x + 'and y is: ' + y)

// after init the peer will bind to a local port
peer.init((is_client ? VAST.ID_UNASSIGNED : VAST.ID_GATEWAY), gateway_addr.port, function () {

    peer.join(gateway_addr, aoi,

        // done callback
        function (id) {
            LOG.warn('joined successfully! id: ' + id + '\n');

            // // try to move around once in a while...  (if not gateway)
            // if (id !== VAST.ID_GATEWAY && move) {
            //     interval_id = setInterval(function(){ moveAround() }, 1000);
            // }
        }
    );
});


// new client

// IP/port



// JOIN 



// LEAVE