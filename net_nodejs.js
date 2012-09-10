
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
    
    A network layer usable under node.js

    /////////////////////////////
    data structure / callback:
    /////////////////////////////
    
    host_port = {host, port};
    
    // socket:  socket in which the message comes from   
    // msg:     a message received
    onReceive(socket, msg)
    onConnect(socket)
    onDisconnect(socket)
     
    /////////////////////////////
    supported functions: 
    /////////////////////////////
        
    // constructor (creating a single network connection)    
    net_nodejs(onReceive, onConnect, onDisconnect)
    
    // make TCP connection to a given host_port
    // all received messages from this socket is return to 'onReceive'
    // connection & disconnection can be notified via callbacks (optional)
    connect(host_port, data_callback, onConnect, onDisconnect)  
    
    // disconnect current connection
    disconnect()
    
    // send a message 'msg' of length 'size' to current connection,
    // optional 'socket' can be provided to respond requests from incoming clients
    send(msg, socket)
    
    // send message 'msg' to a UDP channel (given by 'host_port')
    send_udp(host_port, msg);
    
    // listen to a particular port for incoming connections / messages
    // all received messages are delivered to 'onReceive'
    // return port binded, or 0 to indicate error 
    listen(port, onDone)
                 
    history:
        2012-06-30              initial version (start from stretch)
        
*/
require('./common.js');
var l_net = require('net');   // allow using network

function net_nodejs(onReceive, onConnect, onDisconnect, onError) {

    // a server object for listening to incoming connections
    var _server = undefined;
    
    // a client object for making connection 
    var _client = undefined;
    
    // the IP & port of a host to be connected
    //var _target = undefined;
            
    // check for connection validity and send to it)
    // ip_port is an object with 'host' and 'port' parameter
    this.connect = function (host_port) {
        
        LOG.debug('connecting to: ' + host_port.host + ':' + host_port.port);
 
        try {
            // connect to the given host & port, while providing a connection listener
            _client = l_net.createConnection(host_port.port, host_port.host);           
        }
        catch (e) {
            LOG.error('net_nodejs: connect error: ' + e); 
            if (typeof onError === 'function')
                onError('connect');            
        }
        
        _client.on('connect', function () {
        
            LOG.debug('out connect success for: ' + host_port.host + ':' + host_port.port);
            
            // store remote address & port
            _client.host = host_port.host;
            _client.port = host_port.port;                          
        
            setupSocket(_client);
            if (typeof onConnect === 'function')
                onConnect(_client);
        });       
    }
    
    // disconnect from a given socket id
    this.disconnect = function () {
        if (_client === undefined)
            return false;
            
        try {
            LOG.debug('disconnecting from ' + _client.host + ':' + _client.port);
            _client.end();
        }
        catch (e) {
            LOG.error('net_nodejs: disconnect error: ' + e); 
            if (typeof onError === 'function')
                onError('disconnect');                    
        }
    }
    
    // send a given message to a socket_id
    this.send = function (msg, socket) {
        
        //LOG.debug('sending to ' + socket + ' msg: ' + msg);
 
        try {
            // if this is a connection
            if (_client !== undefined) {
                //LOG.debug('to client');
                _client.write(msg);
            }
            // if this is a listening server
            else if (socket !== undefined) {
                //LOG.debug('to socket');
                socket.write(msg);
            }
            // if neither
            else
                return false;        
        }
        catch (e) {
            LOG.debug('send fail for msg: ' + msg);
            if (typeof onError === 'function')
                onError('send');            
            return false;
        }
         
        return true;        
    }
    
    // send a given message to a UDP-style host:port
    this.send_udp = function (host_port, msg) {
    
    }
    
    // listen to a given port, while processing incoming messages at a callback
    this.listen = function (port, onDone) {

        LOG.debug('listening at: ' + port); 
        try {
            
            _server = l_net.createServer(setupSocket);
            
            // attempt to re-try if bind fail
            _server.on('error', function (e) {        
                LOG.error('net_nodejs: listen error caught: ' + e);
                
                if (typeof onDone === 'function')
                    onDone(0);
            });
  
            _server.listen(port, function () {
                LOG.debug('server started at port: ' + port);
                
                if (typeof onDone === 'function')
                    onDone(port);
            });                
        }
        catch (e) {
            LOG.error('net_nodejs: listen error crashed: ' + e); 
            if (typeof onError === 'function')
                onError('listen');
        }        
    }
    
    // check if this network socket is a listening server
    this.isServer = function () {
        return (_server !== undefined);
    }
        
	// setup a new usable socket with a socket handler    
	//-----------------------------------------
	var setupSocket = function (socket) {
        
        //LOG.debug('setupSocket called, onReceive: ' + typeof onReceive);
        
        socket.setEncoding('UTF8');
        socket.setKeepAlive(true, 20 * 1000);		// 20 seconds keepalive

        // this is important to allow messages be delivered immediately after sending
        socket.setNoDelay(true);
        
        // flag to indicate socket is already disconnected
        socket.disconnected = false;
        
        // call data callback to process data, if exists 
        // (this happens when setupSocket is called by a listening server for setup new socket)
        if (typeof onReceive === 'function') {
            //LOG.debug('recv_CB provided, registered for data');
            socket.on('data', function (data) {
                onReceive(socket, data);
            });
        }
                   
		// when socket becomes empty again
        socket.on('drain', function () {
            socket.resume();
        });

        socket.on('connect', function () {
        
            // NOTE: remoteAddress & remotePort are available for incoming connection, but not outgoing sockets
            //LOG.debug('connection created: ' + socket.remoteAddress + ':' + socket.remotePort);
            
            socket.host = socket.remoteAddress;
            socket.port = socket.remotePort;
            LOG.debug('connection created: ' + socket.host + ':' + socket.port);
            
            // notify connection, pass the connecting socket
            if (typeof onConnect === 'function')            
                onConnect(socket);
                
            socket.disconnected = false;
        });
                
		// handle connection error or close
        var disconnect_handler = function (has_error) {

            // print error, if any
            if (has_error)                
                LOG.error('socket closed due to error');	
            
            // if we've already fire disconnect for this socket, ignore it
            // NOTE: as both 'close' and 'end' event could cause this callback be called
            // so we need to prevent a 2nd firing of the disconnect callback to application
            if (socket.disconnected === true)
                return;
                
            LOG.debug('connection ended. remote host is ' + socket.host + ':' + socket.port);
            
            // notify application, if callback exists
            if (typeof onDisconnect === 'function')
                onDisconnect(socket);
                
            socket.disconnected = true;              
        }
        
        // NOTE:: if remote host calls 'disconnect' to send a FIN packet, 
        // this host will receive 'end'
        // see: http://nodejs.org/api/net.html#net_event_close_1
        socket.on('end', function () {
            LOG.debug('connection closed by remote host');
            // NOTE: should not end connection here, as default behavior would close it
            //       this allows still some messages to be sent over by this host,
            //       even if remote hosts closes the connection
            //socket.end();
        });
        
        // NOTE: this is called if an existing connection is fully closed (by itself or remote host)
        socket.on('close', disconnect_handler);
                
        // if there's error on the connection, 'close' will follow
        socket.on('error', function(err){
            LOG.error('socket error: ' + err);        
        });
         
		return socket;
    }
           
} // end net_nodejs()

// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = net_nodejs;