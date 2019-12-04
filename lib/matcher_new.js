
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
    LOGic for VAST Matcher that performs pub/sub recording & matching

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
var point2d = require( "./voronoi/point2d.js" );
var segment = require("./voronoi/segment");
var record = require('./record');

// voronoi computation
var Voronoi = require('./voronoi/vast_voro');

// config
const DEFAULT_RADIUS = 10000;       // default radius given to a subscription that does not supply one.
const PENDING_INTERVAL = 50;        // interval for checking pending client reconnection possibility
const TICK_RATE = 50;               // tick rate for visualiser
const BOUNDARY_SIZE = 24            // size of boundary threshold before transferring clients
const NORMALISE_INTERVAL = 1000     // interval time for sending neighbours back towards original position
const MIN_DISTANCE = 5              // minimum allowed distance between matchers


function VAST_matcher(von_peer, client_threshold, sub_threshold) {

    const CLIENT_THRESHOLD = client_threshold;         // maximum number of clients that can be connected to the matcher
    const SUB_THRESHOLD = sub_threshold;                // the maximum number of subscriptions before asking neighbours for help

    var _init = this.init = function (self_id, port, onDone) {
        //LOG.setDisplay(true);
        LOG.layer("Matcher::init called", -1);

        _state = VAST.state.INIT;

        self_id = self_id || VAST.ID_UNASSIGNED;
        _self.id = self_id;

        _is_gateway = _self.id == VAST.ID_GATEWAY;

        LOG.layer("Matcher::init => _self.id set to " + _self.id, _self.id);

        port = port || VAST_DEFAULT_PORT;

        LOG.layer("Matcher::init => port set to " + port, _self.id);

        _msg_handler = _von_peer.getHandler();

        // NOTE: this will cause initStates() be called
        // NOTE: this requires packetHandler, connHandler, disconnHandler and visualComm
        _msg_handler.addHandler(_that);

        recorder = new record();

        // notify done
        if (typeof onDone === 'function')
            onDone(_msg_handler.getAddress());
    }

    this.join = function (entry_addr, aoi, onDone) {
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
        _entryAddr = new VAST.addr();
        _entryAddr.parse(entry_addr);
        _msg_handler.storeMapping(ENTRY_ID, _entryAddr);
         var data = {
            id:_self.id,
            position: aoi
        }

        LOG.layer("Position");
        LOG.layer(aoi);
        _clientReturn("ID", data);

        // start the data recorder
        recorder.init(_self.id+"-",'Data');
        LOG.debug(countdown);
        tickInterval = setInterval(_tick, TICK_RATE);

        LOG.layer("matcher::join => entry server set to " + _entryAddr.toString(), _self.id);

        if (aoi === undefined) {
            aoi = new VAST.area();
        }

        _join_onDone = onDone;

        LOG.layer("matcher::join => Position set to " + aoi.toString(), _self.id);

        // if gateway matcher, initialise as gateway matcher, else contact gateway matcher to position myself
        LOG.layer("matcher::join => InitMatcher", _self.id);
        _initMatcher(aoi);
    }

    var _sub = this.sub = function (clientID,aoi, channel, type, username) {
        LOG.layer("matcher::sub => subscribing " + clientID + ": " + username + " to " + aoi.toString() + " for channel " + channel);
        // check and make sure that aoi is of the correct type
        if (!aoi.hasOwnProperty("center") || !aoi.hasOwnProperty("radius")) {
            LOG.layer("matcher::sub => aoi is not of the correct type. Ignore subscription", _self.id);
            return false;
        }

        // create sub object
        var sub = new VAST.sub(_self.id, clientID, channel, aoi, type, username);

        _addSubscription(sub, true);
    }

    var _unsub = this.unsub = function (clientID, channel, username){
        LOG.layer("matcher::unsub => unsubscribing from " + channel + " for " + clientID + ": " + username);

        var aoi = new VAST.area();

        var sub = new VAST.sub(_self.id, clientID, channel, aoi, connections[clientID], username);

        if (!_subscriptions.hasOwnProperty(sub.subID)) {
            LOG.error("matcher::removeSubscriptions => sub with sub ID:" + sub.subID + " does not exist. Ignore.");
            return false;
        }

        sub = _subscriptions[sub.subID];
        _removeSubscriptions(sub);
    }

    var _pub = this.pub = function (clientID, player, aoi, message, channel, packetName, senderID, originID, oldTargets) {
        LOG.layer("matcher::pub => publishing packet from " + player + " on channel " + channel +" to " + aoi.toString());

        // create the publication pack with payload and username in the msg field
        var msg = {
            clientID: clientID,
            username:   player,
            payload:    message,
            aoi:        aoi,
            channel:    channel,
            packetName: packetName,
            oldTargets: [],
            originID: _self.id,
            senderID: senderID
        };

        LOG.layer("msg:");
        LOG.layer(msg);

        var pack = new VAST.pack(Matcher.PUB, msg, VAST.priority.HIGHEST, LAYER.MATCHER, clientID);

        var clientSend = [];

        // TODO: Check how sending to server from client and to client from server works
        // loop through subs to find which ones overlap with pub aoi
        for (var key in _subscriptions) {
            var sub = _subscriptions[key];

            LOG.layer("matcher::pub => sub:");
            LOG.layer(sub);

            LOG.layer(connections);

            var type = clientID == null ? "client" : connections[clientID];

            if (sub.id == clientID) {
                LOG.layer("matcher::pub => cannot send to self. SubID: " + sub.id + " clientID: " + clientID, _self.id);
                continue;
            }

            /*
            // skip if the sub is for the same type of connection
            if (sub.type == type) {
                LOG.layer("matcher::pub => " + sub.type + " cannot send to the same type");
                continue;
            }
            */

            // skip if it is not on the right channel
            if (sub.channel != channel) {
                LOG.layer("matcher::pub => channels do not match. Ignore sub");
                continue;
            }

            // if the publish area covers the subscription area then process it
            // TODO: Add publication propagation for when aoi is outside of region
            if (sub.aoi.covers(aoi)) {
                LOG.layer("matcher::pub => sub area covers aoi");
                // if we are not the host of the sub or if this is a propagated publication,
                // then send the publication to that matcher for them to process
                if (sub.host_id != _self.id && originID == _self.id) {
                    LOG.layer("matcher::pub => self ID does not match host_id", _self.id);
                    // add host to pack targets if hasn't already been added or hasn't been sent to before
                    LOG.layer(pack.targets);
                    if (!pack.targets.hasOwnProperty(sub.host_id) && !oldTargets.hasOwnProperty(sub.host_id)) {
                        LOG.layer("matcher::pub => adding [" + sub.host_id + "] to list of matchers to send to", _self.id);
                        pack.targets.push(sub.host_id);
                    }
                } else {
                    LOG.layer("matcher::pub => self ID matches host_id", _self.id);
                    // add id to list of clients to publish to
                    // don't add if it is already added and don't send it to the client publishing
                    if (!clientSend.hasOwnProperty(sub.id) && sub.id != clientID) {
                        LOG.error("matcher::pub => adding " + sub.id + " to the sending list and to the oldTargets list of the propagation pack", _self.id);
                        clientSend.push(sub.id);
                        pack.msg.oldTargets.push(sub.id);
                    }
                }
            } else {
                LOG.layer("matcher::pub => no intersection. Look at the next subscription");
            }
        }

        // TODO: This is an application-specific implementation. Devise an application-agnostic solution
        // NOTE: The same above in adding to clients to send to
        /*
        if (packetName != "HandshakePacket" && packetName != "EstablishConnectionPacket") {
            _sendPack(pack, true);
        } else LOG.layer("matcher::pub => do not forward LOGin packets to prevent LOGin to servers that aren't the host server.", _self.id);
        */
        LOG.layer("Sending packet to");
        LOG.layer(clientSend);

        // loop through client list to send to clients connected to this matcher
        for (var i = 0; i < clientSend.length; i++) {
            // create return data object and send to clients
            var returnData = {
                clientID: clientSend[i],
                payload: msg
            }
            LOG.layer("matcher::pub => returning data to net layer");
            _clientReturn("publish", returnData);
        }

    }

    var _leave = this.leave = function (clientID) {
        LOG.layer("matcher::leave => disconnecting client " + clientID, _self.id);

        // create a sub ID that may be associated with the client
        var sub;

        LOG.layer("matcher::leave => client2subID");
        LOG.layer(_client2subID);
        if (!_client2subID.hasOwnProperty(clientID)) {
            LOG.layer("matcher::leave => client does not exist. Exit disconnect sequence.", _self.id);
            return false;
        }

        for (var keys in _client2subID[clientID]) {
            var key = _client2subID[clientID][keys];
            sub = _subscriptions[key];
            _removeSubscriptions(sub);
            delete _client2subID[clientID][keys];
        }

        delete _client2subID[clientID];

        _visualReturn("matcher_leave", clientID);

        /*
        for (var key in _subscriptions) {
            if (_subscriptions[key].id == clientID && _subscriptions[key].host_id == _self.id) {
                sub = _subscriptions[key];
                _removeSubscriptions(sub);
            }
        }
        */

        // send disconnection message to neighbours
        if (connections.hasOwnProperty(clientID)) {
            var sendList = [];
            for (var id in neighbours) {
                LOG.layer("matcher::leave => adding " + id + " to list of matchers to send disconnect message to",_self.id);
                sendList.push(id);
            }

            if (sendList.length != 0) {
                LOG.layer("matcher::leave => sending disconnect message to all neighbours:", _self.id);
                LOG.layer(sendList, _self.id);
                var pack = new VAST.pack(Matcher.DISCONNECT, clientID, VAST.priority.NORMAL, LAYER.MATCHER, _self.id);
                pack.targets = sendList;
                _sendPack(pack, true);
            }
            delete connections[clientID];
        }

        LOG.layer("matcher::leave => finished disconnecting client from matcher",_self.id);
        return false;
    }

    var _move = this.move = function (clientID, aoi, channel, hostID) {
        LOG.layer("matcher::move => moving [" + clientID + "] to <" + aoi.center.x + "," + aoi.center.y + "> with radius " + aoi.radius);

        // generate subID of the subscriptions belonging to the moving client
        var subID = _generateSubID(clientID, hostID, channel);

        // check if subscription exists
        if (!_subscriptions.hasOwnProperty(subID)) {
            LOG.layer("matcher::move => subID " + subID + " does not exist. Cannot move client subscription", _self.id);
            return false;
        }

        LOG.debug("matcher::move => checking self");
        LOG.debug(_self.region);

        // check if the movement takes the subscription outside of this matcher's boundary region
        LOG.debug(_getNeighbourCount());
        if (!_self.region.within(aoi.center) && _getNeighbourCount() > 1) {
            var matcherID = _voro.closest_to(aoi.center);
            LOG.layer("matcher::move => transferring client [" + clientID + "] to matcher [" + matcherID + "]", _self.id);
            _transferClient(matcherID, clientID, subID);
            // don't need to update subscription here because the movement will be propagated to us
            return false;
        }

        var time = util.getTimestamp();

        if (_clients.hasOwnProperty(clientID)) {
            _clients[clientID].update(aoi,time);
        } else {
            for (var i=0; i < pendingClients.length; i++) {
                if (pendingClients[i].client.clientID == clientID)
                    pendingClients[i].client.update(aoi,time);
            }
        }

        _updateSubscription(subID, aoi, 0, true);
    }

    var _initMatcher = function (aoi) {
        LOG.layer("matcher::initMatcher => get ID and insert into local view", _self.id);
        _self.id = _getID();
        LOG.layer("matcher::initMatcher => ID: " + _self.id);

        var addr = _msg_handler.getAddress();
        addr = new VAST.endpt(addr.host, addr.port);

        LOG.layer("matcher::initMatcher => addr: ");
        LOG.layer(addr);
        _self.endpt.update(addr);
        _self.region.site.update(aoi.center);

        LOG.layer("matcher::initMatcher => matcher region updated " + _self.region.toString());

        // insert self into local view
        _insertMatcher(_self);

        LOG.layer("matcher::initMatcher => matcher inserted into local view");

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

    var _generateSubID = function (clientID, hostID, channel) {
        return (hostID + "-" + clientID + "-" + channel);
    }

    var _findSubID = function (clientID) {
        LOG.layer("matcher::findSubID => generating sub ID from client ID [" + clientID + "]" )
        for (var key in _subscriptions) {
            var sub = _subscriptions[key];
            if (clientID == sub.id)
                return sub.subID;
        }

        return "";
    }

    /*
        Positional functions
    */

    // check whether two clients reside in the same position
    var _isOverlapped = function (checkPos, checkID) {
        // check position against neighbours for overlap
        LOG.layer(_neighbours);
        for (var id in _neighbours) {
            var pos = _neighbours[id].region.site;
            if ((pos.equals(checkPos)) && id != checkID) {
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

    var _intersects = function (subPos, matcherRegion) {
        if (matcherRegion.intersects(subPos.center,subPos.radius))
            return true;

        return false;
    }

    var _nodeToMatcher = function (node) {
        LOG.layer("matcher::nodeToMatcher => node being converted to matcher: ", _self.id);
        LOG.layer(node);
        // initialise matcher object
        var matcher = new VAST.match(node.id, node.endpt, node.time,BOUNDARY_SIZE);
        LOG.layer("Matcher from node:");
        LOG.layer(matcher);

        var region = _voro.getRegion(matcher.id);

        if (region != undefined) {
            LOG.layer("matcher::nodeToMatcher => matcher is already inserted into the voronoi. Update with local view.", _self.id);

            matcher.region.update(region);
            matcher.region.convertingEdges();
        } else {
            LOG.layer("matcher::nodeToMatcher => matcher has not been added to the local view. Update manually", _self.id);
            matcher.region.init(node.aoi.center);
        }

        LOG.layer("New matcher:", _self.id);
        LOG.layer(matcher);

        return matcher;
    }

    var _checkOverlap = function (sub) {
        LOG.layer("matcher::checkOverlap => checking overlap for sub: " + sub.toString());
        // list of overlapping neighbours
        var overlap = [];
        var tempMatcher = undefined;

        // loop through regions and check for overlaps
        for (var key in _neighbours) {
            // don't check self region
            if (key == _self.id || sub.recipients.includes(parseInt(key)) || key == sub.host_id)
                continue;

            tempMatcher = _getMatcher(key);

            if (_intersects(sub.aoi, tempMatcher.region)) {
                overlap.push(parseInt(key));
            }
        }

        // send messages to overlapped regions
        if (overlap.length > 0) {
            LOG.layer("matcher:checkOverlap => " + overlap.length + " overlapping neighbours. Sending sub to them: " + overlap);
            for (var i = 0; i<overlap.length; i++)
                sub.recipients.push(overlap[i]);
            _subscriptions[sub.subID] = sub;
            LOG.layer("matcher:checkOverlap => sending sub message");
            var pack = new VAST.pack(Matcher.SUB_NOTIFY, sub, VAST.priority.NORMAL, LAYER.MATCHER, _self.id);
            pack.targets = overlap;
            _sendPack(pack,true);
        } else {
            LOG.layer("matcher::checkOverlap => There are no overlapping regions to send this subscription to");
        }
    }

    /*
        subscription maintain
    */

    // create a new subscriber instance at this VASTMatcher
    var _addSubscription = function (sub, is_owner) {
        LOG.layer("matcher::addSubscription => adding subscription to matcher.", _self.id);
        // do not add if there's an existing subscription
        if (_subscriptions.hasOwnProperty(sub.subID)) {
            LOG.layer("matcher::addSubscription => subscription already exists. Update instead");
            var date = new Date();
            var time = date.getTime();
            _updateSubscription(sub.subID,sub.aoi,time,is_owner);
            return false;
        }

        if (_subscriptions.length >= SUB_THRESHOLD) {
            LOG.layer("matcher::addSubscription => sub threshold reached. Asking for reprieve");
            _sendHelp();
        }

        if (!_client2subID.hasOwnProperty(sub.id)) {
            _client2subID[sub.id] = [];
        }

        // add to client's list of subs
        _client2subID[sub.id].push(sub.subID);

        // recreate sub so that internal functions that were lost in transfer over socket can be reestablished
        var new_sub = new VAST.sub();
        new_sub.parse(sub);

        // record a new subscription
        _subscriptions[new_sub.subID] = new_sub;

        // add type to connections for publication checking
        connections[new_sub.id] = new_sub.type;

        LOG.layer("matcher::addSubscription => connections:", _self.id);
        LOG.layer(connections, _self.id);

        LOG.layer("matcher::addSubscription => subscription successfully added. New subscription list:", _self.id);
        LOG.layer(_subscriptions);

        // check to see if the sub needs to be propogated to other matchers
        _checkOverlap(new_sub);

        return true;
    }

    // remove subscription
    var _removeSubscriptions = function (sub) {
        // make sure that the sub exists
        if (sub === undefined) {
            LOG.error("matcher::removeSubscriptions => subscription information is non-existent");
            return false;
        }

        // remove the subscription
        // and if I am the host ID, send remove subscription message to others
        if (sub.host_id == _self.id) {
            for (var i = 0; i<sub.recipients.length; i++)
                _sendMessage(sub.recipients[i], Matcher.SUB_REMOVE, sub, VAST.priority.NORMAL, true, LAYER.MATCHER);
        }

        LOG.layer("matcher::removeSubscription => removing subscription with ID " + sub.subID, _self.id);

        delete _subscriptions[sub.subID];

        LOG.layer("matcher::removeSubscription => subscription list after remove:");
        LOG.layer(_subscriptions);
    }

    // update a subscription content
    var _updateSubscription = function(sub_ID, new_aoi, sendtime, is_owner) {
        LOG.layer("matcher::updateSubscription => updating " + sub_ID + " with aoi ");
        LOG.layer(new_aoi);
        // check to see if we have a record of the subscription being updated
        if (!_subscriptions.hasOwnProperty(sub_ID)) {
            // TODO: add subscription here? after a check?
            LOG.layer("matcher::updateSubcription => no subscription with ID: " + sub_ID, _self.id);
            return false;
        }

        var sub = _subscriptions[sub_ID];

        LOG.layer("matcher::updateSubscription => is_owner: " + is_owner, _self.id);
        var hostID = is_owner ? _self.id : sub.host_id;

        // add old owner as recipient before changing host id
        if (is_owner && !sub.recipients.includes(sub.host_id) && sub.host_id != _self.id)
            sub.recipients.push(sub.host_id);

        var updateSub = new VAST.sub(hostID, sub.id, sub.channel, new_aoi, sub.type, sub.username, sendtime);

        sub.update(updateSub);

        var recipients = [];

        // create region edges
        if (_self.region.convertedEdges.length == 0) {
            _self.region.update(_voro.getRegion(_self.id));
            _self.region.convertingEdges();
        }

        LOG.layer("just before region intersection");
        if (_self.region.intersects(new_aoi.center, new_aoi.radius) || _getNeighbourCount() == 1) {
            LOG.layer("matcher::updateSubscription => intersection with region");
            // intersection with other region -> propogate subscription
            for (var keys in _neighbours) {
                if (keys == _self.id)
                    continue;
                LOG.layer("matcher::updateSubscription => looking at neighbour region " + keys + ":");
                    if (_neighbours[keys].region.intersects(new_aoi.center, new_aoi.radius)) {
                        if (!sub.recipients.includes(parseInt(keys))) {
                            LOG.layer("matcher::updateSubscription => adding " + keys + " to the new recipients list");
                            recipients.push(parseInt(keys));
                        } else {
                            LOG.layer("matcher::updateSubscription => remove " + keys + " from the list of recipients to the subscription");
                            sub.recipients.splice(sub.recipients.indexOf(keys),1);
                        }
                    }
            }
        } else if (!_self.region.within(new_aoi.center, _self.region.convertedEdges)) {
            LOG.debug("matcher::updateSubscription => subscription no longer intersects our region. Remove subscription");
            _removeSubscriptions(sub);
            _removeNonOverlapped(sub.subID, sub.recipients);
            return false;
        }

        LOG.layer("matcher::updateSubscriptions => updated sub");
        LOG.layer(sub);

        _subscriptions[sub.subID] = sub;

        if (is_owner) {
            LOG.layer("matcher::updateSubscription => propagating movement", _self.id);
            var now = new Date();
            var time = now.getTime();
            var msg = {
                subID: sub.subID,
                time: time,
                aoi: sub.aoi,
                is_owner: false
            }
            var pack = new VAST.pack(Matcher.SUB_UPDATE, msg, VAST.priority.NORMAL, LAYER.MATCHER, _self.id);
            pack.targets = sub.recipients;
            LOG.debug("Pack targets:");
            LOG.debug(pack.targets);
            _sendPack(pack, true);
            if (recipients.length != 0) {
                LOG.layer("matcher::updateSubscription => Sending subscription notify to clients: ");
                LOG.layer(recipients);
                for (var i = 0; i<recipients.length; i++)
                    sub.recipients.push(recipients[i]);
                var packet = new VAST.pack(Matcher.SUB_NOTIFY, sub, VAST.priority.HIGHEST, LAYER.MATCHER, _self.id);
                packet.targets= recipients;
                _sendPack(packet,true);
                _subscriptions[sub.subID] = sub;
            }
        } else {
            LOG.layer("matcher::updateSubscription => I am not the owner, but add the newly found recipients to the subscription");

            for (var i = 0; i<recipients.length; i++)
                sub.recipients.push(recipients[i]);

            _subscriptions[sub.subID] = sub;
        }

        if (pack !== undefined) {
            LOG.layer("matcher::removeNonOverlapped => sending pack to targets");
            LOG.layer(pack.targets);
            _sendPack(pack, true);
        }
    }

    var _removeNonOverlapped = function(subID, recipients) {
        LOG.layer("matcher::removeNonOverlapped => send message to neighbours telling them to remove me as a recipient of updates to this subscription");

        var pack = new VAST.pack(Matcher.SUB_NON_OVERLAP, {subID: subID, newRequest: true}, VAST.priority.NORMAL, LAYER.MATCHER, _self.id);

        LOG.layer("matcher::removeNonOverlapped => pack");
        LOG.layer(pack);

        for (var key in Object.keys(recipients)) {
            if (key != _self.id)
                pack.targets.push(recipients[key]);
        }

        LOG.layer("matcher::removeNonOverlapped => sending pack to targets");
        LOG.layer(pack.targets);

        _sendPack(pack, true);
    }

    //check if a disconnecting host contains subscribers
    var _matcherDisconnected = function(host_id) {

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

    var _getNeighbourCount = function () {
        return Object.keys(_neighbours).length;
    }

    /*
        interval functions
    */

    var _tick = function() {
        if (countdown != 0) {
            countdown--;
            recorder.write(_clients, _self.id+"-");

            if (_self.region.boundaryEdges.length == 0 && _self.region.halfedges.length != 0) {
                _self.region.convertingEdges();
            }
            _visualReturn("matcher", {matcher:_self.region.site, clients:_clients, id: _self.id, boundary: _self.region.boundaryEdges});
        } else {
            clearInterval(tickInterval);
            recorder.close(_self.id);
        }
    }

    // Ask neighbours to return to normal positions
    var _normalise = function () {
        LOG.debug("matcher::normalise => testing normalisation")
        if (numClients < CLIENT_THRESHOLD) {
            var neighbourIDs = []
            for (var key in _neighbours)
                if (key != _self.id)
                    neighbourIDs.push(key);

            if (neighbourIDs.length == 0)
                return false;

            //send ES a request for neighbours to move to original positions
            var data = {
                id: _self.id,
                neighbours: neighbourIDs
            }
            _clientReturn("normalise", data);
        }
    }

    // TODO: threshold for how many times we ask for help
    var _connectPending = function () {
        if (Object.keys(pendingClients).length > 0) {
            LOG.layer("matcher::connectPending => " + Object.keys(pendingClients).length + " clients still need to connect");
            if (numClients < CLIENT_THRESHOLD) {
                LOG.layer("matcher::connectPending => client can now connect");
                var pendClient = pendingClients[pendingClients.length-1];
                LOG.layer(pendClient);
                var type = "join";
                var aoi = new VAST.area(new VAST.pos(pendClient.client.aoi.center.x, pendClient.client.aoi.center.y), pendClient.client.aoi.radius);

                var data = {
                    username: pendClient.username,
                    socketID: pendClient.socketID,
                    type: pendClient.type,
                    clientID: pendClient.client.id,
                    aoi: aoi,
                    newConnection: pendClient.newConnection
                }

                // need to check if the join position is still under our jurisdiction
                _self.region.update(_voro.getRegion(_self.id));
                _self.region.convertingEdges();

                if (_self.region.within(pendClient.client.aoi.center)) {
                    LOG.layer("matcher::connectPending => type: join data:");
                    LOG.layer(data);
                    pendingClients.pop();
                    delete pendingClientsMap[pendClient.client.id];

                    _connHandler(type,data);
                } else if (_getNeighbourCount() > 1){
                    LOG.layer("matcher::connectPending => transferring pending client because its position is no longer under our jurisdiction");
                    var matcherID = _voro.closest_to(pendClient.client.aoi.center);
                    var subID = _findSubID(pendClient.client.id);

                    if (subID == "") {
                        LOG.layer("matcher::connectPending => sub ID cannot be found. Putting client back into waiting list");
                    }
                    else {
                        _transferClient(matcherID, pendClient.client.id, subID);
                    }
                } else {
                    _sendHelp();
                }
            } else {
                _sendHelp();
            }
        } else {
            requestingHelp = false;
            clearInterval(pendingInterval);
        }
    }

    /*
        matcher node handlers
    */

    var _insertMatcher = this.insertMatcher = function (matcher) {
        LOG.layer("matcher::insertMatcher => insert matcher into the local view", _self.id);

        // first check for an overlap before inserting into voronoi
        if (_isOverlapped(matcher.region.site, matcher.id)) {
            LOG.layer("matcher::insertMatcher => Adjusting local position for client [" + matcher.id + "] before inserting into voronoi", _self.id);
            node.region.site.update(_adjustPos(matcher.region.site,matcher.id));
        }

        LOG.layer("matcher::insertMatcher => Inserting into voronoi");
        // store the new matcher
        if (!_voro.insert(matcher.id, matcher.region.site)) {
            LOG.layer("matcher::insertMatcher => insert matcher failed", _self.id);
            return false;
        }

        LOG.layer("matcher::insertMatcher => successfully inserted matcher into voro");

        if (_getNeighbourCount() >= 1) {
            // add halfedges from voronoi to matcher region
            matcher.region.update(_voro.getRegion(matcher.id));
            matcher.region.convertingEdges();


            // store matcher into neighbour list
            _neighbours[matcher.id] = matcher;

            LOG.layer("matcher::insertMatcher => updating self node's region information and updating neighbour list", _self.id);
            _self.region.update(_voro.getRegion(_self.id));
            _self.region.convertingEdges();
            _neighbours[_self.id] = _self;
        } else {
            LOG.layer("matcher::insertMatcher => no neighbours, so create halfedges using bounding box");
            var bbox = _voro.get_bounding_box();

            var edgeList = [];
            var pt1,pt2,pt3,pt4;

            pt1 = new point2d(bbox.xl,bbox.yt);
            pt2 = new point2d(bbox.xl,bbox.yb);
            pt3 = new point2d(bbox.xr,bbox.yb);
            pt4 = new point2d(bbox.xr,bbox.yt);

            edgeList.push(new segment(pt1, pt2));
            edgeList.push(new segment(pt2, pt3));
            edgeList.push(new segment(pt3, pt4));
            edgeList.push(new segment(pt4, pt1));

            var boundaryList = [];
            var boundaryPoints = [];

            boundaryPoints.push(_self.region.getBoundaryVertex(pt1,pt2,pt3, BOUNDARY_SIZE));
            boundaryPoints.push(_self.region.getBoundaryVertex(pt2,pt3,pt4,BOUNDARY_SIZE));
            boundaryPoints.push(_self.region.getBoundaryVertex(pt3,pt4,pt1, BOUNDARY_SIZE));
            boundaryPoints.push(_self.region.getBoundaryVertex(pt4,pt1,pt2, BOUNDARY_SIZE));

            for (var k = 0; k < boundaryPoints.length; k++) {
                pt1 = boundaryPoints[k];

                if (k+1 != boundaryPoints.length) {
                    pt2 = boundaryPoints[k+1];
                } else {
                    pt2 = boundaryPoints[0];
                }
                //console.log("Point 1");
                //console.log(point1);
                //console.log("Point 2");
                //console.log(point2);
                boundaryList.push(new segment(new point2d(pt1.x,pt1.y), new point2d(pt2.x, pt2.y)));
            }

            matcher.region.convertedEdges = edgeList;
            matcher.region.boundaryEdges = boundaryList;

            LOG.layer("matcher::insertMatcher => matcher after edge insertion");
            LOG.debug(matcher)

            _neighbours[matcher.id] = matcher;

            if (matcher.id == _self.id) {
                LOG.layer("matcher::insertMatcher => updating self node");
                _self.region.update(_voro.getRegion(_self.id));
                _self.region.convertedEdges = matcher.region.convertedEdges;
                _self.region.boundaryEdges = matcher.region.boundaryEdges;
            }
        }

        var neighbourList = _voro.get_neighbour(_self.id);
        LOG.layer("My neighbours")
        LOG.layer(neighbourList);

        for (var key in _neighbours) {
            LOG.debug("Neighbour: " + key);
            if (!neighbourList.includes(key) && key != _self.id) {
                LOG.layer("matcher::insertMatcher => Removing [" + key + "] from neighbour list");
                delete _neighbours[key];
            }
        }

        LOG.layer("matcher::insertMatcher => Neighbour list after insert");
        LOG.layer(_neighbours);

        return true;
    }

    var _updateMatcher = this.updateMatcher = function (id,position) {
        if (_distance(position, _self.region.site) < MIN_DISTANCE && id != _self.id) {
            LOG.layer("matcher::updateMatcher => matcher [" + id + "] has moved too close to me. Telling it to move away.");
            var data = {
                id: _self.id,
                matcherID: id,
                min: MIN_DISTANCE
            }
            _clientReturn("move_matcher", data);
            return false;
        }

        LOG.layer("matcher::updateMatcher => updating position of matcher");
        _voro.update(id,position);

        LOG.debug("matcher::updateMatcher => voronoi updated");

        LOG.debug("matcher::updateMatcher => updating a neighbour");
        if (!_neighbours.hasOwnProperty(id))  {
            for (var key in _neighbours)
                LOG.debug(key);
            var neighbourList = _voro.get_neighbour(id);
            LOG.debug(neighbourList);
            LOG.debug("matcher::updateMatcher => matcher is no longer within our view. Insert instead");
            LOG.debug(position);
            var time = UTIL.getTimestamp();
            var matcher = new VAST.match(id,undefined,time,24, new VAST.region(new VAST.pos(position.center.x, position.center.y)));
            LOG.debug(matcher);
            _insertMatcher(matcher);
            return false;
        }
        _neighbours[id].region.update(_voro.getRegion(id));
        _neighbours[id].region.convertingEdges();

        LOG.debug("matcher::updateMatcher => updating self node");
        // updating my own position so that visualiser is consistent and transferring of non-overlapped is consistent
        _self.region.update(_voro.getRegion(_self.id));
        _self.region.convertingEdges();

        LOG.debug("matcher::updateMatcher => done updating self node");

        if (id == _self.id) {
            LOG.layer("matcher::updateMatcher => sending message to VON layer to move for neighbour discovery purposes");
            // send message to VON to ask it to move and therefore discover new neighbours
            _sendMessage(id, VON_Message.VON_SHIFT, position, true, LAYER.VON);
        }

        _transferNonOverlapped();
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

            var new_matcher = _nodeToMatcher(new_node);

            LOG.layer("matcher::contactNewMatchers => converted node:",_self.id);
            LOG.layer(new_matcher, _self.id);

            // ignore self
            if (_isSelf(new_matcher.id))
                continue;

            // update existing info if the node is known, otherwise prepare to add
            if (_isNeighbor(new_matcher.id)) {
                LOG.layer("matcher::contactNewMatchers => updating existing matcher.", _self.id);
                _updateMatcher(new_matcher.id, new_matcher.region.site);
            } else {
                LOG.layer("matcher::contactNewMatchers => adding new matcher.");
                // insert to Voronoi and get ready to propogate it to make contact with them
                _insertMatcher(new_matcher);

                // TODO: change from unused to either removed or handled
                new_list.push(new_matcher.id);
            }
        }
    }

    var _sendRelevantSubs = this.sendRelevantSubs = function (target) {
        LOG.layer("matcher::sendRelevantSubs => Finding subscriptions to send to " + target, _self.id);

        if (!_neighbours.hasOwnProperty(target)) {
            LOG.error("matcher::sendRelevantSubs => neighbour " + target + " is no longer a neighbour. Ignore relevant subs request");
            return false;
        }

        // get neighbour matcher information in temporary variable
        var neighbour = _getMatcher(target);

        var relevant_subs = {}

        // run through list of subscriptions and check for relevant ones to neighbour
        for (var key in _subscriptions) {
            // TODO: update contains
            if (_intersects(_subscriptions[key].aoi, neighbour.region)) {
                LOG.layer("matcher::sendRelevantSubs => adding " + key + " to list of subs relevant to " + target, _self.id);
                var sub = _subscriptions[key];
                relevant_subs[key] = sub;
            }
        }

        _sendMessage(target, Matcher.SUB_TRANSFER, relevant_subs, VAST.priority.NORMAL, true, LAYER.MATCHER);
    }

    // transfer a single client
    var _transferClient = function(matcherID, clientID, subID) {
        LOG.layer("matcher::transferClient => transferring [" + clientID + "] to matcher [" + matcherID + "]", _self.id);
        // need to send request to transfer ownership of client and
        // let entry server know that we are no longer this client's owner
        if (!_subscriptions.hasOwnProperty(subID)) {
            LOG.layer("matcher::transferClient => fatal error. Subscription does not exist");
            return false;
        }

        var sub = _subscriptions[subID];

        var now = new Date();
        var time = now.getTime();

        // update host ID of sub to new matcher
        sub.host_id = matcherID;
        _subscriptions[subID] = sub;
        LOG.layer("matcher::transferClient => checking for whether client is connected or pending before continuing");
        LOG.layer("Clients");
        LOG.layer(_clients);
        LOG.layer("pendingClients");
        LOG.layer(pendingClients);
        LOG.layer("pendingClientsMap");
        LOG.layer(pendingClientsMap);
        LOG.layer(pendingClientsMap.hasOwnProperty(parseInt(clientID)))
        LOG.layer(pendingClientsMap.hasOwnProperty(clientID));

        if (_clients.hasOwnProperty(clientID)) {
            LOG.layer("matcher::transferClient => transferring connected client");

            delete _clients[clientID];
            delete connections[clientID];

            LOG.layer("matcher::transferClient => new client list: ");
            LOG.layer(_clients);

            numClients--;

            LOG.layer("matcher::transferClient => new number of clients: " + numClients, _self.id);

            _visualReturn("matcher_leave", sub.id);
        } else if (pendingClientsMap.hasOwnProperty(clientID)) {
            LOG.layer("matcher::transferClient => transferring pending client");
            for (var key in Object.keys(pendingClients))
                if (pendingClients[key].client.id == clientID) {
                    pendingClients.splice(key,1);
                    delete pendingClientsMap[clientID];
                }
            LOG.layer("matcher::transferClient => new pendingClients list");
            LOG.layer(pendingClients)
            LOG.layer(pendingClientsMap);
        } else {
            LOG.layer("matcher::transferClient => client already transferred. Ignore request to transfer");
            return false;
        }

        var msg = {
            subID: subID,
            time: time,
            aoi: sub.aoi,
            is_owner: true
        }
        LOG.layer("matcher::transferClient => msg");
        LOG.layer(msg);
        _sendMessage(matcherID, Matcher.SUB_UPDATE, msg, VAST.priority.NORMAL, true, LAYER.MATCHER);

        var data = {
            clientID: sub.id,
            matcherID: matcherID
        }
        LOG.layer("matcher::transferClient => data");
        LOG.layer(data);
        _clientReturn("clientTransfer", data);
    }

    // check all subscriptions to see which ones need to be transferred
    var _transferNonOverlapped = function() {
        LOG.layer("matcher::transferNonOverlapped => checking for overlaps");
        LOG.layer(_self.region);
        for (var key in _subscriptions) {
            var sub = _subscriptions[key];
            if (sub.host_id == _self.id) {
                LOG.debug("Client ID: " + sub.id)
                if (!_self.region.within(sub.aoi.center)) {
                    var id = _voro.closest_to(sub.aoi.center);
                    _transferClient(id, sub.id, key);
                }
            }
        }
        LOG.layer("matcher::transferNonOverlapped => finished checking for non-overlapped client subscriptions");
    }

    var _sendHelp = function() {
        LOG.layer("matcher::sendHelp! => asking for load balancing from entry server");
        var en_list = _voro.get_en(_self.id);

        var aoi = new VAST.area(new VAST.pos(_self.region.site.x, _self.region.site.y));

        var returnData = {
            matcherID: _self.id,
            aoi: aoi,
            en_list: en_list
        }

        LOG.layer("Return data: ");
        LOG.layer(returnData);

        _clientReturn("help", returnData);
    }

    // retrieve a matcher with updated halfedges
    // NOTE: should not be used in loops as it recalculate's voronoi every time
    var _getMatcher = this.getMatcher = function (matcherID) {
        LOG.layer("matcher::getMatcher => Retrieving matcher with ID: " + matcherID + " and updating its halfedges.");
        var matcher = _neighbours[matcherID];
        matcher.region.update(_voro.getRegion(matcherID));
        matcher.region.convertingEdges();

        _neighbours[matcherID] = matcher;
        return matcher;
    }

    var _distance = function(p1, p2) {
        var dx = p1.x - p2.x;
        var dy = p1.y - p2.y;
        //console.log ("point2d distance called, dx: " + dx + " dy: " + dy + " this.x: " + this.x + " this.y: " + this.y + " p.x: " + p.x + " p.y: " + p.y);

        return Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
    }

    /*
        handlers
    */

    // handles packets from other matchers
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
                    if (!_new_neighbours.hasOwnProperty(new_node.id) ||
                        _new_neighbours[new_node.id].time <= new_node.time) {

                        LOG.layer('matcher::packetHandler => adding node id [' + new_node.id + '] type: ' + typeof new_node.id, _self.id);

                        _new_neighbours[new_node.id] = new_node;
                    }
                }
                _contactNewMatchers();
            }
                break;
            // receive information about a node that has joined, respond with subs that it needs to know about
            case Matcher.HELLO : {
                LOG.layer("matcher::HELLO => receiving information about neighbour node");
                var node = pack.msg;

                var matcher = _nodeToMatcher(node);

                _insertMatcher(matcher);

                _transferNonOverlapped();

                _sendRelevantSubs(matcher.id);
            }
                break;

            // receive list of subscriptions from nodes that matcher should know about
            case Matcher.SUB_TRANSFER: {
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

            // remove subscription
            case Matcher.SUB_REMOVE: {
                LOG.layer("matcher:: packetHandler::SUB_REMOVE => received notification to remove a subscription", _self.id);
                var sub = pack.msg;

                // remove subscription
                _removeSubscriptions(sub);
            }
                break;

            case Matcher.SUB_UPDATE: {
                LOG.layer("matcher::packetHandler::SUB_UPDATE => updating subscription with ID " + pack.msg.subID, _self.id);

                _updateSubscription(pack.msg.subID, pack.msg.aoi, pack.msg.time, pack.msg.is_owner);
            }
                break;

            // information about a subscription that anothe matcher thinks we should know about
            case Matcher.SUB_NOTIFY: {
                LOG.layer("matcher::packetHandler::SUB_NOTIFY => received information about a subscription that we should be aware of.", _self.id);

                var sub = pack.msg;

                // add subscription to own view
                _addSubscription(sub, false);
            }
                break;

            // a cheaper way to change the recipient list than SUB_UPDATE
            case Matcher.SUB_NON_OVERLAP: {
                LOG.layer("matcher::subNonOverlap => remove the sender [" + from_id + "] as a recipient from sub " + pack.msg.subID);

                if (!_subscriptions.hasOwnProperty(pack.msg.subID)){
                    if (pack.msg.newRequest) {
                        LOG.layer("matcher::subNonOverlap => subscription does not exist. Return the SUB_NON_OVERLAP request to sender");
                        pack.msg.newRequest = false;
                        pack.targets = [];
                        pack.targets.push(from_id);
                        _sendPack(pack, true);
                    } else {
                        LOG.layer("matcher::subNonOverlap => message returned and I do not have sub record either. Discard request");
                        break;
                    }
                    if (_subscriptions[pack.msg.subID] !== undefined) {
                        if (_subscriptions[pack.msg.subID].recipients.includes(from_id)){
                            _subscriptions[pack.msg.subID].recipients.splice(_subscriptions[pack.msg.subID].recipients.indexOf(from_id),1);
                        } else {
                            LOG.layer("matcher::subNonOverlap => could not find matcher ID in recipients.");
                        }
                    } else {
                        LOG.layer("matcherSubNonOverlap => subscription is undefined. Remove it")
                    }
                } else {
                    LOG.layer("matcher::subNonOverlap => sub does not exist anymore. Ignore.");
                }
            }
                break;

            case Matcher.PUB: {
                LOG.layer("matcher:packetHandler => Publish message to client.", _self.id);

                var aoi = new VAST.area();
                aoi.parse(pack.msg.aoi);

                if (pack.msg.packetName == "ServerEntityPositionPacket" || pack.msg.packetName == "ServerEntityPositionRotationPacket") {
                    _move(pack.msg.clientID, aoi, pack.msg.channel, from_id);
                }

                _pub(pack.msg.clientID, pack.msg.username, aoi, pack.msg.payload, pack.msg.channel, pack.msg.packetName, pack.msg.originID, pack.msg.oldTargets);
            }
                break;

            case Matcher.MOVE: {
                LOG.layer("matcher::MOVE => moving matcher [" + from_id + "] to position:", _self.id);
                LOG.layer(pack.msg);

                _updateMatcher(from_id, pack.msg);
            }
                break;

            case Matcher.DISCONNECT: {
                LOG.layer("matcher::disconnect => received disconnect message from neighbour for client ", _self.id);
                LOG.layer(pack.msg, _self.id);

                _leave(pack.msg);
            }

            default: {
                LOG.layer("matcher::packetHandler => Packet successfully received");
                LOG.layer(pack);
            }
                break;
        }

        return true;
    }

    // handles messages from connections to clients
    var _connHandler = this.connHandler = function (type,data) {
        // handle the type of message coming through
        LOG.layer("type: " + type);
        LOG.layer("data: ");
        LOG.layer(data);

        LOG.layer("periodic client list: ");
        LOG.layer(_clients);

        switch (type) {
            case "type": {
                LOG.layer("matcher::connHandler => received connection of type: " + type, _self.id);
                _clientID++;
                var clientID = _self.id+'-'+_clientID;
                connections[clientID] = data.type;
                LOG.layer("matcher::connHandler => connections:", _self.id);
                LOG.layer(connections, _self.id);
                var returnData = {
                    socketID: data.socketID,
                    connectionID: clientID
                }
                _clientReturn(type, returnData);
            }
                break;
            case "join": {
                LOG.layer("matcher::join => received username " + data.username);
                var clientID = data.clientID;

                LOG.layer("matcher::connHandler => number of clients connected to matcher before this connection: " + numClients, _self.id);
                if (numClients < CLIENT_THRESHOLD) {
                    numClients++;

                    // create space for client info to be stored
                    connections[clientID] = data.type;
                    LOG.layer("matcher::connHandler => connections:", _self.id);
                    LOG.layer(connections, _self.id);

                    var now = new Date();
                    var time = now.getTime();

                    _clients[clientID] = new VAST.connClient(clientID, new VAST.area(new VAST.pos(data.aoi.center.x, data.aoi.center.y), data.aoi.radius),time);

                    LOG.layer("matcher::connHandler => clients: ");
                    LOG.layer(_clients);

                    // construct return data
                    var returnData = {
                        clientID: clientID,
                        username: data.username,
                        newConnection: data.newConnection
                    }

                    LOG.layer("Return data: ");
                    LOG.layer(returnData);

                    _clientReturn(type, returnData);
                } else {
                    LOG.layer("matcher::connHandler => matcher threshold reached. Sending request for assisstance to entry server", _self.id);

                    pendingClients.push({
                        client: new VAST.connClient(clientID, new VAST.area(new VAST.pos(data.aoi.center.x, data.aoi.center.y), data.aoi.radius),time),
                        username: data.username,
                        socketID: data.socketID,
                        type: data.type,
                        newConnection: data.newConnection
                    });

                    pendingClientsMap[clientID] = pendingClients[pendingClients.length-1].client;

                    if (!requestingHelp) {
                        requestingHelp = true;
                        _sendHelp();

                        pendingInterval = setInterval(_connectPending,PENDING_INTERVAL);
                    }
                }
            }
                break;

            case "subscribe": {
                LOG.layer("matcher::connHandler => received subscription request", _self.id);

                // set large sub radius if the connection doesn't initially provide one
                // make it large enough that the initial messages will be captured
                if (data.radius == undefined) {
                    LOG.layer("matcher::subscribe => No radius provided. Making it the default radius of " + DEFAULT_RADIUS, _self.id);
                    data.radius = DEFAULT_RADIUS;
                }

                var aoi = new VAST.area(new VAST.pos(data.x,data.y), data.radius);

                // increase the clientID if it is of type client
                var clientID = data.clientID;

                // handle case where client is subscribing before joining
                var type = connections[clientID] == undefined ? "client" : connections[clientID];

                _sub(clientID, aoi, data.channel, type, data.username);
            }
                break;

            case "unsubscribe": {
                LOG.layer("matcher::connHandler => received unsubscribe request", _self.id);
                _unsub(data.clientID, data.channel, data.username);
            }
                break;

            case "move": {
                LOG.layer("matcher::connHandler::move => received move request from " + data.clientID, _self.id);
                var aoi = new VAST.area(new VAST.pos(data.x,data.y),data.radius);

                if (!_clients.hasOwnProperty(data.clientID)) {
                    LOG.debug("matcher::publish => Cannot publish as the client has not connected yet");
                    break;
                }

                _move(data.clientID, aoi, data.channel, data.matcherID);
            }
                break;

            case "publish": {
                LOG.layer("matcher::connHandler => received publication request", _self.id);
                var aoi = new VAST.area(new VAST.pos(data.x,data.y), data.radius);

                if (!_clients.hasOwnProperty(data.clientID)) {
                    if (pendingClientsMap.hasOwnProperty(data.clientID))
                        for (var key in Object.keys(pendingClients)) {
                            if (pendingClients[key].client.id == data.clientID)
                                pendingClients[key].client.aoi.update(aoi);
                        }
                    LOG.debug("matcher::publish => Cannot publish as the client has not connected yet");
                    break;
                }

                _pub(data.clientID, data.username, aoi, data.payload, data.channel, data.packetName, data.senderID, _self.id, []);
            }
                break;

            case "leave": {
                LOG.layer("matcher::disconnect => handling disconnection from " + data, _self.id);

                _leave(data);
            }
                break;

            case "matcherMove": {
                LOG.layer("matcher::matcherMove => Need to move to the given position");

                _updateMatcher(_self.id, data);

                // let neighbours know that I am moving
                var sendList = [];
                for (var key in _neighbours) {
                    if (key != _self.id)
                        sendList.push(parseInt(key));
                }

                LOG.layer("matcher::matcherMove => sending movement to: ", _self.id);
                LOG.layer(sendList);

                var pack = new VAST.pack(
                    Matcher.MOVE,
                    data,
                    VAST.priority.HIGHEST,
                    LAYER.MATCHER,
                    _self.id
                );

                pack.targets = sendList;

                _sendPack(pack,true);
            }
                break;
            default:
                LOG.layer("matcher::connHandler => Message unhandled");
        }

    }

    var _disconnHandler = this.disconnHandler = function () {

    }

    var visualComm = this.visualComm = function (type, message) {
        /*
        switch (type) {
            case "voro": {
                if (_visualInterval == undefined) {
                    LOG.info("Visualiser tick has started", _self.id);
                    _visualInterval = setInterval(function(voro, neighbours) {

                        _visualReturn("voro_matcher",[voro.get_sites(),JSON.stringify(neighbours)]);
                    }, 40, _voro, _neighbours);
                }
            }
                break;
            default: {
                    LOG.error("matcher: visual communicator does not understand type '"+type+"'", _self.id);
                }
        }
        */
    }

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
            _clientReturn = _msg_handler.clientReturn;
            _visualReturn = _msg_handler.visualReturn;
        }

        _neighbours = {};
        _new_neighbours = {};

        _voro = new Voronoi();

        _subscriptions = {};

        _clientID = -1;
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

    // list of clients connected to the matcher
    var _clients = {};

    // number of client connected to the matcher
    var numClients = 0;

    // queue of clients awaiting connection to this matcher when threshold is reached
    var pendingClients = [];

    // map of pending clients for quick retrieval
    var pendingClientsMap = {};

    // the ID of the origin matcher (the gateway matcher)
    var _origin_id;

    // the ID of this matcher (coincides with VON peer. ID from the net layer)
    var _self = new VAST.match();
    _self.region.convertingEdges();

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

    // connections
    var connections = {};

    // am I the gateway or not
    var _is_gateway;

    // if I am receiving a client ID from the gateway
    var _receiveID = false;

    // gateway address
    var _entryAddr;

    // client ID
    var _clientID;

    // client ID to client type
    var _id2type = {};

    // client to subID
    var _client2subID = {};

    // record data
    var recorder = undefined;

    // tick interval
    var tickInterval = undefined;

    // visualiser interval
    var _visualInterval = undefined;

    // pending client connection interval
    var pendingInterval = undefined;

    var countdown = 1800;

    // ID of the entry server (Not -1 because that is VAST.ID_UNASSIGNED)
    const ENTRY_ID = -2;

    var requestingHelp = false;

}

// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = VAST_matcher;
