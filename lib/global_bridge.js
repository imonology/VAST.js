// a connecting server bridge between the clients and the global viewer

var express = require('express')();
var http = require('http').createServer(express);
var io = require('socket.io')(http);

var fs = require('fs');
var es = require('event-stream');
var BSON = require('bson');

var sites = {};
var neighbours = {};

var steps = {};

var globalSock = undefined;

var count = -1;

var clientTotal = JSON.parse(process.argv[2]);

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
        globalSock.emit('voro', [sites, neighbours]);
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
                    onDone(steps);
                }
            }));
    } else {
        console.log('Error while reading file: file "' + i + '.txt" does not exist');
        if (i < clientTotal) {
            i++;
            _loadData(i, onDone);
        } else
        {
            onDone(steps);
        }
    }
}

http.listen(7777, function(){
    console.log(http.address());
});
