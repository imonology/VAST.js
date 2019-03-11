
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
var util = require('../common/util');
var sizeof = require('object-sizeof');
//var VAST.ID_UNASSIGNED = 0;

var VON_Message_String = [
    'VON_BYE',
    'VON_PING',
    'VON_QUERY',
    'VON_JOIN',
    'VON_NODE',
    'VON_HELLO',
    'VON_HELLO_R',
    'VON_EN',
    'VON_MOVE',
    'VON_MOVE_F',
    'VON_MOVE_B',
    'VON_MOVE_FB'
];

//
// input:
//    onReceive(id, msg)       callback when a message is received
//    onConnect(id)            callback when a remote host connects
//    onDisconnect(id)         callback when a remote host disconnects
//    id                       optional assigned id
//
function vast_net(onReceive, onConnect, onDisconnect, visualComm, id, l_local_IP) {

    //
    // aux methods
    //

    // get & store local IP
    var _localIP = l_local_IP;
    //var _localIP = undefined;

    // return the host IP for the current machine
    this.getHost = function (onDone) {

        // if already available, return directly
        //NOTE: _localIP always defined right now, so this will always enter the if statement
        if (_localIP !== undefined) {
            return onDone(_localIP);
        };

        var hostname = os.hostname();
        LOG.debug('getHost called, hostname: ' + hostname, _self_id);

        // NOTE: if network is not connected, lookup might take a long, indefinite time
        require('dns').lookup(hostname, function (err, addr, fam) {

            if (err) {
                // BUG: this will break a network that is not local
                LOG.warn(err + '. Assign 127.0.0.1 to host', _self_id);
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

    // track whether a connection is happening for a specific id or not
    var connecting = [];

    // net_nodejs object for acting as server (& listen to port)
    var _server = undefined;

    // counter for assigning internal / local-only ids
    // TODO: this should be removed in future, or need to re-use id
    var _id_counter = (-1);

    // last packet received for duplicate packet testing
    var _previous_pack = undefined;

    // current latency
    var latency = 0;

    // bandwidth time and size
    var bandTime = 0;
    var bandwidth = 0;

    //
    // public methods
    //

    // store mapping between id to a host address
    // NOTE: mapping stored is from logical (app-layer) id to a host/port pair
    //       *not* mapping from host_id (physical-layer) to host/port pair
    this.storeMapping = function (id, addr) {
        LOG.debug('store mapping for [' + id + ']: ' + addr.toString(),_self_id);
        // simply replace any existing mapping
        _id2addr[id] = addr;
    }

    // switch an existing id to socket mapping
    var l_setID = this.setID = function (new_id, old_id) {

        // check if setting self id
        if (old_id === undefined) {
            LOG.warn('assigning id to net layer for 1st time: [' + new_id + ']',_self_id);
            _self_id = new_id;
        }
        // rename connection ID
        // NOTE: incoming only, as we should know the id of outgoing connections
        else if (_sockets.hasOwnProperty(old_id)) {

            LOG.debug('replacing old_id [' + old_id + '] with new_id [' + new_id + ']',_self_id);

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
            LOG.error('socket not connected for send target id: ' + id,_self_id);
            return false;
        }

        var socket = _sockets[id];

        var list = _msgqueue[id];

        // send out pending messages
        LOG.debug('[' + _self_id + '] l_sendPendingMessages to [' + id + '], msgsize: ' + list.length);

        for (var i=0; i < list.length; i++) {
            LOG.debug("Sending packet: " + list[i]);
            try {
                socket.write(list[i] + '\n');
            }
            catch (e) {
                LOG.debug('l_sendPendingMessages fail: ' + list[i], _self_id);
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
        //LOG.debug('mapping: ');
        //LOG.debug(_id2addr);

        if (_id2addr.hasOwnProperty(id) === false) {
            LOG.error('no send target address info for id: ' + id, _self_id);
            return;
        }

        // create a new out-going connection if not exist
        var conn = new l_net(
            //client ID
            _self_id,

            // receive callback
            _processData,

            // connect callback
            // NOTE: there will be a time gap between send() returns and when connect callback is called
            // therefore it's possible more messages have been sent to this endpoint before
            // the connect event is ever called
            function (socket) {
                LOG.debug('[' + id + '] connected', _self_id);
                //console.log('[' + id + '] connected to '+ _self_id);

                // store id to socket, so we can identify the source of received messages
                if (socket.hasOwnProperty(id) === true) {
                    console.log("Socket already has ID: " + socket.id);
                }
                socket.id = id;

                // store to socket list
                _sockets[id] = socket;
                if (id < 0) {
                    LOG.error('connected socket id < 0: ' + id, _self_id);
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
                LOG.debug('id: ' + id + ' disconnected', _self_id);
                //console.log('id: ' + id + ' disconnected from '+_self_id + " with socket id " + socket.id);

                // remove id
                delete socket.id;

                // remove from socket list
                delete _sockets[id];

                // remove all pending messages
                //console.log("_msgqueue for " + id + " deleted from " + _self_id + " from disconnect callback in connect function");
                delete _msgqueue[id];

                // notify disconnection
                if (typeof onDisconnect === 'function')
                    onDisconnect(id);
            },

            // error callback
            function (socket) {
                LOG.error('id: ' + id + ' erraneously disconnected from ' + _self_id, _self_id);
                //console.log('id: ' + id + ' erraneously disconnected from '+_self_id);

                // remove id
                delete socket.id;

                // remove from socket list
                delete _sockets[id];

                // remove all pending messages
                //console.log("_msgqueue for " + id + " deleted from " + _self_id + " in error callback");
                delete _msgqueue[id];

                // notify disconnection
                if (typeof onDisconnect === 'function')
                    onDisconnect(id);
            },

            // NOTE: Not entirely sure whether this is necessary or not
            // will visualiser ever need info from individual connections?
            // visualiser communication channel
            false
        );

        // make connection
        // NOTE: send will return immediately, so the actual send may not occur until later
        // it's possible that after returning, upper layer starts to send messages
        // NOTE: added callback to ensure double connection to a client doesn't happen
        // when two packets get sent within a very close time frame of each other
        conn.connect(_id2addr[id], id, function (id) {
            connecting[id] = false;
        });

        return true;

    }

    // send a message to an id
    var l_send = this.send = function (id_list, pack, is_reliable, onDone) {

        // default is reliable TCP transmission
        is_reliable = is_reliable || true;

        // attach sender id to message
        pack.src = _self_id;
        LOG.warn("Assign pack id: "+pack.src+" _self_id", _self_id);

        var action = new VAST.action(pack.type, VON_Message_String[pack.type], pack.src, pack.targets, pack.msg, "outgoing");
        _visualReturn("Message sent", action);

        var now = util.getTimestamp();
        pack.sendTime = now;

        // serialize string
        var encode_str = JSON.stringify(pack);

        var target_list = '';

        // go through each target id to send
        for (var i=0; i < id_list.length; i++) {
            var id = id_list[i];

            // check if there's existing connection, or id to address mapping
            if ((i+1) != id_list.length){
                target_list += (id + ',');
            } else {
                target_list += id;
            }

            // check if it's a self message
            if (id === _self_id) {

                LOG.warn('send message to self [' + _self_id + ']', _self_id);
                // pass message to upper layer for handling
                if (typeof onReceive === 'function') {
                    onReceive(_self_id, pack);
                }
                continue;
            }

            // store message to queue
            // create queue for connection if not exist
            if (_msgqueue.hasOwnProperty(id) === false) {
				LOG.warn('msgqueue for [' + id + '] does not exist, create one...', _self_id);
    			//console.log('msgqueue for [' + id + '] does not exist for ' + _self_id + ', create one...');
                _msgqueue[id] = [];
			}

			 // store message to pending queue
            _msgqueue[id].push(encode_str);

            // if connections already exists, send directly, otherwise establish new connection
            if (_sockets.hasOwnProperty(id)) {
				LOG.warn('socket for [' + id + '] exists, send directly...', _self_id);
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
                    LOG.warn('[' + _self_id + '] attempts to connect to [' + id + '] sock_size: ' + sock_size, _self_id);
                    //LOG.warn(str);
                }

                //check to make sure that the socket is not in the process of connecting already
                if (!connecting[id]) {
				    LOG.warn('socket for [' + id + '] does not exist, try to connect...', _self_id);
                    connecting[id] = true;
                    l_connect(id);
                }
            }
        }

        LOG.debug('[' + _self_id + '] SEND to [' + target_list + ']: ' + encode_str, _self_id);
    }

    // start a server at a given port
    this.listen = function (port, onDone) {

        if (port === undefined || port < 0 || port >= 65536) {
            LOG.error('port not provided, cannot start listening', _self_id);
            if (typeof onDone === 'function')
                onDone(0);
            return;
        }

        // open server
        _server = new l_net(
            //client ID
            _self_id,

            // receive callback
            _processData,

            // connect callback
            function (socket) {

                LOG.warn('new socket connected, id: ' + socket.id, _self_id);

                // check if id doesn't exist, indicate it's unassigned
                if (socket.hasOwnProperty(id) === false) {
                    socket.id = _id_counter--;
                    //LOG.warn('assigning id: ' + socket.id);
                }

                // record this socket
                // NOTE: this is an important step, otherwise a server will not be
                // able to respond to incoming clients
                // BUG: creates two connections at a time but only disconnects one
                _sockets[socket.id] = socket;

                // notify connection
                if (typeof onConnect === 'function')
                    onConnect(socket.id);
            },

            // disconnect callback
            function (socket) {
                //('disconnet occur');

                // notify disconnection
                if (typeof onDisconnect === 'function')
                    onDisconnect(socket.id);
            },

            // error callback
            function (socket) {
                LOG.error('id: ' + id + ' disconnected from ' + _self_id + " with socket ID of " + socket.id, _self_id);

                var temp_ID = socket.id;

                // remove id
                delete socket.id;

                // remove from socket list
                delete _sockets[temp_ID];

                // remove all pending messages
                //console.log("_msgqueue for " + id + " deleted from " + _self_id + " in error callback in server");
                delete _msgqueue[temp_ID];

                // notify disconnection
                if (typeof onDisconnect === 'function')
                    onDisconnect(temp_ID);
            },

            // communication channel for visualiser
            function (type,request) {
                // forward request up a level
                visualComm(type,request);
            }
        );

        // handler of the result of listening
        var listen_handler = function (port_binded) {

            // check for success
            if (port_binded != 0) {
                LOG.warn('port bind successful: ' + port_binded, _self_id);
                // return the actual port binded
                if (typeof onDone === 'function')
                    onDone(port_binded);
                return;
            }

            port++;
            LOG.debug('retrying next port: ' + port, _self_id);

            // re-try
            setTimeout(function () {
                _server.listen(port, listen_handler);
            }, 10);
        };

        _server.listen(port, listen_handler);
    }

    // receive data for visualiser and forward
    var _visualReturn = this.visualReturn = function (type,data) {
        _server.visualReturn(type,data);
    }

    // close a server
    this.close = function () {
        if (_server === undefined)
            LOG.error('vast_net: server not started, cannot close', _self_id);
        else {
            _server.close();
            _server = undefined;
        }
    }

    // remove an existing connection
    this.disconnect = function (id) {

        if (_sockets.hasOwnProperty(id)) {
            LOG.debug('disconnect conn id: ' + id, _self_id);
            _sockets[id].disconnect();
            delete _sockets[id];
            //console.log("_msgqueue for " + id + " deleted from " + _self_id + " in disconnect event");
            delete _msgqueue[id];
        }
        else {
            LOG.debug('cannot find id [' + id + '] to disconnect', _self_id);
            return false;
        }
        return true;
    }


    //
    // private methods
    //

	var _processData = function (socket, data) {

        //LOG.warn('processData, socket.id: ' + socket.id);

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
                LOG.error('str is undefined, recv_buf: ' + socket.recv_buf + ' from id: ' + socket.id, _self_id);
                continue;
            }

            // unpack packet
            var pack;

            try {
                // convert msg back to js_obj
                pack = JSON.parse(str);
            }
            catch (e) {
                LOG.error('msgHandler: convert to js_obj fail: ' + e + ' str: ' + str, _self_id);
                continue;
            }

            // if pack is invalid
            if (pack.hasOwnProperty('src') === false ||
                pack.hasOwnProperty('type') === false ||
                pack.hasOwnProperty('msg') === false) {
                LOG.error('[' + _self_id + '] invalid packet to process: ' + str, _self_id);
                continue;
            }

            // determine latency of sent packet (requires computers to be manually synschornised currently)
            // TODO: remote computer time synchronisation (timesync npm module)
            var now = util.getTimestamp();
            pack.time = now;

            pack.latency = pack.time-pack.sendTime;

            // Determine bandwidth time and size
            if (bandTime == 0) {
                bandTime = now;
            }

            if ((now - bandTime) <= 1000) {
                bandwidth += sizeof(pack);
            } else {
                pack.bandwidth = bandwidth;
                bandTime = now;
                bandwidth = 0;
            }

            // NOTE: possible that duplicate packets can still get through if there are different packets
            // sent in between duplicate packets.
            // TODO: Make a more robust system that captures packets within a window and checks for duplication
            // (linked list or tree maybe)
            if (_previous_pack != undefined) {
                if (pack.type == _previous_pack.type &&
                    pack.src == _previous_pack.src &&
                    (pack.time-_previous_pack.time) <= 100) {
                        for (var keys in pack.targets) {
                            if (pack.targets[keys] == _previous_pack.targets[keys]) {
                                var msg = typeof pack.msg.toString === 'function' ? pack.msg.toString() : pack.msg;
                                LOG.debug("Duplicate packet identified: src: " + pack.src
                                    + " type: " + VON_Message_String[pack.type]
                                    + " targets: " + pack.targets
                                    + " time: " + (pack.time-_previous_pack.time)
                                    + " msg: " + pack.msg
                                );
                                /*
                                console.log("Duplicate packet identified: src: " + pack.src
                                    + " type: " + VON_Message_String[pack.type]
                                    + " targets: " + pack.targets
                                    + " time: " + (pack.time-_previous_pack.time)
                                    + " msg: " + pack.msg
                                );
                                */
                                continue;
                            }
                        }
                    }
            }

            LOG.debug("Sender's socket ID: " + socket.id, _self_id);
            LOG.debug('RECV from [' + pack.src + ']: ' + str, _self_id);

            _previous_pack = pack;

            if (socket.hasOwnProperty('id') === false) {
                LOG.warn('socket has no id assigned yet...assigning: ' + pack.src, _self_id);
                socket.id = parseInt(pack.src);
            }

            var remote_id = socket.id;

            // check if remote connection sends in its ID initially
            // NOTE: this check should be performed only once
            // NOTE: as this check is before receiving new ID from remote host,
            //       the first node joining the system will be given the gateway's ID (1)
            if (remote_id < VAST.ID_UNASSIGNED) {

                var sender_id = parseInt(pack.src);

                LOG.debug('[' + _self_id + '] learns sender id: ' + sender_id, _self_id);


                LOG.debug('Sockets');
                for (var sock_id in _sockets)
                    LOG.debug(sock_id);


                // store the remote ID as remote host's socket ID
                if (sender_id !== VAST.ID_UNASSIGNED) {

                    // if ID exists, then there's already an established connection
                    if (_sockets.hasOwnProperty(sender_id) === true) {
						var size = Object.keys(_sockets).length;
                        LOG.warn('[' + _self_id + '] redundent socket already exists: ' + sender_id + ' sock size: ' + size, _self_id);
						for (var sock_id in _sockets)
							LOG.warn(sock_id, _self_id);

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
				LOG.warn('[' + _self_id + '] process pack by upper layer from [' + remote_id + ']: ', _self_id);
				//LOG.warn(pack);
                // TODO: queue-up message to be processed later?
                onReceive(remote_id, pack);
            }
        }
    };

} // end vast_net()

// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = vast_net;
