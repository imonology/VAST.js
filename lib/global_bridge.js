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
    .on('load_data', function(filename,onDone){
        // the line number of the file
        var lineNr = 0;

        // the first time step that all the rest are based off of
        var baseTime = 0;

        // the amount of clients in the system (should be the id of the first client step)
        var numClient = 0;

        // the time bracket number
        var timeStep = 0;

        // an array to store all of the client's states for a time step
        var clientStep = [];

        // create BSON object
        var bson = new BSON();

        console.log("start reading lines");

        var stream = fs.createReadStream('../test/'+filename+'.txt')
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
                        console.log(lineNr);
                        var clientState = JSON.parse(line);

                        if (lineNr == 1) {
                            numClient = clientState.id;
                            console.log("Clients: "+numClient);
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

                    stream.resume();
                })
                .on('error', function(err){
                    console.log('Error while reading file.', err);
                })
                .on('end', function(){
                    console.log('Read entire file.');
                    onDone(steps);
                })
            );
    });
});

http.listen(7777, function(){
    console.log(http.address());
});
