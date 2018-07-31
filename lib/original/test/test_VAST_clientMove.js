/*
    Client movement test for VAST_client.js


    history:
        2018.04.10  init
*/

//flags
var AUTOMATIC_LEAVE_PERIOD = 3;

require('../../common');

//set default IP/port
var gateway_addr = {host: VAST.Settings.IP_gateway, port: VAST.Settings.port_gateway};
var is_client = false;

//IP/port
if (process.argv[4] !== undefined) {
    var ip_port = process.argv[2];
    //check if this is port only
    var idx = ip_port.search(':');

    //if ':' not found, port only
    if (idx === (-1))
        gateway_addr.port = parseInt(ip_port);
    else {
        var ip = ip_port.slice(0,idx);
        var port = ip_port.slice(idx+1, ip_port.length);
        gateway_addr.host = ip;
        gateway_addr.port = port;

        //NOTE: This is where the distinction between gateway and client happens
        is_client = true;
    }

    var x = process.argv[3];
    var y = process.argv[4];
} else {
    var x = process.argv[2];
    var y = process.argv[3];
}

LOG.debug('GW ip: ' + gateway_addr.host + ' port: ' + gateway_addr.port);
LOG.debug('is_client: ' + is_client);

//create a GW or a connecting client;
LOG.info('Before client init');

LOG.info('After client init');
var aoi = new VAST.area(new VAST.pos(x,y),100);
//LOG.info('client ID: ' + client.getSelf().id + ' VAST gateway ID: '+VAST.ID_GATEWAY);

var moveAround = function () {
    //move if not a GW
    //LOG.info('client ID: ' + client.getSelf().id + ' VAST gateway ID: '+VAST.ID_GATEWAY);
    if (client.getSelf().id !== VAST.ID_GATEWAY) {
        //random walk new location (100 units within current center position)
        aoi.center.x = parseInt(aoi.center.x) + Math.floor((Math.random()*200)-100);
        aoi.center.y = parseInt(aoi.center.y) + Math.floor((Math.random()*200)-100);

        var neighbor_size = Object.keys(client.list()).length;
        LOG.debug('move around to ' + aoi.center.toString() + ' neighbor size: ' + neighbor_size);
        client.move(aoi);
    }
}

//join to myself as the GW
var interval_id = undefined;

//after init the client will bind to a local port
LOG.info('Client: '+is_client);
client.init((is_client ? VAST.ID_UNASSIGNED : VAST.ID_GATEWAY), gateway_addr.port, function() {
    LOG.warn('test_VAST_clientMove: init done');

    client.join(gateway_addr, aoi,
        function(id) {
            LOG.warn('VAST client joined successfully! id: ' + id + '\n');

            // try to move around once in a while...  (if not gateway)
            if (id !== VAST.ID_GATEWAY) {
                interval_id = setInterval(function(){ moveAround() }, 5000);
            }
        }
    )
})
