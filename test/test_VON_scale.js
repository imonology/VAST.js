
/*
    test for many VON_peer

    2012.08.28 init
*/

// flags
require('../VAST');
var cluster_model = require('../move_cluster');

// set error level
LOG.setLevel(2);

// boundary of the test dimensions
var bound = {x: 800, y: 600};
var tick_interval   = 500;
var node_speed      = 5;
var node_radius     = 200;

// set default IP/port
var gateway_addr = {host: "127.0.0.1", port: 37700};

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
    }
}

LOG.debug('GW ip: ' + gateway_addr.host + ' port: ' + gateway_addr.port);
    
    
// nodes to create
var node_size = process.argv[3] || 10;

// initialize movement model
var movement = new cluster_model({x:0, y:0}, bound, node_size, node_speed);
movement.init();

// a VON node unit 
var VONnode = function (num, GWaddr, radius) {

    var port = GWaddr.port + num;
    
    var pos = movement.getpos(num-1);

    // create GW or a connecting client;
    var peer = new VON.peer();
    var aoi  = new VAST.area(new VAST.pos(Math.floor(pos.x), Math.floor(pos.y)), radius);
                
    // perform movement
    var moveNode = function () {
        
        var new_pos = movement.getpos(num-1);
        aoi.center.x = Math.floor(new_pos.x);
        aoi.center.y = Math.floor(new_pos.y);
        
        LOG.debug('node num: ' + num + ' moves to ' + aoi.center);
        peer.move(aoi);
    }
        
    peer.init(VAST_ID_UNASSIGNED, port, function () {
    
        peer.join(GWaddr, aoi,
    
            // done callback
            function (id) {
                LOG.warn('joined successfully! id: ' + id + '\n');
                
                if (id !== VAST_ID_GATEWAY)
                    setInterval(moveNode, tick_interval);
            }
        );    
    });    
}

var nodes_created = 0;

// records of all nodes created so far
var nodes = [];

// create nodes
var createNode = function () {

    nodes_created++;
    LOG.debug('creating node [' + nodes_created + ']');
            
    var pos = movement.getpos(nodes_created-1);
    var node = new VONnode(nodes_created, gateway_addr, node_radius);
    
    nodes.push(node);
    
    // see if we want to create more
    if (nodes_created < node_size)
        setTimeout(createNode, 1000);
}

LOG.debug('creating ' + node_size + ' nodes @ host: ' + gateway_addr.host + ' port: ' + gateway_addr.port);

// create first node
createNode();

// keep moving
setInterval(function () {
    movement.move();
}, tick_interval);

