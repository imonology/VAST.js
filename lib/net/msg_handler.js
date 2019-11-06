
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
    msg_handler.js

    a simple class to dispatch incoming messages to registered handlers,
    while translating internal objects to outgoing message types (in JSON format)

    basic goals:
        - allow multiple instances of the message handler be created, each responsible for a different logic
        - allow a single network layer be used by multiple handlers
        - ease of development (handle writers need not know each other, can be independently plug in & out)
        - automatic dispatching to the right handler for message handling

    supported functions:

    // basic callback / structure
    addr = {host, port}
    l_onDone(addr)

    // constructor
    self_id         id for self node
    listen_port     port to listen/bind locally
    onDone          callback to notify when binding is finished

    // basic functions
    addHandler      add a new handler to message handler
    removeHandler   remove an existing handler from message handler
    sendMessage     send a javascript object to a SINGLE target node (given message 'type' and 'priority')
    sendPack        send a pack object to its destinated targets
    storeMapping    store mapping between id and address
    disconnect      disconnect from a particular host id
    close           stop the underlying network layer

    // accessors
    getAddress      get locally detected & binded network address
    getID           get unique ID for the net layer
    setID           set unique ID for the net layer

    history:
        2012-10-03              initial version
        2012-11-04              add addHandler/removeHandler methods
*/


