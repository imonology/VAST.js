/*
    This is the entry server that routes all information through to the matcher layer
*/

var common = require('./common');
var types = require('./types');
var voronoi = require("./voronoi/vast_voro.js");
var express = require('express');
var http = require('http');
var io = require('socket.io');

function entryServer (startPort) {
    var startPort = startPort || 2999;
    var matchers = {};
    var clients = {};
    var pendingClients = {};
    var pendingConnections = undefined;
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
    if (startPort == 2998)
        _clientID = 48
    const THRESHOLD = 20;
    const TICK_INTERVAL = 50;
    // how many times the matcher would have to move to be on top of the ailing matcher
    var MOVEMENT_SPEED = 50;
    const MINIMUM_DISTANCE = 5;
    // how much larger the matcher movement steps are relative to the load balancing steps
    const RETURN_MULTIPLE = 3;


    var _init = this.init = function() {
        LOG.debug("init");
        _app = express();
        _http = http.createServer(_app);
        _io = new io(_http);

        voro = new voronoi();

        initialiseListeners();

        _listen();

        if (MOVEMENT_SPEED <= 0)
            MOVEMENT_SPEED = 1;
    }

    var _listen = this.listen = function () {
        LOG.debug("Listen");
        _http.listen(startPort, function() {
            if (_http.listening) {
                LOG.debug("Server listening at port " + startPort);
            } else {
                LOG.debug("Error listening at port " + startPort + ". Trying next port");
                startPort--;
                _listen();
            }
        })
    }

    var _tick = function() {
        //  function to attempt to connect clients that could not join immediately
        var length = Object.keys(pendingClients).length;
        if (length != 0) {
            for (var i=0; i< length; i++) {
                var matcherID = pendingClients[i].matcherID;
                if (matchers[matcherID].clients < THRESHOLD) {
                    var client = pendingClients.splice(i,1);
                    _joinClient(client.username, client.type, client.aoi, true, clients.socket);
                } else {
                    _loadBalanceShift(matcherID);
                }
            }
        } else {
            clearInterval(pendingConnections);
        }
    }

    var _insertMatcher = function(id) {
        LOG.debug("Inserting matcher: " + id);

        if (!voro.insert(id, matchers[id].position.center)) {
            LOG.debug("Insert into voro failed");
            return false;
        }
    }

    var _joinClient = function (username, type, aoi, newConn, socket, clientID, matcherID) {
        LOG.debug("Join received. Username: " + username + " type: " + type);
        if (matcherID === undefined)
            matcherID = _findMatcher(aoi);
        if (!matchers.hasOwnProperty(matcherID)) {
            LOG.debug("matcher has not yet connected. Put into pending list");
            if (!pendingClients.hasOwnProperty(matcherID))
                pendingClients[matcherID] = [];

        if (!matchers.hasOwnProperty(matcherID)) {
            LOG.debug("matcher has not yet connected. Put into pending list");
            if (!pendingClients.hasOwnProperty(matcherID))
                pendingClients[matcherID] = [];

            pendingClients[matcherID].push({
                username: username,
                type: type,
                aoi: aoi,
                newConn: newConn,
                socket: socket,
                clientID: clientID,
                matcherID: matcherID
            });
            return false;
        }

        matchers[matcherID].clients++;
        LOG.debug("MatcherID: " + matcherID);
        if (newConn) {
            _clientID++;
            clientID = matcherID+"-"+_clientID;
            username = matcherID+"-"+username;
            _socket2id[socket.id] = clientID;
            _id2socket[clientID] = socket;
            clients[clientID] = {
                position: aoi,
                type: type,
                username: username,
                originMatcher: matcherID
            }
        }
        LOG.debug("ClientID: " + clientID);
        //LOG.debug("Matcher position: ");
        //LOG.debug(matchers[matcherID].position);
        //LOG.debug("client position: ");
        //LOG.debug(aoi);
        LOG.debug("Matcher [" + matcherID + "] client count: " + matchers[matcherID].clients);
        _client2matcher[clientID] = matcherID;
        // TODO: Adjust this as client IDs will overwrite each other (therefore not a useful map)
        _matcher2client[matcherID] = clientID;
        LOG.debug("Emit to matcher");
        // TODO: adjust what gets emitted to account for a transferring client vs joining client
        matchers[matcherID].socket.emit("join", username, type, clientID, aoi, newConn);
    }

    var _findMatcher = function (aoi) {
        LOG.debug("Find matchers");
        LOG.debug(aoi);
        var matcherID = voro.closest_to(aoi.center);
        return matcherID;
    }

    var _connectPending = function (matcherID) {
        if (pendingClients.hasOwnProperty(matcherID)) {
            LOG.info("Connecting " + pendingClients[matcherID].length + " pending clients");

            while (pendingClients[matcherID].length > 0) {
                var client = pendingClients[matcherID].pop();
                _joinClient(client.username, client.type, client.aoi,client.newConn,client.socket,client.clientID,client.matcherID);
                LOG.debug(pendingClients[matcherID].length);
            }
            LOG.debug("Done");
            delete pendingClients[matcherID];
        }
    }

    var _loadBalanceShift = function (matcherID, en_list, pos) {
        LOG.debug("shifting the balance of the matchers");

        // loop through and send message to shift
        for (var key in Object.keys(en_list)) {
            var neighbourPos = matchers[en_list[key]].position;
            var movement = _getMovement(neighbourPos, pos, MINIMUM_DISTANCE, true);
            LOG.debug(movement);
            if (!movement){
                continue;
            }
            _shiftMatcher(en_list[key],movement);
        }
    }

    var _getMovement = function(target, destination, minimumDistance, distCheck) {
        LOG.debug("Getting movement of matcher");
        var dx = (target.center.x-destination.center.x);
        var dy = (target.center.y-destination.center.y);

        if (Math.abs(dx) < minimumDistance && Math.abs(dy) < minimumDistance && distCheck) {
            LOG.debug("_getMovement =>  Minimum distance reached. Put it at minimum distance away from destination");
            var magnitude = Math.sqrt(Math.pow(dx,2) + Math.pow(dy,2));

            if (magnitude != 0) {
                dx *= minimumDistance/magnitude;
                dy *= minimumDistance/magnitude;
            }

            return {
                    x: destination.x + dx,
                    y: destination.y + dy
                    }
        } else if (Math.abs(dx) == minimumDistance && Math.abs(dy) == minimumDistance || !distCheck && Math.abs(dx) <= minimumDistance && Math.abs(dy) <= minimumDistance) {
            LOG.debug("_getMovement => minimum distance reached. Do nothing");
            return false;
        }

        dx /= MOVEMENT_SPEED;
        dy /= MOVEMENT_SPEED;

        var x = target.center.x-dx;
        var y = target.center.y-dy;

        if (distCheck) {
            LOG.debug("minDistance = true");
            var diffX = x-destination.center.x;
            var diffY = y-destination.center.y;
            if (Math.pow(x,2) + Math.pow(y,2) <= Math.pow(minimumDistance,2)) {
                var ratio;
                if (diffY != 0) {
                    ratio = diffX/diffY;
                    x = destination.center.x + ratio*minimumDistance/Math.sqrt(Math.pow(ratio,2) + 1);
                    y = destination.center.y + minimumDistance/Math.sqrt(Math.pow(ratio,2) + 1);
                } else if (diffX != 0) {
                    ratio = diffY/diffX;
                    x = destination.center.x + minimumDistance/Math.sqrt(Math.pow(ratio,2) + 1);
                    y = destination.center.y + ratio*minimumDistance/Math.sqrt(Math.pow(ratio,2) + 1);
                }


            }
            x = target.center.x-dx*RETURN_MULTIPLE;
            y = target.center.y-dy*RETURN_MULTIPLE;
        }

        return {x:x, y:y};
    }

    // send shifting message
    var _shiftMatcher = function (matcherID,pos) {
        LOG.debug("Shifting matcher " + matcherID + " to position (" + pos.x + "," + pos.y + ")");

        voro.update(matcherID,pos);

        matchers[matcherID].position.center.x = pos.x;
        matchers[matcherID].position.center.y = pos.y;

        var socket = matchers[matcherID].socket;

        LOG.debug("Emitting movement to matcher");
        socket.emit("matcherMove", pos);
    }

    var initialiseListeners = function () {
        LOG.debug("Initialise listeners");
        _io.on("connection", function(socket) {

            socket.emit("connected", startPort);

            socket.on("ID", function (id, position) {
                LOG.debug("ID received from matcher: " + id + " type: " + typeof id);
                // create new object due to pass by reference issues
                var origin = new VAST.area(new VAST.pos(position.center.x,position.center.y), position.radius);
                matchers[id] = {
                    socket: socket,
                    position: position,
                    origin: origin,       // position of original location
                    clients: 0
                }

                _socket2matcher[socket.id] = id;

                _insertMatcher(id);

                _connectPending(id);
            });

            socket.on("type", function(type) {
                LOG.debug("Type received: " + type);
                _clientID++;
                _socket2id[socket.id] = _clientID;
                _id2socket[_clientID] = socket;
                socket.emit("type", _clientID);
            });

            socket.on("join", function(username, type, x,y,radius) {
                var aoi = new VAST.area(new VAST.pos(x,y), radius);
                _joinClient(username, type, aoi, true, socket);
            });

            socket.on("move", function(connectionID, username, x, y, radius, payload, channel, packetName) {
                //LOG.debug("Move received");

                var matcherSocket = matchers[_client2matcher[connectionID]].socket;

                var aoi = new VAST.area(new VAST.pos(x,y),radius);

                clients[connectionID].position = aoi;

                matcherSocket.emit("move", connectionID, username, x, y, radius, payload, channel, packetName, clients[connectionID].originMatcher);
            });

            socket.on("subscribe", function(clientID, channel, username, x,y,AoI) {
                LOG.debug("Subscribe received from client " + clientID);

                LOG.debug("MatcherID: " + _client2matcher[clientID])
                var matcherSocket = matchers[_client2matcher[clientID]].socket;

                matcherSocket.emit("subscribe", clientID, channel, username, x,y,AoI);
            });

            socket.on("unsubscribe", function(clientID, channel, username) {
                LOG.debug("Unsubscribe received from " + clientID);

                var matcherSocket = matchers[_client2matcher[clientID]].socket;

                matcherSocket.emit("unsubscribe", clientID, channel, username);
            });

            socket.on("publish", function(clientID, username, x, y, radius, payload, channel, packetName) {
                //LOG.debug("Publish received from " + clientID + " with username " + username + " at position <" + x + "," + y + "> with radius " + radius + " on channel " + channel);
                var senderID = _socket2id[socket.id];
                var matcherSocket = matchers[_client2matcher[clientID]].socket;

                matcherSocket.emit("publish", clientID, username, x, y, radius, payload, channel, packetName, senderID);
            });

            socket.on("matcherPub", function (clientID, username, x, y, radius, payload, channel, senderID) {
                var clientSocket = _id2socket[clientID];

                //LOG.error("received pub for " + clientID + " from " + _socket2matcher[socket.id]);

                clientSocket.emit("publication", clientID, username, x, y, radius, payload, channel, senderID);
            });

            socket.on("matcherJoin", function(matcherID, username, id, newConnection) {
                if (newConnection) {
                    LOG.debug("client "+username+" joined the system. Send acknowledgement to " + id);
                    var clientSocket = _id2socket[id];
                    clientSocket.emit("join", username+"", id);
                } else {
                    LOG.debug("client [" + id + "] transferred successfully to matcher [" + matcherID + "]");
                }
            });

            socket.on("matcherType", function(type) {
                LOG.debug("Type received from matcher: " + type + ". Sending acknowledgement to entry server");
            });

            socket.on("help", function(matcherID, pos, id_list) {
                LOG.debug("Matcher [" + matcherID + "] requested help. Shifting matchers " + id_list + " towards (" + pos.center.x + "," + pos.center.y + ")")

                _loadBalanceShift(matcherID, id_list, pos);
            });

            socket.on("normalise", function(matcherID, neighbours) {
                LOG.debug("normalise => [" + matcherID + "] requested a larger region. Asking neighbours to move:");

                var neighbourID, neighbourOrigin, neighbourPos, movement;

                for (var i=0; i< neighbours.length;i++) {
                    neighbourID = neighbours[i];
                    neighbourOrigin = matchers[neighbourID].origin;
                    neighbourPos = matchers[neighbourID].position;

                    movement = _getMovement(neighbourPos, neighbourOrigin, MINIMUM_DISTANCE, false);
                    if (!movement)
                        continue;
                    _shiftMatcher(neighbourID,movement);
                }
            });

            socket.on("move_matcher", function(id, matcherID, minDistance) {
                LOG.debug("move_matcher => [" + id + "] requesting [" + matcherID + "] to move " + minDistance + " away from it");
                var movement = _getMovement(matchers[matcherID].position, matchers[id].position, true);
                if (!movement)
                    return false;
                _shiftMatcher(matcherID, movement);
            });

            socket.on("inform_move", function(matcherID, aoi) {
                LOG.debug("inform_move => Have to adjust local view of matcher [" + matcherID + "] to ");
                matchers[matcherID].position.x = aoi.x;
                matchers[matcherID].position.y = aoi.y;
            });

            socket.on("clientTransfer", function(clientID, matcherID) {
                LOG.debug("Client transfer requested for client " + clientID + " to matcher " + matcherID);

                LOG.debug("Old matcher client count: " + matchers[_client2matcher[clientID]].clients);
                matchers[_client2matcher[clientID]].clients--;
                LOG.debug("New matcher current client count: " + matchers[_client2matcher[clientID]].clients);

                LOG.debug("Client:");
                LOG.debug(clients[clientID]);

                _joinClient(clients[clientID].username, clients[clientID].type, clients[clientID].position, false, _id2socket[clientID], clientID, matcherID);
            });

            socket.on("leave", function(clientID) {
                LOG.debug("leave => Disconnecting client [" + clientID + "]");

                delete clients[clientID];

                var matcherSocket = matchers[_client2matcher[clientID]].socket;

                matcherSocket.emit("leave", clientID);
            });

            socket.on("disconn", function(id) {
                LOG.debug("Disconnect " + id);
                var connectionID = _socket2id[socket.id];

                var connectionSocket = undefined;
                if (_client2matcher.hasOwnProperty(connectionID)) {
                    connectionSocket = matchers[_client2matcher[clientID]].socket;
                } else if (_matcher2client.hasOwnProperty(connectionID) && clients.hasOwnProperty(connectionID)) {
                    connectionSocket = clients[connnectionID].socket;
                }

                connectionSocket.emit("disconnect", reason);
            })

            socket.on("disconnect", function(reason) {
                LOG.debug("Disconnection with reason " + reason);
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
                LOG.debug("Error on socket: " + reason);
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
