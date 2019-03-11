
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

function net_nodejs(id, onReceive, onConnect, onDisconnect, onError, visualComm) {

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

    // a socket to communicate with the visualiser
    var _sockIO = undefined;

    // a client object for making outgoing connection
    var _socket = undefined;

    // reference
    var _that = this;

    //voronoi diagram for visualiser
    var voro = undefined;

    // initial socket.io port for server
    var sockPort = 8888;

    // assigned id;
    var _self_id = id || -1;

    // message sent and received buffer
    var buf = [];

    // all messages received and sent
    var messages = [];

    // check for connection validity and send to it
    // ip_port is an object with 'host' and 'port' parameter
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

            // setup the definitions for the socket.io event handlers
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

            // handle a listening error if the port is already in use
            _http.on('error', function (e) {
                if (e.code === 'EADDRINUSE') {
                    LOG.debug("Socket.io port "+sockPort+" in use, retrying next port.", _self_id);
                    sockPort++
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



} // end net_nodejs()

// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = net_nodejs;
