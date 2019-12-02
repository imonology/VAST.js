// a connecting server bridge between the clients and the global viewer

var express = require('express')();
var http = require('http').createServer(express);
var io = require('socket.io')(http, {
    pingTimeout: 120000
});

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
    'VON_MOVE_FB',
    'VON_POS'
];

var fs = require('fs');
var es = require('event-stream');

var Voronoi = require('./voronoi/vast_voro.js');

var sites = {};
var neighbours = {};

var matchers = {};
var clients = {};
var boundary = {};

var drift = [];

var steps = {};

var globalSock = undefined;

var count = -1;

var totalClients = JSON.parse(process.argv[2]);
var folder = JSON.parse(process.argv[3]);
var radius = folder;

var latMin = 0;
var latMax = 0;
var latAve = 0;
var latTotal = 0;
var latCount = 0;
var latencies = {
    'forwardTime' : {
        0:0,    // total latency
        1:0     // average latency
    },
    'processTime' : {
        // we don't initialise anything here because this tracks multiple message type's processing latency
    },
    'ping' : {
        0:0,    // total ping
        1:0     // average ping
    }
};
var bandMax = 0;
var bandMin = 0;
var bandAve = 0;
var bandTotal = 0;

var voronoi = new Voronoi();

var bbox = {xl:0,xr:1000,yt:0,yb:1000};

// the first time step that all the rest are based off of
var baseTime = 0;


io.on('connection', function(socket) {
    console.log("Connected");
    socket.on('connected', function(){
        count++;
        console.log("["+count+"] connected");
    })
    .on('voro_client', function(data) {

        if (globalSock !== undefined) {
            globalSock.emit('voro_client', data);
        } else {
            var id = data[2];
            sites[id] = data[0];
            neighbours[id] = data[1];
        }
    })
    .on("global", function() {
        console.log("Global connected");
        globalSock = socket;
        globalSock.on('disconnect', function(){
            console.log("Global socket disconnected");
            globalSock = undefined;
        });
        //console.log(sites);
        //console.log(neighbours);
        globalSock.emit('voro', sites);
    })
    .on("move", function(bool) {
        io.emit("move", true);
    })
    .on('load_data', function(filename,onDone) {

        _loadData(1, onDone);
    })
    .on("matcher", function(data) {
        if (globalSock !== undefined) {
            globalSock.emit('matcher', data);
        } else {
            var id = data.id;
            matchers[id] = data.matchers;
            clients[id] = data.clients;
            boundary[id] = data.boundary;
        }
    }).on("matcher_leave", function(id) {
        if (globalSock !== undefined) {
            globalSock.emit('matcher_leave', id);
        } else {
            delete clients[id];
        }
    });
});

var _loadData = function(i, onDone) {
    console.log("start reading lines for "+i);

    // the line number of the file
    var lineNr = 0;

    // the time bracket number
    var timeStep = 0;

    if (fs.existsSync('../../../Results/' + folder + '/'+i+'.txt')) {
        var stream = fs.createReadStream('../../../Results/'+folder+'/'+i+'.txt')
            .pipe(es.split())
            .pipe(es.mapSync(function(line) {
                    stream.pause();

                    lineNr++;


                    if (line != ""){

                        /*
                        console.log(line);
                        console.log(line[0]);
                        console.log(line[0 + 1] << 8);
                        console.log(line[0 + 2] << 16);
                        console.log(line[0 + 3] << 24);
                        const size =
                            line[0] |
                            (line[0 + 1] << 8) |
                            (line[0 + 2] << 16) |
                            (line[0 + 3] << 24);

                        console.log(size);
                        console.log(line);
                        var buf = new Buffer(line);
                        console.log(buf)
                        */


                        var cont = true;
                        try {
                            var clientState = JSON.parse(line);
                            /*
                            console.log("deserial");
                            var deserial = bson.deserialize(buf);
                            console.log(deserial);

                            var reconstruct = "";
                            for (var keys in deserial){
                                reconstruct += deserial[keys];
                            }

                            console.log(reconstruct);
                            var clientState = JSON.parse(reconstruct);
                            console.log(clientState);
                            */
                        } catch (e) {
                            console.log("Error parsing line, moving on to the next line");
                            cont = false;
                        }

                        if (cont) {

                            if (lineNr == 1 && i == 1) {
                                baseTime = clientState.time;
                            }

                            var time = clientState.time;

                            timeStep = Math.floor((time-baseTime)/500);

                            if (steps[timeStep] == undefined) {
                                console.log("New timestep "+ timeStep);
                                steps[timeStep] = {};
                            }

                            steps[timeStep][clientState.id] = clientState;
                        }

                    }

                    stream.resume();
            })
            .on('error', function(err){
                console.log('Error while reading file.', err);
            })
            .on('end', function(){
                console.log('Read entire file.');
                if (i < totalClients) {
                    i++;
                    _loadData(i, onDone);
                } else
                {
                    _analyseData(steps, onDone);
                }
            }));
    } else {
        console.log('Error while reading file: file "' + i + '.txt" does not exist');
        if (i < totalClients) {
            i++;
            _loadData(i, onDone);
        } else
        {
            _analyseData(steps, onDone);
        }
    }
}

