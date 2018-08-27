/*
*       Visualiser.js
*
*       Visualiser for the VAST gateway and client
*
*/

// enumation of VON message
var VON_Message = {
    VON_BYE:        0, // VON's disconnect
    VON_PING:       1, // VON's ping, to check if a connected neighbor is still alive
    VON_QUERY:      2, // VON's query, to find an acceptor to a given point
    VON_JOIN:       3, // VON's join, to learn of initial neighbors
    VON_NODE:       4, // VON's notification of new nodes
    VON_HELLO:      5, // VON's hello, to allow a newly learned node to be mutually aware
    VON_HELLO_R:    6, // VON's hello response
    VON_EN:         7, // VON's enclosing neighbor inquiry (to see if my knowledge of EN is complete)
    VON_MOVE:       8, // VON's move, to notify AOI neighbors of new/current position
    VON_MOVE_F:     9, // VON's move, full notification on AOI
    VON_MOVE_B:    10, // VON's move for boundary neighbors
    VON_MOVE_FB:   11  // VON's move for boundary neighbors with full notification on AOI
};

var l_pack = function(type, msg, priority, sender) {
    // the message type
    this.type = type;

    // the message content
    this.msg = msg;

    // default priority is 1
    this.priority = (priority === undefined ? 1 : priority);

    // target is a list of node IDs
    this.targets = [];

    // sender id
    this.src = sender || 0;
}

var VON_Message_String = [
    'VON_BYE',
    'VON_PING',
    'VON_QUERY',
    'VON_JOIN',
    'VON_NODE',
    'VON_HELLO',
    'VON_HELLO_R',
    'VON_EN',
    'VON_MOVE',
    'VON_MOVE_F',
    'VON_MOVE_B',
    'VON_MOVE_FB'
];

function Visualiser(){
    console.log('Visualiser called');

    var _msg_handler = undefined;

    var socket = undefined;

    var sites = undefined;

    var _onDone = undefined;

    var _onID = undefined;

    var _id = undefined;

    // send request for the sites
    this.init = function(port, onDone) {
        socket = io('http://127.0.0.1:'+port);

        //ask for voronoi object
        socket.emit('voro', "Give the voronoi diagram please");
        _onDone = onDone;

        // connection acknowledgement
        socket.on("connected", function(data) {
            console.log(data);
        });

        // receive the voronoi object from the gateway
        socket.on("voro", function(data) {
            sites = JSON.parse(data);
            if (typeof _onDone === 'function'){
                _onDone(sites);
            }
        });

        socket.on("id", function(id){
            console.log("ID:"+id);
            _id = id;

            _onID(id);

        });
    }

    this.move = function(x,y,aoi) {
        console.log('move command emitted');
        socket.emit("move", Math.floor(x/8),Math.floor(y/8),aoi);
    }

    this.get_sites = function() {
        return sites;
    }

    this.getId = function() {
        return _id;
    }

    this.set_onID = function(onID) {
        _onID = onID;
    }
}
