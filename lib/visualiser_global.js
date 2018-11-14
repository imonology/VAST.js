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

    var drift = [];

    var steps = {};

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
            neighbours = data[1];
            var id = data[2];
            if (typeof _onClient === 'function'){
                _onClient(client, neighbours, id);
            }
        });

        socket.on("voro", function(data) {
            console.log(data);
            sites = data[0];
            console.log("Sites");
            console.log(sites);
            neighbours = data[1];
            console.log(neighbours);
            var id = data[2];
            if (typeof _onConnect === 'function'){
                _onConnect(sites, neighbours, id);
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
            socket.emit('load_data', filename, function(steps) {
                console.log(steps);
                getResults(steps);
            })
        }
    }

    var getResults = function(data) {
        console.log("Analysing drift percentage...");
        var totalChecks = 0;
        var correctChecks = 0;
        var correctOtherChecks = 0;
        var mean = [];
        var drift_mean = 0;

        var diagram = undefined;

        steps = data;

        // step through time step
        console.log(Object.keys(steps).length);
        for (var i = 1; i < Object.keys(steps).length; i++) {

            for (var clientKey in steps[i]) {

                for (var neighKey in steps[i][clientKey].neighbours) {

                    totalChecks++;
                    if ((steps[i][clientKey].neighbours[neighKey].x == steps[i][neighKey].position.x) && (steps[i][clientKey].neighbours[neighKey].y == steps[i][neighKey].position.y)) {
                        correctChecks++;
                    }

                    // log drift distances
                    drift.push({x:steps[i][clientKey].neighbours[neighKey].x-steps[i][neighKey].position.x,y:steps[i][clientKey].neighbours[neighKey].y-steps[i][neighKey].position.y});

                    // calculate mean drift distance so far
                    if (!(i == 1 && clientKey == 1 && neighKey == 1)) {
                        mean.push(Math.sqrt( Math.pow(drift.slice(-1).pop().x,2) + Math.pow(drift.slice(-1).pop().y,2) ) );
                    } else {
                        mean.push(Math.sqrt( Math.pow(drift.slice(-1).pop().x,2) + Math.pow(drift.slice(-1).pop().y,2) ));
                    }

                    if (steps[i-1] != undefined){
                        if ((steps[i][clientKey].neighbours[neighKey].x == steps[i-1][neighKey].position.x)
                        && (steps[i][clientKey].neighbours[neighKey].y == steps[i-1][neighKey].position.y)
                        && ((steps[i-1][neighKey].position.x != steps[i][neighKey].position.x)
                        || (steps[i-1][neighKey].position.y != steps[i][neighKey].position.y))) {
                            correctOtherChecks++;
                        }
                    }

                }

            }


        }

        console.log(mean.length);
        console.log(Object.keys(mean).length);

        var length = Object.keys(mean).length;

        for (var j = 0; j < length; j++) {
            drift_mean += mean[j];
        }
        drift_mean = drift_mean/length;

        var standard_deviation = 0;
        for (var k = 0; k < length; k++) {
            standard_deviation += Math.pow(mean[k]-drift_mean,2);
        }
        standard_deviation = Math.sqrt(standard_deviation/length);

        console.log("Total checks: "+totalChecks);
        console.log("Correct checks: "+correctChecks);
        console.log("Correct other checks: "+correctOtherChecks);
        console.log("Addition of the two: "+(correctChecks+correctOtherChecks));
        console.log("Drift percentage: "+(correctChecks/totalChecks)*100);
        console.log("Drift distance: "+ drift_mean);
        console.log("Standard deviation of drift: "+standard_deviation);

        console.log("Analysing consistency");

        totalChecks = 0;
        correctChecks = 0;

        // run through reconstruction of voronoi to determine correct neighbours
        voronoi.set_bounding_box(bbox);

        for (var i = 1; i < Object.keys(steps).length; i++) {
            for (var clientKey in steps[i]){
                if (i == 1){
                    console.log(steps[i]);
                    voronoi.insert(clientKey, {x:steps[i][clientKey].position.x, y:steps[i][clientKey].position.y});
                } else {
                    voronoi.update(clientKey, {x:steps[i][clientKey].position.x, y:steps[i][clientKey].position.y});
                }
            }

            diagram = voronoi.get_result();

            for (clientKey in steps[i]) {
                neighbours = voronoi.get_en(clientKey);
                for (var voroID in neighbours) {
                    totalChecks++;
                    for (var neighbourID in steps[i][clientKey].neighbours){
                        if (neighbourID == neighbours[voroID]) {
                            correctChecks++;
                        }
                    }
                }
            }
        }

        console.log("Total checks: "+totalChecks);
        console.log("Correct checks: "+correctChecks);
        console.log("Consistency percentage: "+(correctChecks/totalChecks)*100);
    }
}