// calculate latency values from incoming packet for recording purposes
var _calcLatency = function (state) {
    // calculate maximum latency
    latMax = (state.latMax > latMax) ? state.latMax : latMax;

    // calculate minimum latency
    if (state.latMin >= 0) {
        latMin = (state.latMin < latMin) ? state.latMin : (latMin == 0) ? state.latMin : latMin;
        }

    // calculate total latency for standard deviation
    latTotal += state.latAve;
    latCount++;

    // calculate average latency
    latAve =  latTotal/latCount;

    // forwarding latency
    latencies['forwardTime'][0] += state.latencies['forwardTime'][1];
    latencies['forwardTime'][1] = latencies['forwardTime'][0]/latCount;

    for (var keys in state.latencies['processTime']) {
        // processing specific pack's latency
        if (latencies['processTime'][keys] == undefined) {
            latencies['processTime'][keys] = {
                0:0,    // total latency for average calculation
                1:0,    // total count of this packet
                2:0     // average latency
            }
        }
        latencies['processTime'][keys][0] += state.latencies['processTime'][keys][0];
        latencies['processTime'][keys][1] += state.latencies['processTime'][keys][1];
        latencies['processTime'][keys][2] = latencies['processTime'][keys][0]/latencies['processTime'][keys][1];
    }

    latencies['ping'][0] += state.latencies['ping'][2];
    latencies['ping'][1] = latencies['ping'][0]/latCount;
}

// calculate bandwidth values from incoming packet for recording purposes
var _calcBandwidth = function (state) {
    // calculate maximum bandwidth
    bandMax = (state.bandwidth > bandMax) ? state.bandwidth : bandMax;

    // calculate minimum bandwidth
    bandMin = (state.bandwidth < bandMin) ? state.bandwidth : (bandMin == 0) ? state.bandwidth : bandMin;

    // calculate total bandwidth for standard deviation
    bandTotal += state.bandwidth;

    // calculate average bandwidth
    bandAve = (bandAve + state.bandwidth) / 2;
}

