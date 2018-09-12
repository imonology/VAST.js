/*
*       Visualiser.js
*
*       Visualiser for the VAST gateway and client
*
*/

function Visualiser(){
    console.log('Visualiser called');

    var socket = undefined;

    var sites = undefined;

    var neighbours = undefined;

    var _onDone = undefined;

    var _onMessage = undefined;

    var _onID = undefined;

    var _id = undefined;

    // send request for the sites
    this.init = function(port, onDone, onMessage, onBuffer) {
        socket = io('http://127.0.0.1:'+port);

        //ask for voronoi object
        socket.emit('voro', "Give the voronoi diagram please");
        _onDone = onDone;
        _onMessage = onMessage;

        // connection acknowledgement
        socket.on("connected", function(data) {
            console.log(data);
        });

        // receive the voronoi object from the gateway
        socket.on("voro", function(data) {
            sites = JSON.parse(data[0]);
            neighbours = JSON.parse(data[1]);
            if (typeof _onDone === 'function'){
                _onDone(sites, neighbours);
            }
        });

        // handle an incoming message
        socket.on("Message", function(data, callback){
            var msgArray = JSON.parse(data);

            for (var i = 0; i< msgArray.length; i++ ) {
                _onMessage(msgArray[i].type, msgArray[i]);
            }
            //callback();
        });

        // receive message buffer information
        socket.on("empty", function(data){
            onBuffer(data);
        });

        // receive the client ID
        socket.on("ID", function(id){
            console.log("ID received:"+id);
            _id = id;

            _onID(id);

        });
    }

    this.move = function(x,y,aoi) {
        console.log('move command emitted');
        socket.emit("move", Math.floor(x/8),Math.floor(y/8),aoi);
    }

    this.next = function(bool) {
        console.log("Move on to next command");
        socket.emit("next", bool);
    }

    this.get_messages = function() {
        socket.emit("messages", function(data){
            return data;
        });
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
