
// Test various inputs and outputs to the VAST Lib



require('../lib/common');

LOG.setLevel(3);

//define nodes area and radius. i.e. x,y,r

function getTuple(){
    return A = [50,100,5],
    B = [100,50,8],
    C=[150,150,25],
    D=[200,50,15],
    E=[100,200,10]
    ;

 }
 var [x, y, r] = getTuple();

 console.log('All nodes generated are: \n', A, B, C, D, E);
//  console.log(A[0]);

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

// // create GW or a connecting client;
var peer = new VON.peer();
// // peer.debug(false);
var aoi  = new VAST.area(new VAST.pos(A[0], A[1]), A[2])


// var aoi  = new VAST.area(new VAST.pos(x, y), 10)
// var x = Math.floor(Math.random() * 100);
// var y = Math.floor(Math.random() * 100);

// LOG.debug('x is: '+ x + 'and y is: ' + y)

// // after init the peer will bind to a local port
// peer.init((is_client ? VAST.ID_UNASSIGNED : VAST.ID_GATEWAY), gateway_addr.port, function () {

//     peer.join(gateway_addr, aoi,

//         // done callback
//         function (id) {
//             LOG.warn('joined successfully! id: ' + id + '\n');

//             // // try to move around once in a while...  (if not gateway)
//             // if (id !== VAST.ID_GATEWAY && move) {
//             //     interval_id = setInterval(function(){ moveAround() }, 1000);
//             // }
//         }
//     );
// });


// new client

// IP/port



// JOIN 



// LEAVE