
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

require('./common.js');
var msg_handler = msg_handler || require('./net/msg_handler.js');
var util = util || require('./common/util.js');

// config

function VAST_matcher(recv_callback, settings) {

    // store callback to notify received messages
    var _onReceive = recv_callback;

    //
    // public methods
    //

    // join the matcher to a VON
    this.join = function (addr,onDone) {

        // join VON network
        var id, port;

        id = addr.id;
        port = addr.endpt.port;

        _self.init(id, port, function () {
            // when done

        });
    }

    // leave the matcher overlay
    var _leave = this.leave = function() {
        if (_isJoined() == false)
           return false;

       // leave the node overlay
       _VSOpeer.leave();
       _VSOpeer.tick();

       _VSOpeer = NULL;

       _world_id = 0;

       LOG.info("VASTMatcher leave() called");
       _state = VAST.state.ABSENT;

       return true;
    }

    var _isJoined = this.isJoined = function() {
        return (_state == VAST.state.JOINED);
    }

    //
    // private methods
    //

    // send to gateway a message on a given handler
    var _sendGatewayMessage = function (pack) {

        pack.targets = [];
        pack.targets.push(VAST.ID_GATEWAY);
        _sendPack(pack, true);
    }

    // check whether current node is a gateway
    var _isGateway = function () {
        return (_self.getSelf().id === VAST.ID_GATEWAY);
    }

    var _isActive = function() {
        return (_VSOpeer != NULL && _VSOpeer.isJoined ());
    }

    //
    //  methods for VSO policy
    //

    var _findCandidate = function(new_origin, level) {

        // simply return the first available
        // TODO: better method? (newest, oldest, etc.?)
        for (key in _matchers)
        {
            var info = _matchers[key];
            if (info.state == CANDIDATE)
            {
                new_origin = info.addr;
                info.state = PROMOTING;

                //new_origin is currently an address
                LOG.info("[" + _self.id + "] promoting " + new_origin.host_id + " as new matcher\n\n",  );

                return true;
            }
        }

        // TODO: do something about it (e.g. create matcher node at gateway)
        LOG.debug("[" + _self.id + "] no candidate matcher can be found\n", );

        return false;
    }

    var _initMatcher = function(world_id, origin_id, target) {
        var msg = {
            world_id: world_id,
            origin_id: origin_id
        }

        // reliable by default
        return _msg_handler.sendMessage(target, VSO.msgtype.MATCHER_INIT, msg, 1, true);
    }

    //
    // helper functions
    //
    var _storeRequestingClient = function(world_id, client_id) {
        // as we need to wait for origin matchers' response,
       // we need to record the requesting client first
       if (_requests.hasOwnProperty(world_id) === false)
       // TODO: fix this
          // _requests[world_id] = new vector<id_t>;

       // avoid redundent request
       // NOTE: the client_id field indicates hostID
       // (assuming one subscription per host for now)
       var list = _requests[world_id];
       for (var i=0; i < list.length; i++)
       {
           if (list[i] == client_id)
               break;

           if (i == (list.length-1))
           {
               list[list.length] = client_id;
           }
       }

       return true;
    }

    // send a message to clients (optional to include the client's hostID for direct message)
    // returns # of targets successfully sent, optional to return failed targets
    var _sendClientMessage = function(msg, client_ID) {
        // for direct message, we send to a directly connected client (for faster response)
        if (client_ID != NET_ID_UNASSIGNED)
        {
            // perform error check, but note that connections may not be established for a gateway client
            if (msg.targets.length != 0)
            {
                LOG.debug("matcher.js: targets exist");
                return [];
            }

            msg.targets.push(client_ID);
            msg.msggroup = MSG_GROUP_VAST_CLIENT;
        }
        else
            msg.msggroup = MSG_GROUP_VAST_RELAY;

        // NOTE: for messages directed to relays, the network layer will do the translation from targets to relay's hostID
        return _msg_handler.sendMessage(msg, failed_targets);
    }

    // deal with unsuccessful send targets
    var _removeFailedSubscribers = function(list) {
        // some targets are invalid, remove the subs
        // TODO: perhaps should check / wait?
        if (list.length > 0)
        {
            LOG.warn("matcher.js: removing failed send targets of subscriptions");

            // remove failed targets
            for (var i=0; i < list.length; i++)
                removeSubscription(list[i]);
        }
    }


    //
    // subscription maintain functions
    //

    // create a new subscriber instance at this VASTMatcher
    var _addSubscription = function(sub,is_owner) {
        // do not add if there's existing subscription
        if (_subscriptions.hasOwnProperty(sub.id))
            return false;

        // record a new subscription
        sub.dirty = true;
        _subscriptions[sub.id] = sub;

        // update the VSOpeer
        _VSOpeer.insertSharedObject(sub.id, sub.aoi, is_owner, sub);

        // notify network layer of the subscriberID -> relay hostID mapping
        // also register the relay
        //notifyMapping(sub.relay.host_id, &sub.relay);
        //notifyMapping(sub.id, &sub.relay);

        return true;
    }

    // remove subscription
    var _removeSubscription = function(sub_no) {
        if (_subscriptions.hasOwnProperty(sub_no))
            return false;

        _VSOpeer.deleteSharedObject(sub_no);
        delete _subscriptions[sub_no];

        delete _closest[sub_no];

        if (_replicas.hasOwnProperty(sub_no))
        {
            delete _replicas[sub_no];
        }

        return true;
    }

    // update a subscription content
    var _updateSubscription = function(sub_no, new_aoi, sendtime, relay = NULL, is_owner = true) {
        //check to see if subscription actually exists
        if (_subscriptions.hasOwnProperty(sub_no))
            return false;

        var sub = _subscriptions[sub_no];

        var currTime = new Date();
        currTime = currTime.getTimestamp();

        // update record only if update occurs later than existing record
        if (sendtime > 0)
        {
            if (sendtime < sub.time)
                return false;
            else
                sub.time = sendtime;
        }

        sub.aoi.center = new_aoi.center;
        if (new_aoi.radius != 0)
            sub.aoi.radius = new_aoi.radius;

        sub.dirty = true;

        // update states in shared object management
        _VSOpeer.updateSharedObject(sub_no, sub.aoi, is_owner);

        /*
        // update relay, if changed
        if (relay != NULL &&
            sub.relay.host_id != relay->host_id)
        {
            sub.relay = *relay;
            notifyMapping (sub.id, &sub.relay);

            // if I'm owner, need to propagate relay change to all affected
            if (_VSOpeer->isOwner (sub.id) &&
                _replicas.find (sub.id) != _replicas.end ())
            {
                // clear the record of the hosts already received full replicas
                // so next time when sending the subscription update,
                // full update (including the relay info) will be sent
                delete _replicas[sub.id];
                _replicas.erase (sub.id);

            }
        }
        */

        return true;
    }

    // check if a disconnecting host contains subscribers
    var _subscriberDisconnected = function(host_id) {
        var remove_list = [];

        // loop through all known subscriptions, and remove the subscription that matches
        for (var key in _subscriptions)
        {
            var sub = _subscriptions[key];

            if (sub.host_id == host_id)
                remove_list.push(sub.id);
        }

        if (remove_list.length > 0)
        {
            for (var i=0; i < remove_list.length; i++)
                _removeSubscription(remove_list[i]);

            return true;
        }

        return false;
    }

    //
    // handlers to communicate with network layer
    //

    var _packetHandler = this.packetHandler = function (from_id, pack) {

        // if join is not even initiated, do not process any message
        /*
        if (_state == VAST.state.ABSENT) {
            LOG.error('VAST_matcher: node not yet join, should not process any messages');
            return false;
        }
        */

        LOG.debug('Matcher [' + _self.getSelf().id + '] ' + VAST.msgstr[pack.type] + ' from [' + from_id + ']');

        switch (pack.type) {

            // report to gateway that a matcher may be available as candidate origin matcher
            case VAST.msgtype.MATCHER_CANDIDATE: {
                if (!isGateway())
               {
                   LOG.debug("[" + _self.id + "] MATCHER_CANDIDATE received by non-gateway");
                   break;
               }

               // this is an endpt
               var candidate;
               candidate = pack.msg;

               var matcher_id = candidate.host_id;

               // store potential nodes to join
               // use the host_id as index
               if (_matchers.hasOwnProperty(matcher_id))
               {
                   // NOTE: normally this should not happen, unless a timeout matcher has re-join again as matcher,
                   //       in such case we treat it as a new matcher
                   LOG.warn("matcher.js: [" + _self.id + "] MATCHER_CANDIDATE found matcher [" + matcher_id + "] already exists, ignore request");
                   break;
               }

               var info = new matcher();

               info.addr = candidate;
               info.state = CANDIDATE;
               info.world_id = 0;
               info.time = util.getTimestamp ();

               _matchers[matcher_id] = info;
            }
            break;

            // starting of a new origin matcher by gateway
            // also serves the purpose of re-notifying a matcher its loss of origin matcher status
            case VAST.msgtype.MATCHER_INIT: {
                var world_id;
                var origin;

                world_id = pack.msg.world_id;
                origin = pack.msg.origin;

                // assign my world_id
                _world_id = world_id;

                // assign origin_id as notified
                // NOTE that it could differ from self
                if (origin != _self.id)
                {
                    LOG.info("matcher.js: [" + _self.id + "] MATCHER_INIT: lose origin matcher status to [" + origin + "] for world [" + world_id + "]");

                    // I'm probably outdated, prepare to re-join
                    _leave();
                    _join(_gateway);
                }
                else if (_isActive ())
                    LOG.debug("[" + _self.id + "] MATCHER_INIT: promoted from regular to origin matcher for world [" + world_id + "]");

                _origin_id = origin;

                // if the VSOpeer is not yet joined
                if (_isActive() == false && _VSOpeer != NULL)
                {
                    // start up the VSOPeer at the origin matcher,
                    // set myself is the starting origin node in VSO
                    _VSOpeer.join(_self.aoi, _self, _is_static);
                }
            }
            break;

            // keepalive messages from matchers to gateway, so backup origin matchers can be kept
            // there are two main categories of cases: origin or regular, new or existing
            case VAST.msgtype.MATCHER_ALIVE: {
                if (!_isGateway ())
                {
                    LOG.debug("[" + _self.id + "] MATCHER_ALIVE received by non-gateway");
                    break;
                }

                // record matcher info
                var     request_reply, world_id, matcher_addr, origin_id, sendsize, recvsize;

                request_reply = pack.msg.request_reply;
                world_id = pack.msg.world_id;
                matcher_addr = pack.msg.addr;
                origin_id = pack.msg.origin_id;
                sendsize = pack.msg.sendsize;
                recvsize = pack.msg.recvsize;

                var matcher_id = matcher_addr.host_id;

                // first find out which world this matcher belongs to
                if (world_id == 0)
                {
                    if (!_matchers.hasOwnProperty(origin_id) ||
                        _matchers[origin_id].world_id == 0)
                    {
                        LOG.info("[" + _self.id + "] MATCHER_ALIVE world_id empty, and world_id for origin [" + origin_id + "] not found, ignore message");
                        break;
                    }

                    world_id = _matchers[origin_id].world_id;
                }

                // send back world info if requested
                if (request_reply)
                {
                    // notify matcher of its world_id
                    var msg = {
                        world_id: world_id,
                        addr: _matchers[origin_id].addr,
                    }

                    _msg_handler.sendMessage(from_id, VAST.msgtype.MATCHER_WORLD_INFO, msg, VAST.priority.HIGHEST, true);
                }

                // check if we know this matcher (we should unless it's keepalive)
                // will occur if a live matcher has lost contact for a while, it needs to re-join
                // in order to get in touch with possibly a new origin matcher for this world
                if (!_matchers.hasOwnProperty(matcher_id))
                {
                    if (_origins.hasOwnProperty(world_id))
                    {
                        LOG.debug("matcher.js: [" + _self.id + "] MATCHER_ALIVE unknown matcher [" + matcher_id + "], re-init the matcher with its origin [" + _origins[world_id] + "]");
                        _initMatcher(world_id, _origins[world_id], from_id);
                        break;
                    }
                    else
                    {
                        LOG.debug("[" + _self.id + "] MATCHER_ALIVE unknown matcher [" + matcher_id + "], possibly a lost origin for world [" + world_id + "], record back");

                        var minfo = new VAST.matcher();
                        minfo.addr      = matcher_addr;
                        minfo.state     = VSO.ACTIVE;

                        // insert new record
                        _matchers[matcher_id] = minfo;
                    }
                }

                // update info for keepalive record
                var info = _matchers[matcher_id];
                info.time       = util.getTimestamp ();
                info.world_id   = world_id;

                // check for consistency between recorded matcher & sent info
                // NOTE that world_id may be updated for a new origin matcher
                if (info.addr.equals(matcher_addr))
                {
                    LOG.debug("matcher.js: [" + _self.id + "] MATCHER_ALIVE matcher [" + matcher_id + "] sent address not matching with record, update record");
                    info.addr.update(matcher_addr);
                }

                // for origin matchers
                // NOTE: it's possible two or more matchers both claim to be the origin matchers for a world
                if (matcher_id == origin_id)
                {
                    // case 1: new origin matcher
                    if (info.state == VSO.PROMOTING)
                    {
                        info.state = VSO.ORIGIN;
                        info.world_id = world_id;
                        LOG.info("matcher.js: MATCHER_ALIVE -> matcher [" + matcher_id + "] promoted as origin for world [" + world_id + "]");
                    }
                    // case 2: an unresponding origin matcher responds again
                    //         (equivalent to a regular matcher thinking that it's the origin
                    else if (info.state != VSO.ORIGIN)
                    {
                        // if mapping doesn't exist, means it's a origin that has lost contact
                        if (!_origins.hasOwnProperty(world_id))
                        {
                            LOG.debug("matcher.js: MATCHER_ALIVE -> matcher [" + matcher_id + "] re-assigned as origin for world [" + world_id + "]");
                            info.state = VSO.ORIGIN;
                        }
                        // otherwise we should demote this previous origin
                        else
                        {
                            LOG.debug("matcher.js: MATCHER_ALIVE -> matcher [" + matcher_id + "] demoted from origin for world [" + world_id + "]");
                            _initMatcher(world_id, _origins[world_id], from_id);
                            break;
                        }
                    }

                    // notify clients of this origin matcher, if any pending
                    if (_requests.hasOwnProperty(world_id))
                    {
                        // send reply to joining client
                        // TODO: combine with response in JOIN?
                        // NOTE: we send directly back, as this is a gateway response
                        var msg = {
                            msggroup:   MSG_GROUP_VAST_CLIENT,
                            addr:       info.addr
                        }
                        _msg_handler.sendMessage(_requests[world_id], VAST.msgtype.NOTIFY_MATCHER, msg, VAST.priority.HIGHEST, true);

                        LOG.debug("matcher.js: MATCHER_ALIVE -> notify clients with origin matcher [" + matcher_id + "] on world (" + world_id + ") for clients:");
                        var target_list = _requests[world_id];
                        for (var i=0; i < target_list.length; i++)
                            LOG.debug("[" + target_list[i] + "]");

                        // erase requesting clients
                        delete _requests[world_id];
                    }

                    // record or replace world to origin mapping
                    if (!_origins.hasOwnProperty(world_id))
                    {
                        LOG.debug("MATCHER_ALIVE: world [" + world_id + "]'s origin recorded as [" + matcher_id + "]");
                        _origins[world_id] = matcher_id;
                    }

                    else if (_origins[world_id] != matcher_id)
                    {
                        // should not happen by current design
                        LOG.error("matcher.js: MATCHER_ALIVE -> world [" + world_id + "]'s origin replaced by [" + matcher_id + "] from [" + _origins[world_id] + "] *shouldn't happen*");
                        _origins[world_id] = matcher_id;
                    }
                }
                // for regular matchers
                else
                {
                    // case 3: new regular matcher (just directly to ACTIVE mode)
                    if (info.state == VSO.CANDIDATE || info.state == VSO.PROMOTING)
                    {
                        info.state = VSO.ACTIVE;
                        LOG.debug("matcher.js: MATCHER_ALIVE -> matcher '" + matcher_id + "' now promoted as regular matcher for world [" + world_id + "]");
                    }
                }
            }

            // learn of the world_id of my current world & origin matcher's address
            case VAST.msgtype.MATCHER_WORLD_INFO: {
                var world_id, addr;
                world_id = pack.msg.world_id;
                addr = pack.msg.addr;

                LOG.debug("[" + _self.id + "] MATCHER_WORLD_INFO: new world_id [" + world_id + "] previous [" + _world_id + "]");

                _world_id    = world_id;
                _origin_addr = addr;
            }
            break;

            // search for origin matcher (no longer needed if specified directly)
            case VAST.msgtype.JOIN: {
                LOG.debug('JOIN received');

                // extract the specific world the client tries to join
                var world_id = pack.msg;
                LOG.debug('world_id: ' + world_id);

                if (_isGateway() === false) {
                    LOG.warn("JOIN request received by non-gateway\n");
                    break;
                }

                LOG.debug('Gateway [' + _self.getSelf().id + '] JOIN from [' + from_id + '] on world (' + world_id + ')');

                // find the address of the origin matcher
                // TODO: send message to start up a new origin matcher, if the world is not instanced yet
                if (_origins.hasOwnProperty(world_id) === false) // if this origin matcher is not in the map
                {
                    LOG.debug('Gateway [' + _self.getSelf().id + '] JOIN: creating origin matcher for world '+world_id);

                    // promote one of the spare potential nodes
                    var new_origin;

                    // TODO: if findCandidate () fails, insert new matcher hosted by gateway?
                    // NOTE: we use a loop as it's possible candidates already failed
                    var promote_success = false;
                    while (findCandidate(new_origin))
                    {
                        // send promotion message
                        _msg_handler.storeMapping(new_origin.host_id, new_origin);

                        // record the init if send was success
                        if (initMatcher(world_id, new_origin.host_id, new_origin.host_id))
                        {
                            //_promote_requests[new_node.id] = requester;
                            promote_success = true;

                            // we still specify the world to matcher_id mapping,
                            // so other clients wishing to join this world can be attached to the request list
                            _origins[world_id] = new_origin.host_id;
                            break;
                        }
                    }

                    if (promote_success == false)
                    {
                        LOG.debug("Gateway JOIN: no candidate matchers promoted, for client [" + from_id + "] requesting world: " + world_id);
                    }
                    else
                    {
                        storeRequestingClient(world_id, from_id);
                    }
                }
                // if origin matcher for the requested world exists, reply the client
                else
                {
                    var matcher_id = _origins[world_id];

                    if (_matchers.hasOwnProperty(matcher_id))
                    {
                        LOG.debug("Gateway JOIN: origin matcher [" + matcher_id + "] cannot be found for world [" + world_id + "]");

                        if (matcher_id == 0)
                        {
                            // TODO: find what causes this
                            LOG.error("Gateway JOIN: matcher_id = 0, should not happen, remove it\n");
                            delete _origins[world_id];
                        }
                        return false;
                    }

                    // if the matcher is still in the process of being promoted, record client request
                    if (_matchers[matcher_id].state == PROMOTING)
                    {
                        storeRequestingClient(world_id, from_id);
                        return false;
                    }

                    // send reply to joining client
                    // NOTE: that we send directly back, as this is a gateway response
                    var msg = {
                        msggroup: MSG_GROUP_VAST_CLIENT,
                        addr: _matchers[matcher_id].addr
                    };

                    _msg_handler.sendMessage(from_id, VSO.msgtype.NOTIFY_MATCHER, msg, 1, true);

                    LOG.info("Gateway JOIN replies [" + from_id + "] with origin matcher [" + _origins[world_id] + "] on world (" + world_id + ")");
                }

            }
            break;

            case VAST.msgtype.LEAVE: {
                _subscriberDisconnected (in_msg.from);
            }
            break;

            // handle subscription
            case VAST.msgtype.SUB: {

                // NOTE: we allow sending SUBSCRIBE for existing subscription if
                //       the subscription has updated (for example, the relay has changed)

                LOG.debug('[' + _self.id + '] VASTMatcher SUBSCRIBE from [' + from_id + ']');

                // extract subscription
                var sub = new VAST.sub;
                sub.parse(pack.msg);


                // query the closest matcher and get edges
                var voronoi = _VSOpeer.getVoronoi();

                var closest = voronoi.closest_to(sub.aoi.center);

                // check if we should accept this subscription or forward
                if (voronoi.contains (_self.id, sub.aoi.center) ||
                    closest == _self.id)
                {
                    // slight increase AOI radius to avoid client-side ghost objects
                    sub.aoi.radius += SUBSCRIPTION_AOI_BUFFER;

                    // assign a unique subscription number if one doesn't exist, or if the provided one is not known
                    // otherwise we could re-use a previously assigned subscription ID
                    // TODO: potentially buggy? (for example, if the matcher that originally assigns the ID, leaves & joins again, to assign another subscription the same ID?)
                    // TODO: may need a way to periodically re-check ID with the assigning entry point
                    //if (sub.id == NET_ID_UNASSIGNED || _subscriptions.find (sub.id) == _subscriptions.end ())
                    // IMPORTANT NOTE: we assume a provided subscription ID is good, and re-use it
                    //                 if we only re-use if the ID already exists in record (e.g. check existence in _subscriptions)
                    //                 then must make sure the client app also updates the subID, otherwise the movement would be invalid
                    if (sub.id == NET_ID_UNASSIGNED)
                        // need to get id assignment
                        sub.id = _net.getUniqueID (ID_GROUP_VON_VAST);
                    else
                        LOG.warn("VASTMatcher [" + from_id + "] using existing ID [" + sub.id + "]");

                    // by default we own the client subscriptions we create
                    // we may simply update existing subscription when clients re-subscribe due to matcher failure
                    if (_subscriptions.hasOwnProperty(sub.id) === false)
                        addSubscription(sub, true);
                    else
                    {
                        var is_owner = true;

                        updateSubscription(sub.id, sub.aoi, 0, sub.relay, is_owner);
                    }

                    /*
                    // notify relay of the client's subscription -> hostID mapping
                    var msg = {
                        msggroup: MSG_GROUP_VAST_RELAY
                    }

                    Message msg (SUBSCRIBE_NOTIFY);
                    msg.priority = 1;
                    msg.msggroup = MSG_GROUP_VAST_RELAY;
                    msg.store (sub.id);
                    msg.store (sub.host_id);
                    msg.addTarget (sub.relay.host_id);
                    sendMessage (msg);

                    // send back acknowledgement of subscription to client via the relay
                    // NOTE: acknowledge should be sent via relay in general,
                    //       as the subscribe request could be forwarded many times
                    msg.clear (SUBSCRIBE_R);
                    msg.priority = 1;

                    // store both the assigned subscription ID, and also this matcher's address
                    // (so the client may switch the current matcher)
                    msg.store (sub.id);
                    msg.store (_self.addr);

                    msg.addTarget (sub.id);
                    sendClientMessage (msg);
                    */


                    // if the client connects directly to me, send reply directly
                    //if (sub.host_id == in_msg.from)
                    //    sendClientMessage (msg, in_msg.from);
                    //otherwise send via its relay
                    //else
                    //{
                    //    msg.addTarget (sub.id);
                    //    sendClientMessage (msg);
                    //}


                    // erase closest matcher record, so that the subscribing client will be notified again
                    // this occurs when the client is re-subscribing to a substitute matcher in case of its current matcher's failure
                    if (_closest.hasOwnProperty(sub.id))
                        _closest.erase (sub.id);

                    // record the subscription request
                    LOG.info("VASTMatcher: SUBSCRIBE request from [" + from_id + "] success");
                }
                else
                {
                    // forward the message to neighbor closest to the subscribed point
                    pack.targets = [closest];

                    _msg_handler.sendMessage(from_id,VAST.msgtype.SUB,pack, pack.priority);
                }
            }
            break;

            // handle publication
            case VAST.msgtype.PUB: {
                // extract publication layer (from end of message)
                var layer = pack.msg.layer;
                var area = pack.msg.area;

                // check through known subscribers
                // TODO: forward publication to neighbors for area publication, or
                //       for subscribers hosted by neighboring matchers

                // the layer of the receiver
                //layer_t target_layer;

                // find the peer that can act as initial point for this publication
                // TODO: find a more efficient / better way
                for (var key in _subscriptions) {
                    var sub = _subscriptions[key];

                    // if the neighbor is
                    //      1) at the same layer as publisher
                    //      2) interested in this publication
                    // then add as target

                    if (layer == sub.layer && sub.aoi.covers(area.center))
                        pack.targets.push(sub.id);
                }

                if (pack.targets.length > 0) {
                    var failed_targets;

                    // send the message to relay
                    failed_targets = sendClientMessage (pack, 0);
                    removeFailedSubscribers(failed_targets);
                }
                else
                    LOG.debug("matcher.js: no peer covers publication at (" + area.center.x + "," + area.center.y + ")");
            }
            break;

            case VAST.msgtype.MOVE:
            case VAST.msgtype.MOVE_F: {
                // extract subscripton id first
                var sub_id;
                sub_id = pack.msg.sub_id;

                var send_time = 0;  // time of sending initial MOVE
                send_time = pack.msg.send_time;

                var pos = new VAST.area();
                pos.parse(pack.msg.pos);

                var new_aoi = new VAST.area();
                new_aoi.center.x = pos.x;
                new_aoi.center.y = pos.y;

                // if radius is also updated
                if (pack.type == VAST.msgtype.MOVE_F)
                {
                    new_aoi.radius = pos.radius;
                }

                _updateSubscription(sub_id, new_aoi, send_time);
            }
            break;

            // not entirely sure what the point of this function's retargeting is.
            // TODO: finish this
            case VAST.msgtype.SEND: {
                // extract targets
               var n;
               n = pack.msg.targets.length;

               // restore targets
               pack.targets.clear ();
               var target;
               for (var i=0; i < n; i++)
               {
                   target = pack.targets[i];
                   pack.targets.push(target);
               }

               // deliver to the the targets' relays
               in_msg.reset ();
               in_msg.msgtype = (app_msgtype << VAST_MSGTYPE_RESERVED) | MESSAGE;

               var failed_targets;
               failed_targets = sendClientMessage (pack, 0, failed_targets);
               removeFailedSubscribers(failed_targets);
            }
            break;

            // message specific to the origin matcher
            case VAST.msgtype.ORIGIN_MESSAGE: {
                // check if we've gotten origin matcher's address via MATCHER_WORLD_INFO
                    if (_origin_id != _origin_addr.host_id)
                    {
                        LOG.warn("matcher.js: ORIGIN_MESSAGE -> origin [" + _origin_id + "] address not known, cannot send for [" + from_id + "]");
                        break;
                    }
                    // forward to the origin matcher's client component directly
                    pack.msg.msggroup = VAST.msggroup.MSG_GROUP_VAST_CLIENT;

                    // prepare target
                    pack.targets.push(_origin_id);

                    // if we don't yet have connection to origin, make sure we have
                    if (!_net.isConnected(_origin_id))
                        notifyMapping(_origin_addr.host_id, _origin_addr);

                    // if at least one message is sent, then it's successful
                    // NOTE: there's no handling in case of failure
                    // TODO: What message type should be here?
                    _msg_handler.sendMessage(pack.targets,VAST.msgtype.ORIGIN_MESSAGE,pack.msg, VAST.priority.HIGHEST, true);
            }
            break;

            // transfer of subscription
            case VAST.msgtype.SUB_TRANSFER: {
                // extract # of subscriptions
                var n;
                n = pack.msg.subs.length;
                var sub;

                var success = 0;
                for (var i=0; i < n; i++) {
                    sub = pack.msg.subs[i];

                    // NOTE by default a transferred subscription is not owned
                    //      it will be owned if a corresponding ownership transfer is sent (often later)
                    if (!_subscriptions.hasOwnProperty(sub.id))
                    {
                        if (addSubscription(sub, false))
                            success++;
                    }
                    else
                    {
                        // update only
                        // NOTE that we do not change any ownership status,
                        //      but time sent by remote host is used
                        if (updateSubscription(sub.id, sub.aoi, sub.time, sub.relay))
                        {
                            success++;

                            // remove all current AOI neighbor records, so we can notify the new Client of more accurate neighbor states
                            //_subscriptions[sub.id].clearNeighbors ();
                        }
                    }
                }

                LOG.debug("matcher.js: [" + _self.id + "] SUBSCRIBE_TRANSFER " + n + " sent " + success + " success");
            }
            break;

            // update subscription
            case VAST.msgtype.SUB_UPDATE: {
                // extract # of subscriptions
                var n, sub_id, aoi;
                n = pack.msg.subs.length;

                var missing_list;

                for (var i=0; i < n; i++)
                {
                    // TODO: also send time to ensure only the lastest gets used
                    sub_id = pack.msg.subs[i];
                    aoi = pack.msg.aoi;

                    if (!updateSubscription(sub_id, aoi, 0))
                    {
                        // subscription doesn't exist, request the subscription
                        // this happens if the subscription belongs to a neighboring matcher but AOI overlaps with my region
                        missing_list.push(sub_id);
                    }
                }

                if (missing_list.length > 0)
                    // TODO: try not to use requestObjects publicly?
                    _VSOpeer.requestObjects (from_id, missing_list);
            }
            break;

            //
            case VAST.msgtype.NEIGHBOR_REQUEST: {
                var sub_id, neighbor_id;
                sub_id = pack.msg.sub_id;
                neighbor_id = pack.msg.neighbor_id;

                if (!_subscriptions.hasOwnProperty(sub_id))
                {
                    _subscriptions[sub_id].clearStates(neighbor_id);
                }
            }
            break;

            // record stats
            case VAST.msgtype.STAT: {
                if (!isGateway())
                {
                    LOG.error("packetHandler.STAT: only gateway can record stat (I'm not one)");
                    break;
                }



                // extract message type
                var type = pack.msg.type;

                switch (type)
                {
                // JOIN
                case 1:
                    LOG.debug("packetHandler.STAT: [" + pack.src + "] joins");
                    break;

                // LEAVE
                case 2:
                    LOG.debug("packetHandler.STAT: [" + pack.src + "] leaves");
                    break;

                // message type unrecognized
                default:
                    LOG.error("packetHandler.STAT: unrecognized type: " + type);
                    break;
                }
            }
            break;

            // process universal VASTnet message, msgtype = 0
            case DISCONNECT: {
                    // NOTE: the disconnecting host may be either a regular client
                    //       or a matcher host. In the latter case, we should also
                    //       notify the VONpeer component of its departure

                    // removing a simple client (subscriber)
                    subscriberDisconnected (pack.src);

                    // NOTE: it's possible the disconnecting host has both client & matcher components
                    // so we still need to do the following processing

                    // notify the VONPeer component
                    pack.msgtype = VSO_DISCONNECT;
                    _VSOpeer.handleMessage (pack);

                    // remove a matcher
                    refreshMatcherList ();

                    // if I'm gateway, also check for origin matcher disconnection
                    if (isGateway () && isOriginMatcher (pack.src))
                        originDisconnected (pack.src);
            }
            break;

            default:
                // packet unhandled
                LOG.debug('VAST Matcher: message unprocessed');
                return false;
            break;
        }

        // successfully handle packet
        return true;
    }

    var _connHandler = this.connHandler = function (id) {
        LOG.debug('VAST matcher [' + id + '] connected');
    }

    var _disconnHandler = this.disconnHandler = function (id) {
        LOG.debug('VAST matcher [' + id + '] disconnected');

        // generate a BYE message
        var pack = new VAST.pack(
            VAST.msgtype.BYE,
            {},
            VAST.priority.HIGHEST);

        _packetHandler(id, pack);
    }

    /////////////////////
    // msg_handler methods
    //

    var _that = this;

    // function to create a new net layer
    this.init = function (self_id, port, onDone) {

        self_id = self_id || VAST.ID_UNASSIGNED;
        port = port || VAST_DEFAULT_PORT;

        // create message handler manager and add self as one of the handlers
        var handler = new msg_handler(self_id, port, function (local_addr) {

            // NOTE: this will cause initStates() be called
            handler.addHandler(_that);

            // notify done
            if (typeof onDone === 'function')
                onDone(local_addr);
        });
    }

    var _initStates = this.initStates = function (msg_handler) {

        if (msg_handler !== undefined) {

            _msg_handler = msg_handler;

            var id = _msg_handler.getID();
            LOG.warn('VAST_matcher initStates called with msg_handler, id: ' + id);

            // add convenience references
            _storeMapping = _msg_handler.storeMapping,
            _getID =        _msg_handler.getID,
            _disconnect =   _msg_handler.disconnect,
            _sendMessage =  _msg_handler.sendMessage,
            _sendPack =     _msg_handler.sendPack;

            // add VON peer as self node
            _self = new VON.peer();

            // set debug mode
            _self.debug(false);
            _msg_handler.addHandler(_self);
        }
    }

    /////////////////////
    // constructor
    //
    LOG.debug('VAST constructor called');

    //
    //  connect with handler
    //

    var _msg_handler;

    // convenience references
    var _storeMapping, _getID, _disconnect, _sendMessage, _sendPack;

    //
    // private variables
    //

    var _world_id = 0;

    // state of joining
    var _state = VAST.state.ABSENT;

    // reference to self node (a VON peer)
    var _self;

    // list of origin matchers
    _origins = [];

}

// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = VAST_matcher;
