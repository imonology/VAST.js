/*
*       visualiser_global.js
*
*       Global visualiser for the VAST gateway and client
*
*/


function VisualiserGlobal(){
    console.log('Global visualiser called');

    var socket = undefined;

    var sites = [];

    var neighbours = [];

    var reconstructedSteps = {};

    var client = undefined;

    var _onClient = undefined;

    var _onConnect = undefined;

    var _onID = undefined;

    var _id = undefined;

    var file = "";

    var voronoi = new VAST_Voronoi();

    var bbox = {xl:0,xr:1000,yt:0,yb:1000};

    // send request for the sites
    this.init = function(onClient, onConnect) {
        console.log("Initialise connection to server");
        // NOTE: this assumes that the global_bridge.js will be run on the same machine as the html visualiser
        // if it is on a different host then this IP will change to the IP of the computer running
        // the global_bridge.js node application
        socket = io('http://127.0.0.1:7777');

        // tell the bridge that we are the global socket
        socket.emit("global", "I am the global");

        _onClient = onClient;

        // connection acknowledgement
        socket.on("connected", function(data) {
            console.log(data);
        });

        // receive the voronoi object from the gateway
        socket.on("voro_client", function(data) {
            client = data[0];
            var id = data[1];
            if (typeof _onClient === 'function'){
                _onClient(client, id);
            }
        });

        socket.on("voro", function(data) {
            sites = data;
            console.log("Sites");
            console.log(sites);
            if (typeof _onConnect === 'function'){
                _onConnect(sites);
            }
        });

        socket.on("connect_error", function(e) {
            console.log("Visualiser has disconnected from the client");
            socket.disconnect(true);
        });
    }

    this.startReplay = function(filename) {
        console.log("Loading replay starting");
        if (filename != file) {
            file = filename;
            _loadData(filename);
        }
    }

    this.analyse = function(filename) {
        console.log("Analysing...");
        if (filename != file) {
            file = filename;
            _loadData(filename);
        }
    }

    this.move = function() {
        // IDEA: could possible send a start time
        socket.emit('move', true);
    }

    // close the socket connection so that no continual messages get sent
    this.close = function() {
        if (socket != undefined) {
            console.log("Socket has been closed and shut down");
            socket.disconnect(true);
        }
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

    var _loadData = function(filename) {
        if (socket != undefined) {
            // fetch data from global visualiser
            socket.emit('load_data', filename, function(data) {
                //console.log(steps);
                getResults(data);
            })
        }
    }

    var getResults = function(data) {
        console.log("Drift percentage: "+ data[0]);
        console.log("Drift distance: "+ data[1]);
        console.log("Standard deviation of drift: "+ data[2]);
        console.log("Consistency percentage: "+data[3]);

        console.log("Minimum latency: " + data[4]);
        console.log("Maximum latency: " + data[5]);
        console.log("Average latency: " + data[6]);
        console.log("Standard deviation for latency: " + data[7]);

        console.log("Bandwidth usage in kbps: " + data[8]);
        console.log("Maximum bandwidth: " + data[9]);
        console.log("Minimum bandwidth: " + data[10]);
        console.log("Standard deviation for bandwidth: " + data[11]);
    }
}
