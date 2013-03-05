
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
    settings = {port};
    pos  = {x, y}
    addr = {host, port}
    area = {pos, radius}
    msg  = {from_id, size, type, data, is_reliable}  // message sent & received by clients
    sub  = {sub_id, subscriber, layer, aoi, relay}   // subscription info
    
    sub_CB(result, subID)               // callback to receive subscribe result (success/fail)
    neighbor_CB(list)                   // callback to receive neighbor (node) list
    recv_CB(msg)                        // callback to receive any messages
    
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

// config

function VAST_matcher(recv_callback, settings) {
    
    // store callback to notify received messages
    var _recv_CB = recv_callback;
    
    //
    // public methods
    //
    
    // join the matcher to a VON 
    this.join = function (done_CB) {
    
        // join VON network
        var id, port;
        
        _self.init(id, port, function () {
            // when done
        
        });    
    }
      
    //
    // private methods
    //
    
    // send to gateway a message on a given handler
    var _sendGatewayMessage = function (pack) {
    
        pack.targets = [];
        pack.targets.push(VAST_ID_GATEWAY);
        _sendPack(pack, true);
    }
    
    // check whether current node is a gateway
    var _isGateway = function () {
        return (_self.getSelf().id === VAST_ID_GATEWAY);
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
    /*            
                // find the address of the origin matcher
                // TODO: send message to start up a new origin matcher, if the world is not instanced yet
                if (_origins.find (world_id) == _origins.end ())
                {
                    printf ("Gateway [%llu] JOIN: creating origin matcher for world (%u)\n", _self.getSelf().id, world_id);

                    // promote one of the spare potential nodes
                    Addr new_origin;

                    // TODO: if findCandidate () fails, insert new matcher hosted by gateway?
                    // NOTE: we use a loop as it's possible candidates already failed
                    bool promote_success = false;
                    while (findCandidate (new_origin))
                    {                                       
                        // send promotion message
                        notifyMapping (new_origin.host_id, &new_origin);

                        // record the init if send was success
                        if (initMatcher (world_id, new_origin.host_id, new_origin.host_id))
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
                        LogManager::instance ()->writeLogFile ("Gateway JOIN: no candidate matchers promoted, for client [%llu] requesting world: %d\n", in_msg.from, world_id);
                    }
                    else
                    {
                        storeRequestingClient (world_id, in_msg.from);
                    }
                }
                // if origin matcher for the requested world exists, reply the client
                else
                {                                    
                    id_t matcher_id = _origins[world_id];

                    if (_matchers.find (matcher_id) == _matchers.end ())
                    {
                        LogManager::instance ()->writeLogFile ("Gateway JOIN: origin matcher [%llu] cannot be found for world [%u]\n", matcher_id, world_id);

                        if (matcher_id == 0)
                        {
                            // TODO: find what causes this
                            LogManager::instance ()->writeLogFile ("Gateway JOIN: matcher_id = 0, should not happen, remove it\n");
                            _origins.erase (world_id);
                        }
                        break;
                    }

                    // if the matcher is still in the process of being promoted, record client request
                    if (_matchers[matcher_id].state == PROMOTING)
                    {
                        storeRequestingClient (world_id, in_msg.from);
                        break;
                    }
                                        
                    // send reply to joining client
                    // NOTE: that we send directly back, as this is a gateway response
                    Message msg (NOTIFY_MATCHER);
                    msg.priority = 1;
                    msg.msggroup = MSG_GROUP_VAST_CLIENT;
                    msg.store (_matchers[matcher_id].addr);
                    msg.addTarget (in_msg.from);
                    sendMessage (msg);

                    printf ("Gateway JOIN replies [%llu] with origin matcher [%llu] on world (%u)\n", in_msg.from, _origins[world_id], world_id);
                }
                */
            }
            break;
            
            case VAST.msgtype.SUB: {

                // NOTE: we allow sending SUBSCRIBE for existing subscription if
                //       the subscription has updated (for example, the relay has changed)

                LOG.debug('[' + _self.id + '] VASTMatcher SUBSCRIBE from [' + from_id + ']'); 
                
                // extract subscription
                var sub = new VAST.sub;
                sub.parse(pack.msg);

                /*
                // query the closest matcher               
                Voronoi *voronoi = _VSOpeer->getVoronoi ();

                id_t closest = voronoi->closest_to (sub.aoi.center);

                // check if we should accept this subscription or forward
                if (voronoi->contains (_self.id, sub.aoi.center) || 
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
                        sub.id = _net->getUniqueID (ID_GROUP_VON_VAST);
                    else
                        printf ("VASTMatcher [%llu] using existing ID [%llu]\n", in_msg.from, sub.id);

                    // by default we own the client subscriptions we create
                    // we may simply update existing subscription when clients re-subscribe due to matcher failure
                    map<id_t, Subscription>::iterator it = _subscriptions.find (sub.id);
                    if (it == _subscriptions.end ()) 
                        addSubscription (sub, true);
                    else
                    {
                        bool is_owner = true;

                        updateSubscription (sub.id, sub.aoi, 0, &sub.relay, &is_owner);
                    }

                    // notify relay of the client's subscription -> hostID mapping
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
                    if (_closest.find (sub.id) != _closest.end ())
                        _closest.erase (sub.id);

                    // record the subscription request                    
                    LogManager::instance ()->writeLogFile ("VASTMatcher: SUBSCRIBE request from [%llu] success\n", in_msg.from);
                }
                else
                {
                    // forward the message to neighbor closest to the subscribed point
                    in_msg.reset ();
                    in_msg.targets.clear ();
                    in_msg.addTarget (closest);                         

                    sendMessage (in_msg);
                }
                */
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
    this.init = function (self_id, port, done_CB) {
    
        self_id = self_id || VAST_ID_UNASSIGNED;
        port = port || VAST_DEFAULT_PORT;
        
        // create message handler manager and add self as one of the handlers
        var handler = new msg_handler(self_id, port, function (local_addr) {
                    
            // NOTE: this will cause initStates() be called
            handler.addHandler(_that);
            
            // notify done
            if (typeof done_CB === 'function')
                done_CB(local_addr);        
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
    
    // state of joining
    var _state = VAST.state.ABSENT;
    
    // reference to self node (a VON peer)
    var _self;
          
}

// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = VAST_matcher;
