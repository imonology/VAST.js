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

    var matchers = undefined;

    var neighbours = undefined;

    var matcherNeighbours = undefined;

    var _onDone = undefined;

    var _onMessage = undefined;

    var _onID = undefined;

    var _id = undefined;

    // send request for the sites
    this.init = function(port, onDone, onMessage, onBuffer) {
        socket = io('http://10.110.117.14:'+port);

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
            var halt = JSON.parse(data[2]);
            if (typeof _onDone === 'function'){
                _onDone(sites, neighbours, halt, 0);
            }
        });

        socket.on("voro_matcher", function(data) {
            console.log("Received voro_matcher");
            matchers = JSON.parse(data[0]);
            matcherNeighbours = JSON.parse(data[1]);
            if (typeof _onDone === 'function'){
                _onDone(sites, neighbours, false, 1);
            }
        });

        // handle an incoming message
        socket.on("Message", function(data, callback){
            var msgArray = JSON.parse(data);

            for (var i = 0; i< msgArray.length; i++ ) {
                _onMessage(msgArray[i].type, msgArray[i]);
            }
            callback();
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

        socket.on("connect_error", function(e) {
            console.log("Visualiser has disconnected from the client");
            socket.disconnect(true);
        });
    }

    this.move = function(x,y,aoi) {
        console.log('move command emitted');
        socket.emit("move", Math.floor(x),Math.floor(y),aoi);
    }

    this.next = function(bool) {
        if (bool) {
            console.log("Move on to next command");
        } else {
            console.log("Switch debug mode");
        }
        socket.emit("next", bool);
    }

    // close the socket connection so that no continual messages get sent
    this.close = function() {
        if (socket != undefined) {
            console.log("Socket has been closed and shut down");
            socket.disconnect(true);
        }
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