function msg_handler(l_self_id, l_listen_port, l_local_IP, l_onDone) {

    //
    // public methods (usable by classes that inherent the msg_handler class)
    //

    //
    //  add a new handler to message handler, the handler should provide the following:
    //  connHandler         handler for connection event
    //  disconnHandler      handler for disconnection event
    //  packetHandler       handler to process a packet, return 'true' if success
    //

    this.addHandler = function (handler_class, layer) {

        // first check if they're all valid
        if (typeof handler_class.connHandler !== 'function') {
            LOG.error('addHandler: new handler does not have connHandler', l_self_id);
            return false;
        }

        if(typeof handler_class.disconnHandler !== 'function') {
            LOG.error('addHandler: new handler does not have disconnHandler', l_self_id);
            return false;
        }

        if(typeof handler_class.packetHandler !== 'function') {
            LOG.error('addHandler: new handler does not have packetHandler', l_self_id);
            return false;
        }

        if(typeof handler_class.initStates !== 'function') {
            LOG.error('addHandler: new handler does not have initStates', l_self_id);
            return false;
        }

        /*
        if (typeof handler_class.visualComm !== 'function') {
            LOG.error('addHandler: new handler does not have visualComm', l_self_id);
            return false;
        }
        */

        /*
        // store handlers
        if (!_handlers.hasOwnProperty(layer)) {
            _handlers[layer] = [];
        }
        */

        _handlers.push(handler_class);

        LOG.info("Calling initStates for handler_class");
        // store this msg_handler to the handler
        handler_class.initStates(this);

        return true;
    }

    // remove an existing handler from message handler
    this.removeHandler = function (handler, layer) {

        for (var i=0; i < _handlers[layer].length; i++)
            // handler found, remove it
            if (_handlers[layer][i] == handler) {
                _handlers[layer].splice(i, 1);
                return true;
            }

        // no matching handler found
        return false;
    }

    // send a javascript object to a collection of target nodes (given message 'type' and 'priority')
    this.sendMessage = function (target, msg_type, js_obj, priority, is_reliable, layer) {
        // create a delivery package to send
        var pack = new VAST.pack(
            msg_type,
            js_obj,
            priority,
            layer,
            l_self_id
        );
        LOG.debug("Pack");
        LOG.debug(pack);

        //attach targets to packet
        pack.targets.push(target);

        // convert pack to JSON or binary string
        return _that.sendPack(pack, is_reliable);
    }

    // send a pack object to its destinated targets
    this.sendPack = function (pack, is_reliable) {

        // do nothing if target is empty
        if (pack.targets.length === 0)
            return;
        // go through each target and send
        // TODO: optimize so only one message is sent to each physical host target
        //for (var i=0; i < pack.targets.length; i++)
        _net.send(pack.targets, pack, is_reliable);
        return true;
    }

    // Return data back to the visualiser
    var _visualReturn = this.visualReturn = function (type,data) {
        _net.visualReturn(type,data);
    }

    // send data to a client
    var _clientReturn = this.clientReturn = function (type, data) {
        _net.clientReturn(type, data);
    }

    // store a network id to address mapping
    this.storeMapping = function (id, addr) {
        return _net.storeMapping(id, addr);
    }

    // disconnect a remote host
    this.disconnect = function (id) {
        return _net.disconnect(id);
    }

    // stop the underlying network layer
    this.close = function () {
        return _net.close();
    }

    // get locally detected & binded network address
    this.getAddress = function () {
        return _localAddress;
    }

    // obtain self ID from network layer
    this.getID = function () {
        return _net.getID();
    }

    // set self ID to net layer
    this.setID = function (id) {
        return _net.setID(id);
    }


    //
    //  private methods (internal usage, some are replacable at inherited class)
    //

    var _net = undefined;           // a reference to vast_net

    // handlers registered to handle connect/disconnect/packet
    var _handlers = [];
    // var _handlers = {};

    // local IP & port
    var _localAddress = {host: l_local_IP, port: 0};

    // keep local reference for 'this'
    var _that = this;

    // NOTE: packet & message handlers cannot be of prototype-style,
    //       as they need to occupy memory independently for each msg handler instance

    // handler for incoming messages
    var _packetHandler = function (from_id, pack) {
        /*
        var layer = pack.layer;
        if (!_handlers.hasOwnProperty(layer))
        {
            LOG.error('[' + _net.getID() + '] no layer exists for packet: ' + JSON.stringify(pack), l_self_id)
            return false;
        }
        */

        // go through each packet handler and see which will handle it
        for (var i=0; i < _handlers.length; i++) {
            if (typeof _handlers[i].packetHandler === 'function' && i == pack.layer)
                if (_handlers[i].packetHandler(from_id, pack) === true) {
                    // successfully handle incoming packet, return
                    return true;
                }
        }

        LOG.error('[' + _net.getID() + '] no packet handler for packet: ' + JSON.stringify(pack), l_self_id);
        return false;
    }

    // handler for connection notification
    var _connHandler = function (id) {

        // notify each registered handler for connection
        for (var i=0; i < _handlers.length; i++) {
            if (typeof _handlers[i].connHandler === 'function')
                _handlers[i].connHandler(id);
        }
    }

    // handler for disconnection notification
    var _disconnHandler = function (id) {

        // notify each registered handler for disconnection
        for (var i=0; i < _handlers.length; i++) {
            if (typeof _handlers[i].disconnHandler === 'function')
                _handlers[i].disconnHandler(id);
        }
    }

    // handler for communication for the visualiser
    var _visualComm = function (type,message, handler) {
        // TODO: handle sending to all handlers
        if (_handlers[handler] !== undefined){
            _handlers[handler].visualComm(type,message);
        }
    }

    var _clientComm = function (type,data) {
        if (_handlers[1] !== undefined) {
            _handlers[1].connHandler(type,data);
        }
    }

    //
    // constructor (record or create a new vast_net layer)
    //

    // constructor
    LOG.debug('msg_handler init, l_self_id: ' + l_self_id, l_self_id);

    // create new net layer if does not exist
    //LOG.warn('creating new VASTnet... net: ' + typeof _net);

    // create network layer & start listening
    // NOTE: internal handlers must be defined before creating the VAST.net instance
    _net = new VAST.net(_packetHandler, _connHandler, _disconnHandler, _visualComm, _clientComm, l_self_id, l_local_IP);

    LOG.debug('calling getHost()', l_self_id);

    // create self object
    _net.getHost(function (local_IP) {

        LOG.debug('local IP: ' + local_IP, l_self_id);

        // store my locally detected IP
        _localAddress.host = local_IP;

        // return value is actual port binded
        _net.listen(l_listen_port, function (actual_port) {

            // store actual port binded
            _localAddress.port = actual_port;

            // notify port binding success
            if (typeof l_onDone === 'function')
                l_onDone(_localAddress);
        });
    });

} // end msg_handler

if (typeof module !== 'undefined')
	module.exports = msg_handler;
