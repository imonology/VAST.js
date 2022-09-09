
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
    A generic network wrapper for communicating real-time messages with remote hosts

    supported functions:
    
    // basic callback / structure
    addr = {host, port}
    onReceive(id, msg)
    onConnect(id)
    onDisconnect(id)
    
    // constructor
    vast_net(onReceive, onConnect, onDisconnect);
    
    // basic functions
    storeMapping(id, addr)              store mapping from id to a particular host IP/port
    setID(new_id, old_id)               set self ID or change the id -> socket mapping for incoming connections
    getID()                             get self ID (which may be assigned by remote host)
    send([id], msg, reliable, onDone)   send a message to a target 'id', initiate connection as needed
    listen(port, onDone)                start a server at a given 'port', port binded is returned via 'onDone', 0 indicates error
    close()                             close a server
    disconnect(id)                      disconnect connection to a remote node
        
    // socket related
    id = openSocket(addr, onReceive);
    closeSocket(id);
    sendSocket(id, msg);
    
    // aux helper methods (info from physical host)
    getHost(onDone);
    
    // state check methods
    isJoined();
    isPublic();
    isEntry(id);
    isConnected(id);
    isSocketConnected(id);
   
    history:
        2012-06-29              initial version (from VASTnet.h)
        2012-07-05              first working version (storeMapping, switchID, send)
        2012-07-20              rename switchID -> setID (can set self ID)
*/

var os = require('os');
var l_net = require('./net_nodejs');   // implementation-specific network layer
//var VAST.ID_UNASSIGNED = 0;

