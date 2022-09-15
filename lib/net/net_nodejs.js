
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
var l_net = require('net');   // allow using network

function net_nodejs(onReceive, onConnect, onDisconnect, onError) {

    // a server object for listening to incoming connections
    var _server = undefined;
    
    // a client object for making outgoing connection 
    var _socket = undefined;
    
    // reference
    var _that = this;
                
    // check for connection validity and send to it
    // ip_port is an object with 'host' and 'port' parameter
    this.connect = function (host_port) {
        
        //LOG.debug('connecting to: ' + host_port.host + ':' + host_port.port);
 
        try {
            // connect to the given host & port, while providing a connection listener
            _socket = l_net.createConnection(host_port.port, host_port.host, function () {
            
                // store remote address & port
                _socket.host = host_port.host;
                _socket.port = host_port.port;
                //LOG.debug('out connect success for: ' + _socket.host + ':' + _socket.port);
             
                // setup connected socket               
                setupSocket(_socket);
                                        
                // replace with custom disconnect handler 
                // TODO: needed? or we can use the same one for both incoming & outgoing?
                _socket.disconnect = _that.disconnect;                
            });       
			
            /*            
            // if there's error on the connection, 'close' will follow
            _socket.on('error', function(err){
                //LOG.error('out connect socket error: ' + err);
            });
			*/ 
        }
        catch (e) {
            //LOG.error('net_nodejs: connect error: ' + e); 
            if (typeof onError === 'function')
                onError('connect');
        }
    }
    
    // disconnect from a given socket id
    this.disconnect = function () {
        if (_socket === undefined) {
            //LOG.warn('net_nodejs: no socket established to disconnect');
            return false;
        }
            
        try {
            //LOG.debug('disconnecting from ' + _socket.host + ':' + _socket.port);
            _socket.end();            
        }
        catch (e) {
            //LOG.error('net_nodejs: disconnect error: ' + e); 
            if (typeof onError === 'function')
                onError('disconnect');                    
        }
        return true;
    }
        
    // listen to a given port, while processing incoming messages at a callback
    this.listen = function (port, onDone) {

        //LOG.debug('net_nodejs, listening: ' + port); 
        try {
            
            _server = l_net.createServer(setupSocket);
            
            // pass back error for further processing
            _server.on('error', function (e) {        
                
                // NOTE: we do not display this as binding to a already binded port will cause this error
                //LOG.error('net_nodejs: listen error caught: ' + e);
                
                //if (typeof onError === 'function')
                //    onError(e);
                _server = undefined;
                
                if (typeof onDone === 'function')
                    onDone(0);                
            });
  
            _server.listen(port, function () {
                //LOG.debug('net_nodejs. server started at port: ' + port);
                
                if (typeof onDone === 'function')
                    onDone(port);
            });                
        }
        catch (e) {
            //LOG.error('net_nodejs: listen error crashed: ' + e.stack); 
            if (typeof onError === 'function')
                onError('listen');
        }        
    }
    
    // close the current listening server
    this.close = function () {
        try {
            if (_server === undefined) {
                //LOG.error('net_nodejs: server not started');
                return false;
            }
            _server.close();
            _server = undefined;
            return true;
        }
        catch (e) {
            //LOG.error('net_nodejs: server close error: ' + e.stack); 
            return false;
        }                
    }
    
    // check if this network socket is a listening server
    this.isServer = function () {
        return (_server !== undefined);
    }
    
    // check if the socket is currently connected
    this.isConnected = function () {
        ////LOG.warn('connected: ' + _socket.connected);
        return (_socket !== undefined && _socket.connected === true);
    }
        
	// setup a new usable socket with a socket handler    
	//-----------------------------------------
	var setupSocket = function (socket) {
                            
        ////LOG.debug('connection created: ' + socket.remoteAddress + ':' + socket.remotePort);
        
		// if host & port are not yet known, it's an incoming connection
        // NOTE: remoteAddress & remotePort are available for incoming connection, but not outgoing sockets        
		if (typeof socket.host === 'undefined') {
			socket.host = socket.remoteAddress;
			socket.port = socket.remotePort;
			//LOG.warn('in connect success for ' + socket.host + ':' + socket.port);
        }

        socket.connected = true;                
        
        // attach convenience function
        socket.disconnect = function () {
            socket.end();
        }
                                   
        // notify connection, pass the connecting socket
        if (typeof onConnect === 'function')            
            onConnect(socket);           
        
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
                //LOG.error('net_nodejs: resume error: ' + e.stack);
            }
        });

                
		// handle connection error or close
        var disconnect_handler = function () {
           
            // if we've already fire disconnect for this socket, ignore it
            // NOTE: as both 'close' and 'end' event could cause this callback be called
            // so we need to prevent a 2nd firing of the disconnect callback to application
            ////LOG.debug('disconnect_handler, socket.connected: ' + socket.connected);
            if (socket.connected === false)
                return;
                
            //LOG.debug('connection ended. remote host is ' + socket.host + ':' + socket.port);
                        
            socket.connected = false;
            
            // notify application, if callback exists
            if (typeof onDisconnect === 'function')
                onDisconnect(socket);                            
        }
        
        // NOTE:: if remote host calls 'disconnect' to send a FIN packet, 
        // this host will receive 'end' directly
        // (but will 'close' be emitted?)
        // see: http://nodejs.org/api/net.html#net_event_close_1
        socket.on('end', function () {
            ////LOG.warn('socket [end] called');
            
            // NOTE: should not end connection here, as default behavior would close it
            //       this allows still some messages to be sent over by this host,
            //       even if remote hosts closes the connection
            //socket.end();
        });
        
        // NOTE: this is called if an existing connection is fully closed (by itself or remote host)
        socket.on('close', function (has_error) {
            ////LOG.warn('socket [close] called');            
            // print error, if any
            if (has_error)   
                //LOG.error('socket close error: ' + has_error);
                
            disconnect_handler();
        });
                
        // if there's error on the connection, 'close' will follow
        socket.on('error', function (err){
            //LOG.error('socket error: ' + err);        
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