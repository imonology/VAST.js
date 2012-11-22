
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
    addr = {host, port};
    CB_receive(id, msg);
    CB_connect(id);
    CB_disconnect(id);
    
    // constructor
    vast_net(CB_receive, CB_connect, CB_disconnect);
    
    // basic functions
    storeMapping(id, addr);     store mapping from id to a particular host IP/port
    setID(new_id, old_id);      set self ID or change the id -> socket mapping for incoming connections
    getID();                    get self ID (which may be assigned by remote host)
    send(id, msg, is_reliable); send a message to a target 'id'
    listen(port, CB_done);      start a server at a given 'port', port binded is returned via 'CB_done', 0 indicates error
    disconnect(id)              disconnect connection to a remote node
    
    // socket related
    id = openSocket(addr, recv_callback);
    closeSocket(id);
    sendSocket(id, msg);
    
    // aux helper methods (info from physical host)
    getHost(CB_done);
    
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

//require('../common.js');
var l_net = require('./net_nodejs');   // implementation-specific network layer
//var VAST_ID_UNASSIGNED = 0;

//
// input: 
//    CB_receive(id, msg)       callback when a message is received
//    CB_connect(id)            callback when a remote host connects
//    CB_disconnect(id)         callback when a remote host disconnects
//    id_generator()            generator callback to create new IDs (optional & used only at gateway)
//
function vast_net(CB_receive, CB_connect, CB_disconnect, id) {

    //
    // aux methods
    //
    
    // get & store local IP
    var _localIP = undefined;
    
    // return the host IP for the current machine
    this.getHost = function (CB_done) {

        var hostname = require('os').hostname();
        LOG.debug('getHost called, hostname: ' + hostname);
        
        // if already available, return directly
        if (_localIP !== undefined)
            return CB_done(_localIP);
                    
                    
        require('dns').lookup(hostname, function (err, addr, fam) {
            
            if (err) {
                LOG.warn(err + '. Assign 127.0.0.1 to host');
                _localIP = "127.0.0.1";
            }
            else 
                _localIP = addr;
            
            CB_done(_localIP);
        })        
    }
    
    //
    // constructor
    //

    // id for myself, created by an id_generator, if available
    var _self_id = (typeof id === 'undefined' ? VAST_ID_UNASSIGNED : id);
    
    // mapping between id and address
    // TODO: clear mapping once in a while? (for timeout mapping)    
    var _id2addr = {};
    
    // records for outgoing connections
    var _conn = {};
    
    // records for sockets of incoming connections
    // TODO: simpler approach? (store just _conn and no _sockets?)
    var _sockets = {};
    
    // queue to store messages pending transmission after connection is made
    var _msgqueue = {};
    
    // net_nodejs object for acting as server (& listen to port)
    var _server = undefined;
    
    // counter for assigning internal / local-only ids
    // TODO: this should be removed in future
    var _id_counter = (-1);
    
    // 
    // public methods
    // 
       
    // store mapping between id to a host address
    // NOTE: mapping stored is from logical (app-layer) id to a host/port pair
    //       *not* mapping from host_id (physical-layer) to host/port pair
    this.storeMapping = function (id, addr) {
        // simply replace any existing mapping
        _id2addr[id] = addr;        
    }
    
    // switch an existing id to socket mapping
    var l_setID = this.setID = function (new_id, old_id) {
        //LOG.debug('replacing old_id [' + old_id + '] with new_id [' + new_id + ']');
    
        // check if setting self id
        if (old_id === undefined) {
            _self_id = new_id;
        }
        // rename connection ID 
        // NOTE: incoming only, as we should know the id of outgoing connections
        else if (_sockets.hasOwnProperty(old_id)) {
                   
            _sockets[new_id] = _sockets[old_id];
            delete _sockets[old_id];
            
            // set new ID for socket (very important for future incoming messages)
            _sockets[new_id].id = new_id;
        }
        else
            return false;
            
        return true;
    }
    
    // get self ID (which may be assigned by remote host)
    this.getID = function () {
        return _self_id;
    }
    
    // send a message to an id
    var l_send = this.send = function (id, msg, is_reliable) {
    
        // default is reliable TCP transmission
        if (is_reliable === undefined)
            is_reliable = true;
            
        // actually sending the message (attaching '\n' to indicate termination)
        var send_msg = function (message) {

            LOG.debug('[' + _self_id + '] send_msg to [' + id + ']: ');
            LOG.debug(message);
        
            // if I'm a server, send via one of the recorded sockets
            if (_server !== undefined && _sockets.hasOwnProperty(id)) {
                //LOG.debug('send to in conn [' + id + ']');
                _server.send(message + '\n', _sockets[id]);
            }
            // if the target is available on an out-going channel
            else if (_conn.hasOwnProperty(id)) {
                //LOG.debug('send to out conn [' + id + ']');
                _conn[id].send(message + '\n');
            }
            // otherwise I should have a connection mapping
            else {
                LOG.error('no mapping exists for send target id: ' + id);
                return false;
            }
            
            return true;
        }
    
        // check if connections exist, if not then start to connect
        if (_sockets.hasOwnProperty(id) === true)
            return send_msg(msg);
            
        if (_conn.hasOwnProperty(id) === true) {
        
            // for outgoing connections, check if establish, if not then queue
            if (_conn[id].isConnected() === true)
                return send_msg(msg);
            
            // store message to queue
            LOG.debug('storing msg to msgqueue [' + id + '] msg: ' + msg);
            _msgqueue[id].push(msg);
            return true;
        }
             
        // check for id to address mapping
        if (_id2addr.hasOwnProperty(id) === false) {
            LOG.error('no send target address info for id: ' + id); 
            return false;
        }
        
        // create queue for new socket
        _msgqueue[id] = [];
        _msgqueue[id].push(msg);
                
        // create a new socket
        _conn[id] = new l_net(
            
            // receive callback
            _processData, 
            
            // connect callback
            function (socket) {
                LOG.debug('[' + id + '] connected');
                
                // store id to socket, so we can identify the source of received messages
                socket.id = id;
                                               
                // notify remote host of my id
                // TODO: replace with binary handshake (for efficiency)
                //_conn[id].send(_self_id + '\n');
                // DEBUG: when connections are made quickly, it's possible at this stage
                //        _conn[id] is not yet initialized so need to write directly
                //        however, calling 'write' here does not look clean
                socket.write(_self_id + '\n');
                
                // notify connection
                if (typeof CB_connect === 'function')
                    CB_connect(id);
                   
                // send out pending messages
                if (_msgqueue.hasOwnProperty(id)) {
                    var list = _msgqueue[id];
                    LOG.debug('msgqueue size for [' + id + ']: ' + list.length);
                    for (var i=0; i < list.length; i++)
                        send_msg(list[i]);
                 
                    // clear queue
                    _msgqueue[id] = [];
                }    
            },
            
            // disconnect callback
            function (socket) {
                LOG.debug('id: ' + id + ' disconnected');
                
                // remove id
                delete socket.id;
                
                // notify disconnection
                if (typeof CB_disconnect === 'function')
                    CB_disconnect(id);                
            },

            // error callback
            function (type) {
                // TODO: do something?
            }
        );
        
        // make connection
        _conn[id].connect(_id2addr[id]); 
                    
        return true;
    }
    
    // start a server at a given port
    this.listen = function (port, CB_done) {
    
        if (port === undefined || port < 0 || port >= 65536) {
            LOG.error('port not provided, cannot start listening');
            if (typeof CB_done === 'function')
                CB_done(0);
            return;
        }
    
        // open server 
        _server = new l_net(
            // receive callback
            _processData, 
            
            // connect callback
            function (socket) {

                // check if id doesn't exist, indicate it's unassigned
                if (typeof socket.id === 'undefined')
                    socket.id = _id_counter--;                    
                                    
                // record this socket
                // NOTE: this is an important step, otherwise a server will not be 
                // able to respond to incoming clients
                _sockets[socket.id] = socket;
                                       
                // notify connection
                if (typeof CB_connect === 'function')
                    CB_connect(socket.id);    
            },
            
            // disconnect callback
            function (socket) {
                //console.log('disconnet occur');
                
                // notify disconnection
                if (typeof CB_disconnect === 'function')
                    CB_disconnect(socket.id);
            },
            
            // error callback
            function (error_type) {
            
            }
        );
        
        // handler of the result of listening
        var listen_handler = function (port_binded) {
        
            // check for success
            if (port_binded != 0) {
                //LOG.debug('port bind successful: ' + port_binded);
                // return the actual port binded
                if (typeof CB_done === 'function') 
                    CB_done(port_binded);
                return;
            }
            
            port++;
            LOG.debug('retrying next port: ' + port);
            
            // re-try
            setTimeout(function () {
                _server.listen(port, listen_handler);
            }, 10);
        };        
                
        _server.listen(port, listen_handler);        
    }

    // remove an existing connection
    this.disconnect = function (id) {
    
        // if id belongs to an incoming socket
        if (_sockets.hasOwnProperty(id)) {
            LOG.debug('disconnect incoming socket for id: ' + id);
            _sockets[id].end();
            delete _sockets[id];
        }
        else if (_conn.hasOwnProperty(id)) {
            LOG.debug('disconnect outgoing socket for id: ' + id);
            _conn[id].disconnect();
            delete _conn[id];
            delete _msgqueue[id];
        }
        else {
            LOG.debug('cannot find id [' + id + '] to disconnect');        
            return false;
        }
            
        return true;
    }
    
        
    //
    // private methods
    //

    // new ID assignment
    var _new_ID = undefined;     
    var _assignNewID = function (socket) {

        // we use our own ID as first
        // NOTE if we start with VAST_ID_UNASSIGNED (0) then first ID will be 1
        if (_new_ID === undefined)
            _new_ID = _self_id + 1;
            
        LOG.debug('new ID assigned for socket: ' + socket.host + ':' + socket.port); 
        return _new_ID++;
    }
    
	var _processData = function (socket, data) {
        
        //console.log('vast_net id: ' + _self_id + ' processData: ' + data);
        
		// create buffer for partially received message, if not exist
        if (typeof socket.recv_buf === 'undefined') {
            //console.log('init recv_buf');
            socket.recv_buf = '';
        }
            
        // store data to buffer directly first
        socket.recv_buf += data;
        
        // start loop of checking for complete messages
        while (true) {

            //console.log('recv_buf: ' + socket.recv_buf);
            
			// check if it's a complete message (termined with '\n')
            var idx = socket.recv_buf.search('\n');
        
			// if no complete message exists (ending with \n), stop
            if (idx === (-1))
				break;
                            
            var str = socket.recv_buf.slice(0, idx);

			// deliver this parsed data for processing
            if (str !== undefined) {
                //LOG.debug('str: ' + str + ' from id: ' + socket.id);
    
                // check if remote connection sends in its ID initially 
                // NOTE: this check should be performed only once
                // NOTE: as this check is before receiving new ID from remote host,
                //       the first node joining the system will be given the gateway's ID (1)                
                if (socket.id < VAST_ID_UNASSIGNED) {
                    
                    // assume the first message is remote node's id
                    var remote_id = parseInt(str);
                    LOG.debug('remote id: ' + remote_id);
                    
                    // skip message if remote_id is invalid
                    // TODO: try to determine the cause & fix this 
                    // NOTE: if this happens, the message is simply ignored
                    if (isNaN(remote_id)) {
                        LOG.error('[' + _self_id + '] remote_id is NaN, str: ' + str + ' from socket id: ' + socket.id);                              
                    }
                    else {
                                       
                        // if remote id is not yet assigned, assign new one
                        if (remote_id === VAST_ID_UNASSIGNED) {
                            remote_id = _assignNewID(socket);
                            
                            // check if this is the first ever ID assigned by me
                            // if so, then I'm likely the gateway (my ID is also unassigned yet)
                            if (_self_id === VAST_ID_UNASSIGNED) {
                                LOG.warn('first ID assigned, likely I am the gateway');
                                _self_id = remote_id;
                            }
                            // notify remote node of its new ID
                            else {
                                LOG.debug('assign new ID [' + remote_id + '] to [' + socket.id + ']'); 
                                l_send(socket.id, remote_id);
                            }
                        }
                    
                        l_setID(remote_id, socket.id);
                    }                        
                }                
                // check if the message is a new ID assignment for me
                // NOTE: we assume the first message received is new id
                else if (_self_id === VAST_ID_UNASSIGNED) {
                    
                    var assigned_id = parseInt(str);
                    LOG.debug('assigned_id: ' + assigned_id);
                    _self_id = assigned_id;
                }           
                // otherwise is a real msg, notify custom callback of incoming data (if provided)
                else if (typeof CB_receive === 'function') {                    
                    //LOG.debug('recv from [' + socket.id + '] str: ' + str);
                    
                    // TODO: queue-up message to be processed later?
                    CB_receive(socket.id, str);
                }
            }
			// update buffer
            socket.recv_buf = socket.recv_buf.substr(idx + 1);
        }
    };
        
} // end vast_net()

// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = vast_net;
