// a connecting server bridge between the clients and the global viewer

var express = require('express')();
var http = require('http').createServer(express);
var io = require('socket.io')(http);

var fs = require('fs');
var es = require('event-stream');
var BSON = require('bson');

var Voronoi = require('./voronoi/vast_voro.js');

var sites = {};
var neighbours = {};

var drift = [];

var steps = {};

var globalSock = undefined;

var count = -1;

var clientTotal = JSON.parse(process.argv[2]);

var latMin = 0;
var latMax = 0;
var latAve = 0;
var latTotal = 0;
var bandMax = 0;
var bandMin = 0;
var bandAve = 0;
var bandTotal = 0;

var voronoi = new Voronoi();

var bbox = {xl:0,xr:1000,yt:0,yb:1000};

// the first time step that all the rest are based off of
var baseTime = 0;

io.on('connection', function(socket) {
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
        console.log(sites);
        console.log(neighbours);
        globalSock.emit('voro', sites);
    })
    .on("move", function(bool) {
        io.emit("move", true);
    })
    .on('load_data', function(filename,onDone) {
        // create BSON object
        var bson = new BSON();

        _loadData(1, onDone);
    })
});

var _loadData = function(i, onDone) {
    console.log("start reading lines for "+i);

    // the line number of the file
    var lineNr = 0;

    // the time bracket number
    var timeStep = 0;

    // an array to store all of the client's states for a time step
    var clientStep = [];

    if (fs.existsSync('../test/'+i+'.txt')) {
        var stream = fs.createReadStream('../test/'+i+'.txt')
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
                        var deserial = bson.deserialize(line);

                        var reconstruct = "";
                        for (var keys in deserial){
                            reconstruct += deserial[keys];
                        }

                        console.log(reconstruct);
                        var clientState = JSON.parse(reconstruct);
                        console.log(clientState);
                        */

                        var cont = true;
                        try {
                            var clientState = JSON.parse(line);
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
                if (i < clientTotal) {
                    i++;
                    _loadData(i, onDone);
                } else
                {
                    _analyseData(steps, onDone);
                }
            }));
    } else {
        console.log('Error while reading file: file "' + i + '.txt" does not exist');
        if (i < clientTotal) {
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

        // calculate total latency for standard deviation
        latTotal += state.latAve;

        // calculate average latency
        latAve =  (latAve + state.latAve) / 2;
    }
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
    console.log("Analysing drift percentage...");
    var totalChecks = 0;
    var correctChecks = 0;
    var correctOtherChecks = 0;
    var mean = [];
    var drift_mean = 0;
    var results = [];

    var diagram = undefined;

    // step through time step
    console.log("Number of steps: " + Object.keys(steps).length);
    for (var i = 1; i < Object.keys(steps).length; i++) {

        for (var clientKey in steps[i]) {

            for (var neighKey in steps[i][clientKey].neighbours) {

                totalChecks++;

                if (!steps[i].hasOwnProperty(neighKey))
                    continue;

                if ((steps[i][clientKey].neighbours[neighKey].x == steps[i][neighKey].position.x) && (steps[i][clientKey].neighbours[neighKey].y == steps[i][neighKey].position.y)) {
                    correctChecks++;
                }

                // log drift distances
                drift.push({x:steps[i][clientKey].neighbours[neighKey].x-steps[i][neighKey].position.x,y:steps[i][clientKey].neighbours[neighKey].y-steps[i][neighKey].position.y});

                // calculate mean drift distance so far
                if (!(i == 1 && clientKey == 1 && neighKey == 1)) {
                    var mean_check = Math.sqrt( Math.pow(drift.slice(-1).pop().x,2) + Math.pow(drift.slice(-1).pop().y,2) );
                    mean.push(mean_check);
                    /*
                    if (mean_check <= Math.sqrt(2) || i == 1) {
                        mean.push(mean_check);
                    }
                    else if (steps[i-1] != undefined) {
                        if (steps[i-1].hasOwnProperty(neighKey))
                            var mean_previous = Math.sqrt( Math.pow(steps[i][clientKey].neighbours[neighKey].x-steps[i-1][neighKey].position.x,2) + Math.pow(steps[i][clientKey].neighbours[neighKey].y-steps[i-1][neighKey].position.y,2) )
                    }
                    */
                } else {
                    mean.push(Math.sqrt( Math.pow(drift.slice(-1).pop().x,2) + Math.pow(drift.slice(-1).pop().y,2) ));
                }

                if (steps.hasOwnProperty(i-1) && steps[i-1].hasOwnProperty(neighKey)){
                    if ((steps[i][clientKey].neighbours[neighKey].x == steps[i-1][neighKey].position.x)
                    && (steps[i][clientKey].neighbours[neighKey].y == steps[i-1][neighKey].position.y)
                    && ((steps[i-1][neighKey].position.x != steps[i][neighKey].position.x)
                    || (steps[i-1][neighKey].position.y != steps[i][neighKey].position.y))) {
                        correctOtherChecks++;
                    }
                }

            }

            _calcLatency(steps[i][clientKey]);

            _calcBandwidth(steps[i][clientKey]);

        }


    }

    console.log("Mean data points: " + mean.length);

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

    results.push((correctChecks/totalChecks)*100);
    results.push(drift_mean);
    results.push(standard_deviation)

    console.log("Analysing consistency");

    totalChecks = 0;
    correctChecks = 0;

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
    results.push((correctChecks/totalChecks)*100);

    console.log("Analysing latency...");

    standard_deviation = Math.sqrt(latTotal/length);

    results.push(latMin);
    results.push(latMax);
    results.push(latAve);
    results.push(standard_deviation);

    console.log("Analysing bandwidth...");

    standard_deviation = Math.sqrt(bandTotal/length);

    results.push(bandAve);
    results.push(bandMax);
    results.push(bandMin);
    results.push(standard_deviation);

    console.log("Drift percentage: "+ results[0]);
    console.log("Drift distance: "+ results[1]);
    console.log("Standard deviation of drift: "+ results[2]);
    console.log("Consistency percentage: "+results[3]);

    console.log("Minimum latency: " + results[4]);
    console.log("Maximum latency: " + results[5]);
    console.log("Average latency: " + results[6]);
    console.log("Standard deviation for latency: " + results[7]);

    console.log("Bandwidth usage in kbps: " + results[8]);
    console.log("Maximum bandwidth: " + results[9]);
    console.log("Minimum bandwidth: " + results[10]);
    console.log("Standard deviation for bandwidth: " + results[11]);

    onDone(results);
}

http.listen(7777, function(){
    console.log(http.address());
});
