
/*
 * VAST, a scalable peer-to-peer network for virtual environments
 * Copyright (C) 2005-2011 Shun-Yun Hu (syhu@ieee.org)
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 */

/*
    net_nodejs.js

    A network connector usable under node.js

    /////////////////////////////
    data structure / callback:
    /////////////////////////////

    host_port = {host, port};

    // socket:  socket in which the message comes from
    // msg:     a message received
    onReceive(socket, msg)
    onConnect(socket)
    onDisconnect(socket)
	onError(err)

    /////////////////////////////
    supported functions:
    /////////////////////////////

    // constructor (creating a single network connection)
    net_nodejs(onReceive, onConnect, onDisconnect)

    // make TCP connection to a given host_port
    // all received messages from this socket is return to 'onReceive'
    // connection & disconnection can be notified via callbacks (optional)
    connect(host_port)

    // disconnect current connection
    disconnect()

    // listen to a particular port for incoming connections / messages
    // all received messages are delivered to 'onReceive'
    // return port binded, or 0 to indicate error
    listen(port, onDone)

    // close the current listening server
    close()

    // check if I'm a listening server
    isServer()

    // check if a client socket is currently connected
    isConnected()

    history:
        2012-06-30              initial version (start from stretch)
        2012-09-24              add is_connected()
*/

require('../common.js');
var express = require('express');
var http = require('http');
var io = require('socket.io');
var ioClient = require('socket.io-client');
var l_net = require('net');   // allow using network