var _analyseData = function(steps, onDone) {
    console.log("\nAnalysing drift distance...");
    var mean = [];
    var driftMean = 0;
    var results = [];

    var neighbourTotal = 0;
    var neighbourCount = 0;

    var diagram = undefined;

    // step through time step
    console.log("Number of steps: " + Object.keys(steps).length);
    for (var i = 1; i < Object.keys(steps).length; i++) {

        for (var clientKey in steps[i]) {

            neighbourCount++;

            for (var neighKey in steps[i][clientKey].neighbours) {
                neighbourTotal++;

                if (!steps[i].hasOwnProperty(neighKey))
                    continue;

                // log drift distances
                drift.push({x:steps[i][clientKey].neighbours[neighKey].x-steps[i][neighKey].position.x,y:steps[i][clientKey].neighbours[neighKey].y-steps[i][neighKey].position.y});

                // calculate mean drift distance so far
                if (!(i == 1 && clientKey == 1 && neighKey == 1)) {
                    var mean_check = Math.sqrt( Math.pow(drift.slice(-1).pop().x,2) + Math.pow(drift.slice(-1).pop().y,2) );
                    mean.push(mean_check);
                } else {
                    mean.push(Math.sqrt( Math.pow(drift.slice(-1).pop().x,2) + Math.pow(drift.slice(-1).pop().y,2) ));
                }

            }

            //decrease by one because it counts itself as a neighbour
            neighbourTotal--;

            _calcLatency(steps[i][clientKey]);

            _calcBandwidth(steps[i][clientKey]);

        }


    }

    var neighbourAverage = neighbourTotal/neighbourCount;

    console.log("Mean data points: " + mean.length);
    console.log("Average neighbour per client: " + (neighbourAverage-1));

    var length = Object.keys(mean).length;

    for (var j = 0; j < length; j++) {
        driftMean += mean[j];
    }
    driftMean = driftMean/length;

    var standardDeviation = 0;
    for (var k = 0; k < length; k++) {
        standardDeviation += Math.pow(mean[k]-driftMean,2);
    }
    standardDeviation = Math.sqrt(standardDeviation/length);

    results.push(driftMean);
    results.push(standardDeviation)

    console.log("Analysing consistency");

    var clientConsistency = {};
    var consistency = 0;
    var totalChecks = 0;
    var correctChecks = 0;
    var total = 0;

    // run through reconstruction of voronoi to determine correct neighbours
    voronoi.set_bounding_box(bbox);

    for (var i = 1; i < Object.keys(steps).length; i++) {
        for (var clientKey in steps[i]){
            if (i == 1){
                voronoi.insert(clientKey, {x:steps[i][clientKey].position.x, y:steps[i][clientKey].position.y});
            } else {
                voronoi.update(clientKey, {x:steps[i][clientKey].position.x, y:steps[i][clientKey].position.y});
            }
        }

        diagram = voronoi.get_result();

        for (clientKey in steps[i]) {
            neighbours = voronoi.get_neighbour(clientKey,radius);
            total++;
            var clientTotal = 0;
            var clientCorrect = 0;
            for (var voroID in neighbours) {
                totalChecks++;
                clientTotal++;
                for (var neighbourID in steps[i][clientKey].neighbours){
                    if (neighbourID == neighbours[voroID]) {
                        correctChecks++;
                        clientCorrect++;
                    }
                }
            }
            if (clientConsistency[i] == undefined)
                clientConsistency[i] = {};

            clientConsistency[i][clientKey] = (clientCorrect/clientTotal)*100;
        }
    }

    //console.log("Total checks: "+totalChecks);
    //console.log("Correct checks: "+correctChecks);
    consistency = (correctChecks/totalChecks)*100;

    results.push(consistency);

    // determine standard deviation of consistency
    standardDeviation = 0;
    for (var i = 1; i < Object.keys(steps).length; i++) {
        for (var keys in clientConsistency[i]) {
            if (isNaN(clientConsistency[i][keys]))
                continue;
            standardDeviation += Math.pow(clientConsistency[i][keys]-consistency,2);
        }
    }

    standardDeviation = Math.sqrt(standardDeviation/total);
    results.push(standardDeviation);

    console.log("Analysing latency...");

    standardDeviation = Math.sqrt(latTotal/length);

    results.push(latMin);
    results.push(latMax);
    results.push(latAve);
    results.push(latencies["forwardTime"][1]);
    for (i = 0; i <= 12; i++) {
        if (latencies['processTime'].hasOwnProperty(i)) {
            results.push(latencies['processTime'][i][2])
        } else {
            // add empty result to represent no data for packet
            results.push(0);
        }
    }

    results.push(standardDeviation);
    results.push(latencies['ping'][1]);

    console.log("Analysing bandwidth...");

    standardDeviation = Math.sqrt(bandTotal/length);

    results.push(bandAve);
    results.push(bandMax);
    results.push(bandMin);
    results.push(standardDeviation);

    console.log("Drift distance: "+ results[0]);
    console.log("Standard deviation of drift: "+ results[1]);
    console.log("Consistency percentage: "+results[2]);
    console.log("Standard deviation of consistency: "+ results[3]);

    console.log("Average latency: " + results[6]);
    //console.log("Maximum latency: " + results[5]);
    //console.log("Minimum latency: " + results[4]);
    console.log("Standard deviation for latency: " + results[21]);
    console.log("Ping: " + results[22]);
    //console.log("Forwarding time: " + results[7]);
    console.log("Processing time:");
    //console.log(VON_Message_String[0] + ": " + results[8]);
    //console.log(VON_Message_String[1] + ": " + results[9]);
    console.log(VON_Message_String[2] + ": " + results[10]);
    console.log(VON_Message_String[3] + ": " + results[11]);
    //console.log(VON_Message_String[4] + ": " + results[12]);
    //console.log(VON_Message_String[5] + ": " + results[13]);
    //console.log(VON_Message_String[6] + ": " + results[14]);
    //console.log(VON_Message_String[7] + ": " + results[15]);
    //console.log(VON_Message_String[8] + ": " + results[16]);
    //console.log(VON_Message_String[9] + ": " + results[17]);
    //console.log(VON_Message_String[10] + ": " + results[18]);
    //console.log(VON_Message_String[11] + ": " + results[19]);
    //console.log(VON_Message_String[12] + ": " + results[20]);

    console.log("Bandwidth usage in kbps: " + results[23]);
    //console.log("Maximum bandwidth: " + results[24]);
    //console.log("Minimum bandwidth: " + results[25]);
    console.log("Standard deviation for bandwidth: " + results[26]);

    onDone(results);
}

http.listen(7777, function(){
    console.log(http.address());
});

/*
_loadData(1, function(data) {
    console.log("Done");
    process.exit(0);
})
*/
