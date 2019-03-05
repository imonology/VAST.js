
/*
    test for many VON_peer

    2012.08.28 init
*/

// flags
require('../lib/common.js');
var cluster_model = require('../lib/move_cluster.js');
var fs = require('fs')
    , es = require('event-stream');

// set error level
LOG.setLevel(1);

// boundary of the test dimensions
var bound = {x: 1000, y: 1000};
var tick_interval   = 500;
var node_speed      = 5;
var node_radius     = 100;

// 2D array for movement points
var movement = {};

var moveCount = 0;

// set default IP/port
var gateway_addr = {host: VAST.Settings.IP_gateway, port: VAST.Settings.port_gateway};

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
var node_size = JSON.parse(process.argv[3]) || 10;
var create_gateway = process.argv[4] || true;
create_gateway = JSON.parse(create_gateway);

// a VON node unit
var VONnode = function (num, GWaddr, radius) {
    var isClient = true;
    if (num == 1 && create_gateway) {
        console.log("Gateway created");
        var isClient = false;
    }
    console.log(num);
    var port = GWaddr.port;

    var tick_id = undefined;

    var pos = movement[num-1][0].split(',');

    // create GW or a connecting client;
    var peer = new VON.peer();
    peer.debug(false);
    var aoi  = new VAST.area(new VAST.pos(Math.floor(pos[0]), Math.floor(pos[1])), radius);

    // perform movement
    var moveNode = function (peer) {

        try {
            var new_pos = movement[num-1][moveCount].split(',');
        } catch (e) {
            tick_id = undefined;
            return false;
        }
        if (typeof new_pos[0] == 'undefined' || typeof new_pos[1] == 'undefined') {
            console.log("Stopping movement tick");
            tick_id = undefined;
            return false;
        }

        aoi.center.x = Math.floor(new_pos[0]);
        aoi.center.y = Math.floor(new_pos[1]);

        LOG.debug('node num: ' + num + ' moves to ' + aoi.center);
        peer.move(aoi);
    }

    var moveGW = function (peer) {
        var new_pos = movement[num-1][0].split(',');

        aoi.center.x = Math.floor(new_pos[0]);
        aoi.center.y = Math.floor(new_pos[1]);

        LOG.debug('node num: ' + num + ' moves to ' + aoi.center);
        peer.move(aoi);
    }

    peer.init((isClient ? VAST.ID_UNASSIGNED : VAST.ID_GATEWAY), port, function () {

        peer.join(GWaddr, aoi,

            // done callback
            function (id) {
                LOG.warn('joined successfully! id: ' + id + '\n');


                if (id !== VAST.ID_GATEWAY){
                    tick_id = setInterval(function(){moveNode(peer)}, tick_interval);
                } else {
                    console.log("Gateway move has started");
                    setInterval(function(){moveGW(peer)}, tick_interval);
                }
            },

            function (id) {
                if (id !== VAST.ID_GATEWAY){
                    tick_id = setInterval(function(){moveNode(peer)}, tick_interval);
                } else {
                    console.log("Gateway move has started");
                    setInterval(function(){moveGW(peer)}, tick_interval);
                }
            }
        );
    });
}

var nodes_created = 0;

// records of all nodes created so far
var nodes = [];

// read movement from a textfile
var getLines = function (filename, node_size) {
    var tempHolder;

    var lineNr = 0;

    console.log("start reading lines");

    var stream = fs.createReadStream(filename)
        .pipe(es.split())
        .pipe(es.mapSync(function(line) {
                stream.pause();

                lineNr++;

                tempHolder = line.split(":");
                movement[tempHolder[0]] = tempHolder[1].split(";");

                if (lineNr == node_size) {
                    console.log("file reading complete");
                    stream.end();

                    LOG.debug('creating ' + node_size + ' nodes @ host: ' + gateway_addr.host + ' port: ' + gateway_addr.port);
                    createNode();
                }

                stream.resume();
            })
            .on('error', function(err){
                console.log('Error while reading file.', err);
            })
            .on('end', function(){
                console.log('Read entire file.')
            })
        );
}

// initialize movement model
getLines("MovementPoints.txt", node_size);

// create nodes
var createNode = function () {

    nodes_created++;
    LOG.debug('creating node [' + nodes_created + ']');

    var node = new VONnode(nodes_created, gateway_addr, node_radius);

    nodes.push(node);

    // see if we want to create more
    if (nodes_created < node_size)
        setTimeout(createNode, tick_interval);
}

var incMoveCount = function() {
    moveCount++;
}


setInterval(incMoveCount, tick_interval);
