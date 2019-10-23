/*
    This is the entry server that routes all information through to the matcher layer
*/

var common = require('./common');
var voronoi = require("./voronoi/vast_voro.js");
var express = require('express');
var http = require('http');
var io = require('socket.io');

function entryServer (startPort) {
    var startPort = startPort || 2999;
    var matchers = {};
    var clients = {}
    var _app = undefined;
    var _http = undefined;
    var _io = undefined;
    var voro = undefined


    var _init = this.init = function() {
        _app = express();
        _http = http.createServer(_app);
        _io = new io(_http);

        voro = new voronoi();

        initialiseListeners();
    }

    var _listen = this.listen = function () {
        _http.listen(startPort, function() {
            if (_http.listening) {
                console.log("Server listening at port " + startPort);
            } else {
                console.log("Error listening at port " + startPort + ". Trying next port");
                startPort--;
                _listen();
            }
        })
    }

    var _insertMatcher = function(id) {
        console.log("Inserting matcher: " + id);

        if (!voro.insert(id, matchers[id].position)) {
            console.log("Insert into voro failed");
            return false;
        }
    }

    var initialiseListeners = function () {
        io.on("connection", function(socket) {
            console.log("Connection received");

            socket.on("ID", function (id, position) {
                console.log("ID received from matcher: " + id);
                matchers[id] = {
                    socket: socket,
                    position: position
                }

                _insertMatcher(id);
            });

            socket.on("type", function(type) {
                console.log("Type received: " + type);
            });

            socket.on("join", function(username, type) {
                console.log("Join received. Username: " + username + " type: " + type);
            });

            socket.on("move", function(connectionID, username, x, y, radius, payload, channel, packetName) {
                console.log("Move received");
            });

            socket.on("subscribe", function(clientID, channel, username, x,y,AoI) {
                console.log("Subscribe receieved");
            });

            socket.on("unsubscribe", function(clientID, channel, username)) {
                console.log("Unsubscribe received from " + clientID);
            }

            socket.on("publish", function(clientID, username, x, y, radius, payload, channel, packetName) {
                console.log("Publish received");
            });

            socket.on("disconnect", function(reason) {
                console.log("Disconnection with reason " + id);
            });

            socket.on()
        })
    }
}

if (typeof module !== 'undefined')
	module.exports = entryServer;