//
// input: 
//    onReceive(id, msg)       callback when a message is received
//    onConnect(id)            callback when a remote host connects
//    onDisconnect(id)         callback when a remote host disconnects
//    id                       optional assigned id
//
function vast_net(_localIP, onReceive, onConnect, onDisconnect, id) {

    //
    // aux methods
    //
   
    // return the host IP for the current machine
    this.getHost = function (onDone) {

        // if already available, return directly
        if (_localIP !== undefined)
            return onDone(_localIP);
    
        var hostname = os.hostname();
        //LOG.debug('getHost called, hostname: ' + hostname);
                                      
        // NOTE: if network is not connected, lookup might take a long, indefinite time                       
        require('dns').lookup(hostname, function (err, addr, fam) {
            
            if (err) {
                //LOG.warn(err + '. Assign 127.0.0.1 to host');
                _localIP = "127.0.0.1";
            }
            else 
                _localIP = addr;
            
            onDone(_localIP);
        })          
    }
    
    //
    // constructor
    //

    // id for myself, created by an id_generator, if available
    var _self_id = id || VAST.ID_UNASSIGNED;
    
    // mapping between id and address
    // TODO: clear mapping once in a while? (for timeout mapping)    
    var _id2addr = {};
    
    // records for connections 
    var _sockets = {};
        
    // queue to store messages pending out-transmission after connection is made
    var _msgqueue = {};
    
    // net_nodejs object for acting as server (& listen to port)
    var _server = undefined;
    
    // counter for assigning internal / local-only ids
    // TODO: this should be removed in future, or need to re-use id
    var _id_counter = (-1);
    
    // 
    // public methods
    // 
       
    // store mapping between id to a host address
    // NOTE: mapping stored is from //LOGical (app-layer) id to a host/port pair
    //       *not* mapping from host_id (physical-layer) to host/port pair
    this.storeMapping = function (id, addr) {
        //LOG.debug('store mapping for [' + id + ']: ' + addr.toString());
        // simply replace any existing mapping
        _id2addr[id] = addr;        
    }
	
    // switch an existing id to socket mapping
    var l_setID = this.setID = function (new_id, old_id) {
    
        // check if setting self id
        if (old_id === undefined) {
            //LOG.warn('assigning id to net layer for 1st time: [' + new_id + ']');
            _self_id = new_id;
        }
        // rename connection ID 
        // NOTE: incoming only, as we should know the id of outgoing connections
        else if (_sockets.hasOwnProperty(old_id)) {
            
            //LOG.debug('replacing old_id [' + old_id + '] with new_id [' + new_id + ']');
        
            // set new ID for socket (very important for future incoming messages)            
            _sockets[old_id].id = new_id;
            
            _sockets[new_id] = _sockets[old_id];
            delete _sockets[old_id];                        
        }
        else
            return false;
            
        return true;
    }
    
    // get self ID (which may be assigned by remote host)
    this.getID = function () {
        return _self_id;
    }
    
    // actually sending the message (attaching '\n' to indicate termination)
    // send all messages in pending queue
    var l_sendPendingMessages = function (id) {
                
        // no messages to send
        if (_msgqueue.hasOwnProperty(id) === false || _msgqueue[id].length === 0)
            return false;
                
        // if target id does not exist, indicate error
        if (_sockets.hasOwnProperty(id) === false) {
            //LOG.error('socket not connected for send target id: ' + id);
            return false;
        }
                
        var socket = _sockets[id];
                
        var list = _msgqueue[id];
        
        // send out pending messages
        ////LOG.debug('[' + _self_id + '] l_sendPendingMessages to [' + id + '], msgsize: ' + list.length);
        
        for (var i=0; i < list.length; i++) {
        
            try {                                  
                socket.write(list[i] + '\n');
            }
            catch (e) {
                //LOG.debug('l_sendPendingMessages fail: ' + list[i]);
                if (typeof onError === 'function')
                    onError('send');            
                return false;
            }        
        }
                                      
        // clear queue
        _msgqueue[id] = [];                          
        return true;
    }
    
    // make a connection to a target id
    var l_connect = function (id) {

        // check if id to address mapping exist
        ////LOG.debug('mapping: ');
        ////LOG.debug(_id2addr);
        
        if (_id2addr.hasOwnProperty(id) === false) {
            //LOG.error('no send target address info for id: ' + id); 
            return;
        }
    
        // create a new out-going connection if not exist        
        var conn = new l_net(
            
            // receive callback
            _processData, 
            
            // connect callback
            // NOTE: there will be a time gap between send() returns and when connect callbacak is called
            // therefore it's possible more messages have been sent to this endpoint before
            // the connect event is ever called
            function (socket) {
                //LOG.debug('[' + id + '] connected');
                
                // store id to socket, so we can identify the source of received messages
                socket.id = id;
                
                // store to socket list
                _sockets[id] = socket;
                if (id < 0) {
                    //LOG.error('connected socket id < 0: ' + id);
                }
                                                
                // notify connection
                if (typeof onConnect === 'function')
                    onConnect(id);
                
                // create queue for new socket if not exist
                // TODO: investigate why this happens (msgqueue should've already been init before this)
                // unless, a disconnect for this 'id' has occured
                // (so that means, before a new connection is made, another connection with the same remote host
                //  has been disconnected)
                if (_msgqueue.hasOwnProperty(id) === false) { 
                    var mq_size = Object.keys(_msgqueue).length;
                    var s_size = Object.keys(_sockets).length;
                    //LOG.error('[' + _self_id + '] msgqueue has no target [' + id + ']. should not happen, mq: ' + mq_size + ' sock: ' + s_size);
                    _msgqueue[id] = [];
                }
                                                
                l_sendPendingMessages(id);                    
            },
            
            // disconnect callback
            function (socket) {
                //LOG.debug('id: ' + id + ' disconnected');
                
                // remove id
                delete socket.id;
                
                // remove from socket list
                delete _sockets[id];
                
                // remove all pending messages
                delete _msgqueue[id];
                
                // notify disconnection
                if (typeof onDisconnect === 'function')
                    onDisconnect(id);                
            },

            // error callback
            function (type) {
                // TODO: do something?
            }
        );
        
        // make connection
        // NOTE: send will return immediately, so the actual send may not occur until later
        // it's possible that after returning, upper layer starts to send messages
        conn.connect(_id2addr[id]); 
                    
        return true;
    
    }
    
    // send a message to an id
    var l_send = this.send = function (id_list, pack, is_reliable, onDone) {
                
        // default is reliable TCP transmission
        is_reliable = is_reliable || true;

        // attach sender id to message
        pack.src = _self_id;
    
        // serialize string
        var encode_str = JSON.stringify(pack);
        
        var target_list = ''; 
        
        // go through each target id to send 
        for (var i=0; i < id_list.length; i++) {
            var id = id_list[i];
            
            // check if there's existing connection, or id to address mapping            
            target_list += (id + ',');
                              
            // check if it's a self message
            if (id === _self_id) {      
            
                //LOG.warn('send message to self [' + _self_id + ']');
                // pass message to upper layer for handling
                if (typeof onReceive === 'function') {                                    
                    onReceive(_self_id, pack);
                }    
                continue;
            }
                              
            // store message to queue
            // create queue for connection if not exist
            if (_msgqueue.hasOwnProperty(id) === false) {
				//LOG.warn('msgqueue for [' + id + '] not exist, create one...');
                _msgqueue[id] = [];        
			}
             
			 // store message to pending queue           
            _msgqueue[id].push(encode_str);     

            // if connections already exists, send directly, otherwise establish new connection 
            if (_sockets.hasOwnProperty(id)) {
				//LOG.warn('socket for [' + id + '] exists, send directly...');
                l_sendPendingMessages(id);
			}
            else {
                var str = '';
                var unknown_count = 0;
                for (var s in _sockets) {
                    str += (_sockets[s].id + ' ');
                    if (_sockets[s].id < 0)
                        unknown_count++;
                }
                
                var sock_size = Object.keys(_sockets).length;
                if (unknown_count > 5) {
                    //LOG.warn('[' + _self_id + '] attempts to connect to [' + id + '] sock_size: ' + sock_size);
                    ////LOG.warn(str);
                }

				//LOG.warn('socket for [' + id + '] not exiss, try to connect...');
                l_connect(id);
            }
        }
        
        //LOG.debug('[' + _self_id + '] SEND to [' + target_list + ']: ' + encode_str);                
    }
    
    // start a server at a given port
    this.listen = function (port, onDone) {
    
        if (port === undefined || port < 0 || port >= 65536) {
            //LOG.error('port not provided, cannot start listening');
            if (typeof onDone === 'function')
                onDone(0);
            return;
        }
    
        // open server 
        _server = new l_net(
            // receive callback
            _processData,
            
            // connect callback
            function (socket) {
            
                ////LOG.warn('new socket connected, id: ' + socket.id);

                // check if id doesn't exist, indicate it's unassigned
                if (socket.hasOwnProperty(id) === false) {
                    socket.id = _id_counter--; 
                    ////LOG.warn('assigning id: ' + socket.id);
                }
                                    
                // record this socket
                // NOTE: this is an important step, otherwise a server will not be 
                // able to respond to incoming clients
                _sockets[socket.id] = socket;
                                       
                // notify connection
                if (typeof onConnect === 'function')
                    onConnect(socket.id);    
            },
            
            // disconnect callback
            function (socket) {
                //console.//LOG('disconnet occur');
                
                // notify disconnection
                if (typeof onDisconnect === 'function')
                    onDisconnect(socket.id);
            },
            
            // error callback
            function (error_type) {
            
            }
        );
        
        // handler of the result of listening
        var listen_handler = function (port_binded) {
        
            // check for success
            if (port_binded != 0) {
                //LOG.warn('port bind successful: ' + port_binded);
                // return the actual port binded
                if (typeof onDone === 'function') 
                    onDone(port_binded);
                return;
            }
            
            port++;
            //LOG.debug('retrying next port: ' + port);
            
            // re-try
            setTimeout(function () {
                _server.listen(port, listen_handler);
            }, 10);
        };        
                
        _server.listen(port, listen_handler);        
    }
    
    // close a server
    this.close = function () {
        if (_server === undefined){
            //LOG.error('vast_net: server not started, cannot close');
        }
        else {
            _server.close();
            _server = undefined;
        }
    }    
    
    // remove an existing connection
    this.disconnect = function (id) {
    
        if (_sockets.hasOwnProperty(id)) {
            //LOG.debug('disconnect conn id: ' + id);
            _sockets[id].disconnect();
            delete _sockets[id];
            delete _msgqueue[id];
        }
        else {
            //LOG.debug('cannot find id [' + id + '] to disconnect');        
            return false;
        }
        return true;
    }
    
        
    //
    // private methods
    //
    
	var _processData = function (socket, data) {
        
        ////LOG.warn('processData, socket.id: ' + socket.id);
        
		// create buffer for partially received message, if not exist
        if (typeof socket.recv_buf === 'undefined')
            socket.recv_buf = '';

        // store data to buffer directly first
        socket.recv_buf += data;
        
        // start loop of checking for complete messages
        while (true) {
            
			// check if it's a complete message (termined with '\n')
            var idx = socket.recv_buf.search('\n');
        
			// if no complete message exists (ending with \n), stop
            if (idx === (-1))
				break;
                            
            // get new message and update buffer
            var str = socket.recv_buf.slice(0, idx);                       
            socket.recv_buf = socket.recv_buf.substr(idx + 1);
            
			// deliver this parsed data for processing
            if (str === undefined) {
                //LOG.error('str is undefined, recv_buf: ' + socket.recv_buf + ' from id: ' + socket.id);
                continue;
            }
            
            // unpack packet        
            var pack;
            
            try {
                // convert msg back to js_obj
                pack = JSON.parse(str);
            }
            catch (e) {
                //LOG.error('msgHandler: convert to js_obj fail: ' + e + ' str: ' + str);
                continue;
            }
            
            // if pack is invalid
            if (pack.hasOwnProperty('src') === false ||
                pack.hasOwnProperty('type') === false || 
                pack.hasOwnProperty('msg') === false) {
                //LOG.error('[' + _self_id + '] invalid packet to process: ' + str);
                continue;
            }
            
            //LOG.debug('RECV from [' + pack.src + ']: ' + str);            

            if (socket.hasOwnProperty('id') === false) {
                //LOG.warn('socket has not id assigned yet...assigning: ' + pack.src);
                socket.id = parseInt(pack.src);
            }
            
            var remote_id = socket.id;
            
            // check if remote connection sends in its ID initially 
            // NOTE: this check should be performed only once
            // NOTE: as this check is before receiving new ID from remote host,
            //       the first node joining the system will be given the gateway's ID (1)                
            if (remote_id < VAST.ID_UNASSIGNED) {
            
                var sender_id = parseInt(pack.src);
                                
                //LOG.debug('[' + _self_id + '] learns sender id: ' + sender_id);
                                    
                // store the remote ID as remote host's socket ID
                if (sender_id !== VAST.ID_UNASSIGNED) {

                    // if ID exists, then there's already an established connection                
                    if (_sockets.hasOwnProperty(sender_id) === true) {
						var size = Object.keys(_sockets).length;
                        //LOG.warn('[' + _self_id + '] redundent socket already exists: ' + sender_id + ' sock size: ' + size);
						for (var sock_id in _sockets){
							//LOG.warn(sock_id);
                        }
							                    
                        // disconnect remote host
                        // however, message still needs to deliver
                        //socket.end();
                    }
					else
						l_setID(sender_id, socket.id);

					remote_id = sender_id;
                }				
            }

            // pass message to upper layer for handling
            if (typeof onReceive === 'function') {           
				//LOG.warn('[' + _self_id + '] process pack by upper layer from [' + remote_id + ']: ');
				////LOG.warn(pack);
                // TODO: queue-up message to be processed later?
                onReceive(remote_id, pack);
            }            
        }
    };
        
} // end vast_net()

// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = vast_net;