function net_nodejs(id, onReceive, onConnect, onDisconnect, onError, visualComm, clientComm) {

    // a server object for listening to incoming connections
    var _server = undefined;

    // a server object for listening to incoming socket io connections
    var _io = undefined;

    // a connection to the global view
    var _view = undefined;

    // a socket to communicate with global viewer
    var _globalSock = undefined;

    // an http server
    var _http = undefined;

    // an express object
    var _app = undefined;

    // client listener
    var _ioClient = undefined;
    var _httpClient = undefined;
    var _appClient = undefined;

    // a socket to communicate with the visualiser
    var _sockIO = undefined;

    // a client object for making outgoing connection
    var _socket = undefined;

    // reference to socket used for entryServer
    var _entryServer = undefined;

    // client and server sockets for clients
    var _socketVAST = {};

    // map from clientID -> socket
    var _id2socket = {};

    // map from socket ID -> clientID
    var _socket2ID = {};

    // reference
    var _that = this;

    //voronoi diagram for visualiser
    var voro = undefined;

    // initial socket.io port for server
    var sockPort = 8888;

    // initial socket.io port for client server
    var clientPort = 3000;

    // assigned id;
    var _self_id = id || -1;

    // message sent and received buffer
    var buf = [];

    // all messages received and sent
    var messages = [];

    // check for connection validity and send to it
    // host_port is an object with 'host' and 'port' parameter
    this.connect = function (host_port, clientID, callback) {

        LOG.debug('connecting to: ' + host_port.host + ':' + host_port.port, _self_id);

        try {
            // connect to the given host & port, while providing a connection listener
            _socket = l_net.createConnection(host_port.port, host_port.host, function () {

                // store remote address & port
                _socket.host = host_port.host;
                _socket.port = host_port.port;
                LOG.debug('out connect success for: ' + _socket.host + ':' + _socket.port, _self_id);

                // setup connected socket
                //console.log('Setup Socket called in connect for ' + _self_id);
                setupSocket(_socket);

                // replace with custom disconnect handler
                // TODO: needed? or we can use the same one for both incoming & outgoing?
                _socket.disconnect = _that.disconnect;

                callback(clientID);
            });

            // if there's error on the connection, 'close' will follow
            _socket.on('error', function(err){
                LOG.error('out connect socket error: ' + err);
                if (typeof onError === 'function')
                    onError('connect');
            });
        }
        catch (e) {
            LOG.error('net_nodejs: connect error: ' + e, _self_id);
            if (typeof onError === 'function')
                onError('connect');
        }
    }

    // disconnect from a given socket id
    this.disconnect = function () {
        if (_socket === undefined) {
            LOG.warn('net_nodejs: no socket established to disconnect', _self_id);
            return false;
        }

        try {
            LOG.debug('disconnecting from ' + _socket.host + ':' + _socket.port, _self_id);
            _socket.end();
        }
        catch (e) {
            LOG.error('net_nodejs: disconnect error: ' + e, _self_id);
            if (typeof onError === 'function')
                onError('disconnect');
        }
        return true;
    }

    // listen to a given port, while processing incoming messages at a callback
    this.listen = function (port, onDone) {

        LOG.debug('net_nodejs, listening: ' + port, _self_id);
        try {
            //console.log('Setup Socket called in listen for '+_self_id);
            _server = l_net.createServer(setupSocket);

            // create new instance of the socket.io server
            _app = express();
            _http = http.createServer(_app);
            _io = new io(_http);

            // create instance of the socket.io server for the client connections
            _appClient = express();
            _httpClient = http.createServer(_appClient);
            _ioClient = new io(_httpClient);

            // setup the definitions for the socket.io event handlers for the visualiser
            _io.on('connection', function(visualiser){
                // store socket
                _sockIO = visualiser;

                _sockIO.emit("Message", JSON.stringify(buf), function(){buf = [];});

                // check that ID has been set, and if so, send
                if (_self_id != -1) {
                    _sockIO.emit("ID", _self_id);
                }

                // check for whether the socket is already connected
                LOG.debug("Socket.io has connected with a visualiser", _self_id);
                _sockIO.emit("connected", "You have connected to the socket.io server for client:"+_self_id);

                // request site map from client in upper levels
                _sockIO.on('voro', function(message, onDone){
                    visualComm("voro",message);
                });

                // send a movement command to the client from the visualiser
                _sockIO.on("move", function(x,y,aoi) {
                    LOG.info('move command received', _self_id);
                    var pos = new VAST.area(new VAST.pos(x,y),aoi);
                    visualComm("move", pos);
                });

                // return message array
                _sockIO.on("messages", function(callback) {
                    callback(messages);
                });

                // process next message
                _sockIO.on("next", function(bool){
                    if (bool) {
                        LOG.debug("Move on to next command", _self_id);
                    } else {
                        LOG.debug("Switch debug mode", _self_id);
                    }
                    visualComm("next", bool);
                });


                _sockIO.on("disconnect", function() {
                    LOG.debug("Socket has disconnected", _self_id);
                    visualComm("disconnect", true);
                    _sockIO = undefined;
                })

            });

            // setup the definitions for the client socket.io event handlers for connecting clients
            _ioClient.on('connection', function(socket) {
                LOG.layer("Client connection received", _self_id);

                storeSocket(socket.id, socket);

                socket.on("type", function (type) {
                    LOG.layer("net_nodejs::type => received type: " + type, _self_id);
                    // insert socket into temporary view in case it isn't stored already
                    if (!_id2socket.hasOwnProperty(socket.id)) {
                        LOG.layer("net_nodejs::type => storing temporary socket");
                        storeSocket(socket.id, socket);
                    }
                    // collate data into a single object
                    var data = {
                        type: type,
                        socketID: socket.id
                    }
                    clientComm("type", data);
                });

                socket.on("join", function (username, type) {
                    LOG.layer("net_nodejs::join => username received from " + username + " (" + type + ")", _self_id);
                    storeSocket(socket.id, socket);
                    var data = {
                        username: username,
                        socketID: socket.id,
                        type: type
                    }
                    LOG.layer("net_nodejs::join => Sending data", _self_id);
                    LOG.layer(data);
                    clientComm("join", data);
                });

                socket.on("subscribe", function (clientID, channel, username, x, y, AoI){
                    LOG.layer("subscribe received: " + clientID + " " + channel + " " + username + " " + x + " " + y + " " + AoI);
                    var data = {
                        clientID: clientID,
                        channel: channel,
                        username: username,
                        x: x,
                        y: y,
                        radius: AoI
                    }
                    clientComm("subscribe", data);
                });

                socket.on("unsubscribe", function (clientID,channel, username) {
                    LOG.layer("net_nodejs::vast => unsubscribe received: " + channel + " " + username + " " + clientID, _self_id);
                    var data = {
                        clientID: clientID,
                        channel: channel,
                        username: username
                    }

                    clientComm("unsubscribe", data);
                });

                socket.on("move", function (connectionID, username, x, y, radius, payload, channel, packetName) {
                    LOG.layer("net_nodejs::move => [" + connectionID + "] moving " + username + " to <" + x + "," + y + "> on channel " + channel, _self_id);
                    var data = {
                        clientID:   connectionID,
                        username:   username,
                        x:          x,
                        y:          y,
                        radius:     radius,
                        payload:    payload,
                        channel:    channel,
                        packetName: packetName
                    }

                    clientComm("move", data);
                })

                socket.on("publish", function (clientID, username, x, y, radius, payload, channel, packetName) {
                    LOG.layer("net_nodejs::publish => received publish from " + username + " " + clientID, _self_id);
                    LOG.layer(clientID);
                    var data = {
                        clientID: clientID,
                        username: username,
                        x: x,
                        y: y,
                        radius: radius,
                        payload: payload,
                        channel: channel,
                        packetName: packetName
                    }

                    clientComm("publish", data);
                });

                socket.on("disconnect", function (reason) {
                    LOG.layer("net_nodejs:disconnect => socket disconnected with reason: " + reason);

                    clientComm("disconnect", _socket2ID[socket.id]);
                });

                socket.on("error", function (error) {
                    LOG.layer("net_nodejs::error => socket encountered error: " + error);

                    clientComm("disconnect", _socket2ID[socket.id]);
                });
                //console.log(socket);
            });

            // handle a listening error if the port is already in use
            _httpClient.on('error', function (e) {
                if (e.code === 'EADDRINUSE') {
                    LOG.debug("Client socket.io port "+clientPort+" in use, retrying next port.", _self_id);
                    clientPort++;
                } else {
                    LOG.error("Error starting the socket.io server for the client listener", _self_id);
                }
            });

            // only try to listen if not already listening on a port
            if (!_httpClient.listening) {
                _httpClient.listen(clientPort, function() {
                    if (_httpClient.listening){
                        LOG.warn("Client socket.io port bind successful: "+clientPort, _self_id);
                    }
                });
            }

            // handle a listening error if the port is already in use
            _http.on('error', function (e) {
                if (e.code === 'EADDRINUSE') {
                    LOG.debug("Socket.io port "+sockPort+" in use, retrying next port.", _self_id);
                    sockPort++;
                } else {
                    LOG.error("Error starting the socket.io server for the visualiser", _self_id);
                }
            });

            // only try to listen if not already listening on a port
            if (!_http.listening) {
                _http.listen(sockPort, function() {
                    if (_http.listening){
                        LOG.warn("Socket.io port bind successful: "+sockPort, _self_id);
                    }
                });
            }

            // pass back error for further processing
            _server.on('error', function (e) {

                // NOTE: we do not display this as binding to a already binded port will cause this error
                LOG.debug('net_nodejs: listen error caught: ' + e, _self_id);

                //if (typeof onError === 'function')
                //    onError(e);
                _server = undefined;

                if (typeof onDone === 'function')
                    onDone(0);
            });

            _server.on('connect', function(){
                LOG.debug('Socket connected', _self_id);
            });

            _server.listen(port, function () {
                LOG.debug('net_nodejs. server started at port: ' + port, _self_id);

                if (typeof onDone === 'function')
                    onDone(port);
            });

            // create connection to entry server
            if (_entryServer === undefined) {
                // NOTE: change this in order to adjust connectiong to entry server
                _entryServer = ioClient('http://10.10.11.179:2999');

                _entryServer.on("type", function (type) {
                    LOG.layer("net_nodejs::type => received type: " + type, _self_id);
                    // insert socket into temporary view in case it isn't stored already
                    if (!_id2socket.hasOwnProperty(socket.id)) {
                        LOG.layer("net_nodejs::type => storing temporary socket");
                        storeSocket(socket.id, socket);
                    }
                    // collate data into a single object
                    var data = {
                        type: type,
                        socketID: socket.id
                    }
                    clientComm("type", data);
                });

                _entryServer.on("join", function (username, type, clientID, aoi) {
                    LOG.layer("net_nodejs::join => username received from " + username + " (" + type + ")", _self_id);
                    storeSocket(_entryServer.id, _entryServer);
                    var data = {
                        username: username,
                        socketID: _entryServer.id,
                        type: type,
                        clientID: clientID,
                        aoi: aoi
                    }
                    LOG.layer("net_nodejs::join => Sending data", _self_id);
                    LOG.layer(data);
                    clientComm("join", data);
                });

                _entryServer.on("subscribe", function (clientID, channel, username, x, y, AoI, senderID){
                    LOG.layer("subscribe received: " + clientID + " " + channel + " " + username + " " + x + " " + y + " " + AoI);
                    var data = {
                        clientID: clientID,
                        channel: channel,
                        username: username,
                        x: x,
                        y: y,
                        radius: AoI,
                        senderID: senderID
                    }
                    clientComm("subscribe", data);
                });

                _entryServer.on("unsubscribe", function (clientID,channel, username) {
                    LOG.layer("net_nodejs::vast => unsubscribe received: " + channel + " " + username + " " + clientID, _self_id);
                    var data = {
                        clientID: clientID,
                        channel: channel,
                        username: username
                    }

                    clientComm("unsubscribe", data);
                });

                _entryServer.on("move", function (connectionID, username, x, y, radius, payload, channel, packetName) {
                    LOG.layer("net_nodejs::move => [" + connectionID + "] moving " + username + " to <" + x + "," + y + "> on channel " + channel, _self_id);
                    var data = {
                        clientID:   connectionID,
                        username:   username,
                        x:          x,
                        y:          y,
                        radius:     radius,
                        payload:    payload,
                        channel:    channel,
                        packetName: packetName
                    }

                    clientComm("move", data);
                })

                _entryServer.on("publish", function (clientID, username, x, y, radius, payload, channel, packetName) {
                    LOG.layer("net_nodejs::publish => received publish from " + username + " " + clientID, _self_id);
                    LOG.layer(clientID);
                    var data = {
                        clientID: clientID,
                        username: username,
                        x: x,
                        y: y,
                        radius: radius,
                        payload: payload,
                        channel: channel,
                        packetName: packetName
                    }

                    clientComm("publish", data);
                });

                _entryServer.on("disconnect", function (reason, id) {
                    LOG.layer("net_nodejs:disconnect => socket disconnected with reason: " + reason);

                    clientComm("disconnect", id);
                });

                _entryServer.on("error", function (error) {
                    LOG.layer("net_nodejs::error => socket encountered error: " + error);

                    clientComm("disconnect", _socket2ID[socket.id]);
                });
            }

            //create connection to global view
            if (_view === undefined) {
                //console.log('connect to global');
                _view = ioClient('http://10.10.11.179:7777');

                // start synchronised movement
                _view.on("move", function(time) {
                    visualComm("sync_move", true);
                })
            }

        }
        catch (e) {
            LOG.error('net_nodejs: listen error crashed: ' + e.stack, _self_id);
            if (typeof onError === 'function')
                onError('listen');
        }
    }

    // close the current listening server
    // TODO: close the socket.io server as well
    this.close = function () {
        try {
            if (_server === undefined) {
                LOG.error('net_nodejs: server not started', _self_id);
                return false;
            }
            _server.close();
            _server = undefined;
            return true;
        }
        catch (e) {
            LOG.error('net_nodejs: server close error: ' + e.stack, _self_id);
            return false;
        }
    }

    // check if this network socket is a listening server
    this.isServer = function () {
        return (_server !== undefined);
    }

    //receive voronoi diagram object
    this.updateVoro = function(voro) {
        this.voro = voro;
        _io.emit("voro", voro);
    }

    //  receive data for visualiser
    this.visualReturn = function (type,data) {
        if (type == "ID"){
            LOG.info("ID initialised: "+data, _self_id);
            _self_id = data;
        }

        if (_view !== undefined && type == "voro_client") {
                _view.emit(type,data);
        } else if (_sockIO !== undefined) {
            // check message type
            switch (type) {
                case "ID":
                    LOG.info("Id sent:"+data, _self_id);
                    LOG.info("Type: "+type, _self_id);
                    _sockIO.emit(type, data);
                    break;
                case "voro":
                    _sockIO.emit(type, data);
                    break;
                case "Message received":
                    LOG.info("message received of type: "+data.type, _self_id);
                    messages.push(data);
                    buf.push(data);
                    _sockIO.emit("Message",JSON.stringify(buf), function() {
                        // TODO: callback
                        // NOTE: is this even necessary? Stringify will produce full result before buffer flush
                    });
                    LOG.info("Receive buffer flushed", _self_id);
                    buf = [];
                    break;
                case "Message sent":
                    LOG.info("message sent of type: "+data.type, _self_id);
                    messages.push(data);
                    buf.push(data);
                    _sockIO.emit("Message",JSON.stringify(buf), function() {
                        // TODO: callback
                    });
                    LOG.info("Sent buffer flushed", _self_id);
                    buf = [];
                    break;
                case "empty":
                    _sockIO.emit(type, data);
                    break;
                default:
                    LOG.error("Visualiser does not recognise that message type", _self_id);
            }
        } else {
            if (type == "ID"){
                LOG.info("ID initialised: "+data, _self_id);
                _self_id = data;
            } else if (type == "Message sent") {
                LOG.info("Sent message has been captured", _self_id);
                //buf.push(data);
            } else if (type == "Message received") {
                LOG.info("Received message has been captured", _self_id);
                //buf.push(data);
            }
        }

    }

    // return channel for vast clients
    this.clientReturn = function (type, data) {
        //switch the message to determine how to handle it
        LOG.layer("net_nodejs::clientReturn => getting return message of type: " + type, _self_id);
        switch (type) {
            case "ID": {
                LOG.layer("net_nodejs::ID => Sending matcher ID " + data.id + " to entry server");

                if (_entryServer != undefined) {
                    _entryServer.emit(type, data.id,data.position);
                } else {
                    LOG.layer("net_nodejs::type => entryServer does not exist. Cannot send 'ID' acknowledgement", _self_id);
                }
            }
                break;
            case "type": {
                LOG.layer("net_nodejs::clientReturn::type => sending connection acknowledgement to connection");

                // retrieve socket through which communication goes through
                //var socket = _id2socket[data.socketID];

                // store socket with connection ID and delete old reference
                //_id2socket[data.connectionID] = socket;
                //delete _id2socket[data.socketID];

                // store mapping from socket ID to clientID for disconnect and error handling
                //_socket2ID[socket.id] = data.connectionID;

                if (_entryServer != undefined) {
                    _entryServer.emit("matcherType", data.connectionID);
                } else {
                    LOG.layer("net_nodejs::type => socket does not exist. Cannot send 'type' acknowledgement", _self_id);
                }
            }
                break;

            case "join": {
                // capture data from incoming message from upper layer
                var _clientID = data.clientID;
                var _socketID = data.socketID;

                // get socket that the data needs to be sent to
                //var socket = _id2socket[_socketID];

                // map from clientID -> socket for communication
                //_id2socket[_clientID] = socket;

                // delete temporary socket storage
                //delete _id2socket[_socketID];

                // store mapping from socket ID to clientID for disconnect and error handling
                //_socket2ID[_socketID] = _clientID;

                // create data packet to be sent
                var returnData = {
                    username: data.username,
                    clientID: _clientID
                }

                // emit 'join' event with above data
                if (_entryServer != undefined) {
                    LOG.layer("net_nodejs::join => returning data to " + data.username + " id: " + _clientID, _self_id);
                    _entryServer.emit("matcherJoin", _self_id, data.username, _clientID);
                } else {
                    LOG.layer("net_nodejs::join => socket does not exist. Cannot send 'join' acknowledgement", _self_id);
                }
            }
                break;

            case "publish": {
                LOG.layer("net_nodejs::publish => publishing to " + data.clientID, _self_id);
                var payload = data.payload;
                //var socket = _id2socket[data.clientID];
                if (_entryServer != undefined) {
                    _entryServer.emit("matcherPub", data.clientID, payload.username, payload.aoi.center.x, payload.aoi.center.y, payload.aoi.radius, payload.payload, payload.channel, payload.senderID);
                } else {
                    LOG.layer("net_nodejs::publish => socket does not exist. Ignore publication", _self_id);
                }
            }
                break;
            default:

        }
    }

	// setup a new usable socket with a socket handler
	//-----------------------------------------
	var setupSocket = function (socket) {

        //LOG.debug('connection created: ' + socket.remoteAddress + ':' + socket.remotePort);

		// if host & port are not yet known, it's an incoming connection
        // NOTE: remoteAddress & remotePort are available for incoming connection, but not outgoing sockets
		if (typeof socket.host === 'undefined') {
			socket.host = socket.remoteAddress;
			socket.port = socket.remotePort;
			LOG.warn('in connect success for ' + socket.host + ':' + socket.port, _self_id);
        }

        socket.connected = true;

        // attach convenience function
        socket.disconnect = function () {
            LOG.warn("Disconnect", _self_id);
            socket.end();
        }

        // notify connection, pass the connecting socket
        if (typeof onConnect === 'function'){
            LOG.debug("Socket has connected", _self_id);
            socket.on('connect', function(data){
                LOG.debug('Socket has connected', _self_id);
            });

            //('onConnect called in '+_self_id);
            onConnect(socket);
        }

        // call data callback to process data, if exists
        // (this happens when called by a listening server to setup new socket)
        if (typeof onReceive === 'function') {
            socket.on('data', function (data) {
                onReceive(socket, data);
            });
        }

		// when socket becomes empty again, can now keep sending queued messages
        socket.on('drain', function () {
            try {
                socket.resume();
            }
            catch (e) {
                LOG.error('net_nodejs: resume error: ' + e.stack, _self_id);
            }
        });


		// handle connection error or close
        var disconnect_handler = function () {

            // if we've already fire disconnect for this socket, ignore it
            // NOTE: as both 'close' and 'end' event could cause this callback be called
            // so we need to prevent a 2nd firing of the disconnect callback to application
            //LOG.debug('disconnect_handler, socket.connected: ' + socket.connected);
            if (socket.connected === false)
                return;

            LOG.debug('connection ended. remote host is ' + socket.host + ':' + socket.port, _self_id);

            socket.connected = false;

            // notify application, if callback exists
            if (typeof onDisconnect === 'function')
                onDisconnect(socket);
        }

        //handle connection errors
        var error_handler = function () {
            LOG.debug('connection ended. remote host is ' + socket.host + ':' + socket.port, _self_id);

            socket.connected = false;

            if (typeof onError === 'function')
                onError(socket);
        }

        // NOTE:: if remote host calls 'disconnect' to send a FIN packet,
        // this host will receive 'end' directly
        // (but will 'close' be emitted?)
        // see: http://nodejs.org/api/net.html#net_event_close_1
        socket.on('end', function () {
            //LOG.warn('socket [end] called');

            // NOTE: should not end connection here, as default behavior would close it
            //       this allows still some messages to be sent over by this host,
            //       even if remote hosts closes the connection
            //socket.end();
        });

        // NOTE: this is called if an existing connection is fully closed (by itself or remote host)
        socket.on('close', function (has_error) {
            //LOG.warn('socket [close] called');
            // print error, if any
            if (has_error)
                LOG.error('socket close error: ' + has_error, _self_id);

            disconnect_handler();
        });

        // if there's error on the connection, 'close' will follow
        socket.on('error', function (err){
            LOG.error('socket error: ' + err, _self_id);
            error_handler();
        });

        socket.setEncoding('UTF8');
        socket.setKeepAlive(true, 20 * 1000);		// 20 seconds keepalive

        // this is important to allow messages be delivered immediately after sending
        socket.setNoDelay(true);

		return socket;
    }

    // store socket in map
    var storeSocket = function (id,socket) {
        LOG.debug("net_nodejs::storeSocket => Storing socket", _self_id);
        _id2socket[id] = socket;
        //console.log(socket);
        LOG.debug("Socket stored", _self_id);
    }

} // end net_nodejs()

// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = net_nodejs;
