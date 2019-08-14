
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
    Logic for VAST Matcher that performs pub/sub recording & matching

    // basic callback / structure
    settings = {port}
    pos  = {x, y}
    addr = {host, port}
    area = {pos, radius}
    msg  = {from_id, size, type, data, is_reliable}  // message sent & received by clients
    sub  = {sub_id, subscriber, layer, aoi, relay}   // subscription info

    onSubscribed(result, subID)         // callback to receive subscribe result (success/fail)
    onNeighbors(list)                   // callback to receive neighbor (node) list
    onReceive(msg)                      // callback to receive any messages

    // constructor
    VAST_matcher()

    // basic functions

    // stat / accessors

    // state report

    history:
        2012-11-09              initial version (convert from VASTMatcher.h)
*/

require('./common');

var util = util || require('./common/util');

// voronoi computation
var Voronoi = require('./voronoi/vast_voro');

// config

function VAST_matcher(von_peer) {

    // function to create a new net layer
    var _init = this.init = function (self_id, port, onDone) {
    LOG.layer("Matcher::init called", -1);

    _state = VAST.state.INIT;

    self_id = self_id || VAST.ID_UNASSIGNED;
    _self.id = self_id;

    LOG.layer("Matcher::init => _self.id set to " + _self.id, _self.id);

    port = port || VAST_DEFAULT_PORT;

    LOG.layer("Matcher::init => port set to " + port, _self.id);

    _msg_handler = _von_peer.getHandler();

    // NOTE: this will cause initStates() be called
    // NOTE: this requires packetHandler, connHandler, disconnHandler and visualComm
    _msg_handler.addHandler(_that);

    // notify done
    if (typeof onDone === 'function')
        onDone(_msg_handler.getAddress());
}

    this.join = function (gw_addr, aoi, onDone) {
        LOG.layer("matcher::join => join called");
        if (_state === VAST.state.JOINED) {
            LOG.layer("matcher::join => matcher already joined the overlay", _self.id);
            if (typeof onDone === 'function')
                onDone(_self.id);
            return;
        }

        _state = VAST.state.JOINING;

        LOG.layer("matcher::join => called, self: " + _self.id + " getID: " + _getID(), _self.id);

        // store the gateway address
        var addr = new VAST.addr();
        addr.parse(gw_addr);

        LOG.layer("matcher::join => gateway set to " + addr.toString(), _self.id);

        if (aoi === undefined) {
            aoi = new VAST.area();
        }

        _join_onDone = onDone;

        LOG.layer("matcher::join => Position set to " + aoi.toString(), _self.id);

        // store initial position
        // TODO: how to store position? should it be a region?
        _self.aoi.update(aoi);

        // if gateway matcher, initialise as gateway matcher, else contact gateway matcher to position myself
        LOG.layer("matcher::join => InitMatcher", _self.id);
        _initMatcher();
    }

    this.sub = function ()

    var _query = this.query = function (contact_id, center, msg_type, msg_para) {
        LOG.layer('matcher::query => matcher will contact node [' + contact_id + '] to find acceptor', _self.id);

        var msg = {
            pos: center,
            type: msg_type,
            para: msg_para
        }

        //send out query request
        _sendMessage(contact_id, Matcher_msg.QUERY, msg, VAST.priority.HIGHEST, true, LAYER.MATCHER);
    }

    var _initMatcher = function () {
        LOG.layer("matcher::initMatcher => get ID and insert into local view", _self.id);
        _self.id = _getID();

        var addr = _msg_handler.getAddress();

        // insert self into local view
        _insertMatcher(_self);

        // TODO: Set up visual for this

        // Setup done, waiting for neighbour information from VON layer
        _setJoined();
    }

    // set current node to be 'joined'
    var _setJoined = function () {
        _state = VAST.state.JOINED;

        if (typeof _join_onDone === 'function')
            _join_onDone(_self.id, _msg_handler);

        return true;
    }

    // check whether two clients reside in the same position
    var _isOverlapped = function (checkPos, checkID) {
        // check position against neighbours for overlap
        LOG.layer(_neighbours);
        for (var id in _neighbours) {
            var pos = _neighbours[id].aoi.center;
            if (pos.equals(checkPos) && id != checkID) {
                LOG.layer("Overlap detected", _self.id);
                return true;
            }
        }
        LOG.warn("no overlap");

        return false;
    }

    // move position slightly so that there is no overlap
    var _adjustPos = function (pos, id) {
        do {
            // adjust position randomly between -0.1 and 0.1
            pos.x += Math.random()-0.1;
            pos.y += Math.random()-0.1;

            // make sure the pos is within boundaries of region
            pos = _bound(pos);
            LOG.layer("Position adjusted to ("+pos.x+","+pos.y+")", _self.id);
        } while (_isOverlapped(pos, id));

        return pos;
    }

    // check that node is within the bounds of the bbox
    var _bound = function (pos) {
        var bbox = _voro.get_bounding_box();
        if (pos.x < bbox.xl+0.5)         pos.x = bbox.xl;
        if (pos.y < bbox.yt+0.5)         pos.y = bbox.yt;
        if (pos.x > bbox.xr-0.5)         pos.x = bbox.xr;
        if (pos.y > bbox.yb-0.5)         pos.y = bbox.yb;
        return pos;
    }

    var _contains = function (subPos, nodePos) {
        var dx = subPos.center.x-nodePos.center.x;
        var dy = subPos.center.y-nodePos.center.y;
        var dr = Math.sqrt(Math.pow(dx,2) + Math.pow(dy,2));
        var radius = subPos.radius + nodePos.radius;
        if (dr <= radius) {
            return true;
        }
        return false;
    }

    /*
        subscription maintain
    */
    // create a new subscriber instance at this VASTMatcher
    var _addSubscription = function (sub, is_owner) {
        // do not add if there's an existing subscription
        if (_subscriptions.hasOwnProperty(sub.id))
            return false;

        // record a new subscription
        _subscriptions[sub.id] = sub;

        return true;
    }

    // remove subscription
    var _removeSubscriptions = function (sub_ID) {

    }

    // update a subscription content
    var _updateSubscription = function(sub_ID, new_aoi, sendtime, is_owner) {

    }

    //check if a disconnecting host contains subscribers
    var _subscriberDisconnected = function(host_id) {

    }


    /*
        check helpers
    */

    // checks if ID is my ID
    var _isSelf = function (id) {
        LOG.layer("Checking if self " + id);
        return (_self.id == id);
    }

    // check if a given ID is an existing neighbor
    var _isNeighbor = this.isNeighbor = function (id) {
        LOG.layer("Checking if neighbour: " + id);
        return _neighbours.hasOwnProperty(id);
    }

    /*
        send messages to matchers
    */

    /*
        matcher node handlers
    */

    var _insertMatcher = this.insertMatcher = function (node) {
        LOG.layer("matcher::insertMatcher => insert matcher into the local view", _self.id);

        // first check for an overlap before inserting into voronoi
        if (_isOverlapped(node.aoi.center, node.id)) {
            LOG.layer("matcher::insertMatcher => Adjusting local position for client [" + id + "] before inserting into voronoi", _self.id);
            node.aoi.center.update(_adjustPos(node.aoi.center,node.id));
        }

        LOG.layer("Inserting into voronoi");
        // store the new matcher
        if (!_voro.insert(node.id, node.aoi.center)) {
            LOG.layer("matcher::insertMatcher => insert matcher failed", _self.id);
            return false;
        }

        // store matcher into neighbour list
        _neighbours[node.id] = node;
        LOG.layer("matcher::insertMatcher => Neighbour list after insert");
        LOG.layer(_neighbours);

        return true;
    }

    var _updateMatcher = this.updateMatcher = function (node) {
        LOG.layer("I'm meant to be updating the matcher info here");
    }

    var _contactNewMatchers = this.contactNewMatchers = function () {
        LOG.layer("matcher::contactNewMatchers => starting the contacting of newly received matcher info");
        LOG.layer(_new_neighbours);
        // check if any new neighbors to contact
        if (Object.keys(_new_neighbours).length === 0)
            return;

        //
        // new neighbor notification check
        //
        var new_list = [];      // list of new, unknown nodes
        var target;

        // loop through each notified neighbor and see if it's unknown
        for (var target in _new_neighbours) {
            LOG.layer("matcher::newNeighbours => looking at target ID: " + target);

            // NOTE: be careful that 'target' is now of type 'string', not 'number'
            var new_node = _new_neighbours[target];

            // ignore self
            if (_isSelf(new_node.id))
                continue;

            // update existing info if the node is known, otherwise prepare to add
            if (_isNeighbor(new_node.id))
                _updateMatcher(new_node);
            else {
                LOG.layer("matcher::contactNewMatchers => adding new node:");
                LOG.layer(new_node);
                // insert to Voronoi and get ready to propogate it to make contact with them
                _insertMatcher(new_node);
                new_list.push(new_node.id);
            }
        }


    }

    var _sendRelevantSubs = this.sendRelevantSubs = function (target) {
        if (!_neighbours.hasOwnProperty(target)) {
            LOG.error("matcher::sendRelevantSubs => neighbour " + target + " is no longer a neighbour. Ignore relevant subs request");
            return false;
        }

        // get neighbour node information in temporary variable
        var neighbour = _neighbours[target];

        var relevant_subs = {}

        // run through list of subscriptions and check for relevant ones to neighbour
        for (var key in _subscriptions) {
            if (_contains(_subscriptions[key].aoi, neighbour.aoi)) {
                relevant_subs[key] = _subscriptions[key];
            }
        }

        _sendMessage(target, MATCHER.SUB_TRANSFER, relevant_subs, VAST.priority.NORMAL, true, LAYER.MATCHER);
    }

    var _packetHandler = this.packetHandler = function (from_id, pack) {

        LOG.layer('matcher::packetHandler => [' + _self.id + '] ' + Matcher_string[pack.type] + ' from [' + from_id + '], neighbor size: ' + Object.keys(_neighbours).length, _self.id);


        switch (pack.type) {

            // receive a list of nodes that matcher should be aware of
            case Matcher.NODE: {
                var nodelist = pack.msg;
                LOG.layer("matcher::packetHandler::NODE => receiving information about nodes. Number of nodes: " + nodelist.length);
                LOG.layer(pack);
                for (var i = 0; i < nodelist.length; i++) {
                    // check the node to make sure that the information is legitimate
                    if (nodelist[i].id === undefined ||
                        nodelist[i].endpt === undefined ||
                        nodelist[i].aoi === undefined) {
                            LOG.layer("matcher::packetHandler => nodelist node has invalid data: "+nodelist[i].msg);
                            // TODO: create error message that gets information again
                            break;
                    }

                    //extract message
                    var new_node = new VAST.node();
                    new_node.parse(nodelist[i]);

                    LOG.layer('matcher::packetHandler => node ' + new_node.toString(), _self.id);

                    // store the new node and process later
                    // if there's existing notification, then replace only if newer
                    if (_new_neighbours.hasOwnProperty(new_node.id) === false ||
                        _new_neighbours[new_node.id].time <= new_node.time) {

                        LOG.layer('matcher::packetHandler => adding node id [' + new_node.id + '] type: ' + typeof new_node.id, _self.id);

                        _new_neighbours[new_node.id] = new_node;
                    }
                }
                _contactNewMatchers();
            }
                break;

            case MATCHER.HELLO : {
                LOG.layer("matcher::HELLO => receiving information about neighbour node");
                var node = pack.msg;

                _insertMatcher(node);

                _sendRelevantSubs(node.id);

                // TODO: send back information about subscriptions
            }
                break;

            case MATCHER.SUB_TRANSFER: {
                LOG.layer("matcher::subTransfer => receiving subscriptions from [" + from_id + "]", _self.id);
                var sub_list = pack.msg;

                // insert subscriptions into local list
                for (var key in sub_list) {
                    var sub = sub_list[key];
                    var is_owner = sub.host_id == _self.id ? true : false;
                    LOG.layer("matcher::sub_transfer => adding sub : " + sub, _self.id);
                    _addSubscription(sub, is_owner);
                }
            }
                break;

            default: {
                LOG.layer("matcher::packetHandler => Packet successfully received");
                LOG.layer(pack);
            }
                break;
        }

        return true;
    }

    var _connHandler = this.connHandler = function () {

    }

    var _disconnHandler = this.disconnHandler = function () {

    }

    // var visualComm = this.visualComm = function (type, message) {}

    /*
        Instantiation functions and variables
    */

    // clean up all internal states for a new fresh join
    var _initStates = this.initStates = function (msg_handler) {
        LOG.layer ("Matcher::initStates => initStates called", _self.id);

        if (_msg_handler != undefined) {
            LOG.layer('VAST_matcher initStates called with msg_handler, id: ' + _self.id, _self.id);

            // add convenience references
            _getID =        _msg_handler.getID,
            _disconnect =   _msg_handler.disconnect,
            _sendMessage =  _msg_handler.sendMessage,
            _sendPack =     _msg_handler.sendPack;
        }

        _state  = VAST.state.ABSENT;
        LOG.layer(_state);

        _neighbours = {};
        _new_neighbours = {};

        _voro = new Voronoi();

        _subscriptions = {};
    }

    /////////////////////
    // constructor
    //
    LOG.layer('matcher constructor called', -1);

    // list of subscriptions
    var _subscriptions;

    // list of neighbouring matchers
    var _neighbours;

    // list of new neighbouring matchers to contact
    var _new_neighbours;

    // the ID of the origin matcher (the gateway matcher)
    var _origin_id;

    // the ID of this matcher (coincides with VON peer. ID from the net layer)
    var _self = new VAST.node();

    // local copy of the voronoi diagram
    var _voro;

    // local reference to self
    var _that = this;

    // local reference to message handler
    var _msg_handler = undefined;

    // reference to matcher's VON peer
    var _von_peer = von_peer;

    // convenience references
    var _getID, _disconnect, _sendMessage, _sendPack, _join_onDone;

    // the state of the matcher
    var _state;

}

// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = VAST_matcher;
