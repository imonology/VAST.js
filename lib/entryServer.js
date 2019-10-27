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
    var _client2matcher = {};
    var _matcher2client = {};
    var _id2socket = {};
    var _socket2id = {};
    var _socket2matcher = {};
    var _app = undefined;
    var _http = undefined;
    var _io = undefined;
    var voro = undefined;
    var _clientID = -1;


    var _init = this.init = function() {
        console.log("init");
        _app = express();
        _http = http.createServer(_app);
        _io = new io(_http);

        voro = new voronoi();

        initialiseListeners();

        _listen();
    }

    var _listen = this.listen = function () {
        console.log("Listen");
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

        if (!voro.insert(id, matchers[id].position.center)) {
            console.log("Insert into voro failed");
            return false;
        }
    }

    var _findMatcher = function (aoi) {
        console.log("Find matchers");
        console.log(aoi);
        var matcherID = voro.closest_to(aoi);
        return matcherID;
    }

    var initialiseListeners = function () {
        console.log("Initialise listeners");
        _io.on("connection", function(socket) {
            console.log("Connection received");

            socket.on("ID", function (id, position) {
                console.log("ID received from matcher: " + id);
                console.log(position);
                matchers[id] = {
                    socket: socket,
                    position: position
                }

                _socket2matcher[socket.id] = id;

                _insertMatcher(id);
            });

            socket.on("type", function(type) {
                console.log("Type received: " + type);
                //_clientID++;
                //_socket2id[socket.id] = _clientID;
                //_id2socket[_clientID] = socket;
                socket.emit("type", _clientID);
            });

            socket.on("join", function(username, type, aoi) {
                console.log("Join received. Username: " + username + " type: " + type);
                _clientID++;
                var matcherID = _findMatcher(aoi);
                console.log("MatcherID: " + matcherID);
                var clientID = matcherID+"-"+_clientID;
                console.log("ClientID: " + clientID);
                console.log("Matcher position: ");
                console.log(matchers[matcherID].position);
                console.log("client position: ");
                console.log(aoi);
                username = matcherID+"-"+username;
                _socket2id[socket.id] = clientID;
                _id2socket[clientID] = socket;
                clients[clientID] = {
                    socket: socket,
                    position: aoi,
                    type: type
                }
                _client2matcher[clientID] = matcherID;
                _matcher2client[matcherID] = clientID;
                console.log("Emit to matcher");
                matchers[matcherID].socket.emit("join", username, type, clientID, aoi);
            });

            socket.on("move", function(connectionID, username, x, y, radius, payload, channel, packetName) {
                //console.log("Move received");

                var matcherSocket = matchers[_client2matcher[connectionID]].socket;

                matcherSocket.emit("move", connectionID, username, x, y, radius, payload, channel, packetName);
            });

            socket.on("subscribe", function(clientID, channel, username, x,y,AoI) {
                console.log("Subscribe receieved");

                var matcherSocket = matchers[_client2matcher[clientID]].socket;

                matcherSocket.emit("subscribe", clientID, channel, username, x,y,AoI);
            });

            socket.on("unsubscribe", function(clientID, channel, username) {
                console.log("Unsubscribe received from " + clientID);

                var matcherSocket = matchers[_client2matcher[clientID]].socket;

                matcherSocket.emit("unsubscribe", clientID, channel, username);
            });

            socket.on("publish", function(clientID, username, x, y, radius, payload, channel, packetName) {
                //console.log("Publish received");

                var matcherSocket = matchers[_client2matcher[clientID]].socket;

                matcherSocket.emit("publish", clientID, username, x, y, radius, payload, channel, packetName);
            });

            socket.on("matcherPub", function (clientID, username, x, y, radius, payload, channel) {
                var clientSocket = _id2socket[clientID];

                clientSocket.emit("publication", clientID, username, x, y, radius, payload, channel);
            });

            socket.on("matcherJoin", function(matcherID, username, id) {
                console.log("client joined the system. Send acknowledgement to " + id);
                var clientSocket = _id2socket[id];
                clientSocket.emit("join", username, id);
            });

            socket.on("matcherType", function(type) {
                console.log("Type received from matcher: " + type + ". Sending acknowledgement to entry server");
            });

            socket.on("disconnect", function(reason) {
                console.log("Disconnection with reason " + id);
                var connectionID = _socket2id[socket.id];

                var connectionSocket = undefined;
                if (_client2matcher.hasOwnProperty(connectionID)) {
                    connectionSocket = matchers[_client2matcher[clientID]].socket;
                } else if (_matcher2client.hasOwnProperty(connectionID) && clients.hasOwnProperty(connectionID)) {
                    connectionSocket = clients[connnectionID].socket;
                }


                connectionSocket.emit("disconnect", reason);
            });

            socket.on("error", function (reason) {
                console.log("Error on socket: " + reason);
                var connectionID = _socket2id[socket.id];

                var connectionSocket = undefined;
                if (_client2matcher.hasOwnProperty(connectionID)) {
                    connectionSocket = matchers[_client2matcher[clientID]].socket;
                } else if (_matcher2client.hasOwnProperty(connectionID) && clients.hasOwnProperty(connectionID)) {
                    connectionSocket = clients[connnectionID].socket;
                }

                connectionSocket.emit("disconnect", reason);
            });
        })
    }
}

if (typeof module !== 'undefined')
	module.exports = entryServer;
