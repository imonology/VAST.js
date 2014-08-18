
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
    The basic interface for all major VAST functions.
    supporting spatial publish subscribe (SPS) 

    supported functions:
    
    // basic callback / structure
    pos  = {x, y}
    addr = {host, port}
    area = {pos, radius}
    msg  = {from_id, size, type, data, is_reliable}  // message sent & received by clients
    sub  = {sub_id, subscriber, layer, aoi, relay}   // subscription info
    
    sub_CB(result, subID)               // callback to receive subscribe result (success/fail)
    neighbor_CB(list)                   // callback to receive neighbor (node) list
    recv_CB(msg)                        // callback to receive any messages
    
    // constructor
    VAST(recv_CB, GW_addr)
    
    // basic functions
    subscribe(layer, area, sub_CB)      subscribe for an area at a given layer
    publish(layer, area, msg)           publish a message to an area at a given layer
    move(subID, area)                   move a subscription to a new position
    send(id, msg)                       send a message to specified user(s)
    list(area, neighbor_CB)             get a list of subscribers within an area
   
    // stat / accessors 
    getPhysicalNeighbors()              get a list of physical neighbors currently known
    getLogicalNeighbors()               get a list of logical neighbors currently known
    reportGateway(msg)                  send some custom message to gateway (for stat / record keeping)
    reportOrigin(msg)                   send some custom message to origin matcher (for stat / record keeping)
    getStat()                           get stat stored locally
    getSelf()                           get info on self node
    getSubID()                          get my current subscription ID (should return multiple?)
    getWorldID()                        get my world ID
    getLatency(msgtype)                 get latency stat for a particular message type
    
    // state report
    isJoined()                          check if I'm joined
    isRelay()                           check if I'm a Relay node
    isPublic()                          check if I have public address (IP) so may serve
     
    history:
        2012-07-06              initial version (convert interface from VAST.h)
        2012-09-10              define interface & begin implementation
*/


require('./common.js');

var msg_handler = msg_handler || require('./net/msg_handler.js');

// config
var VAST_DEFAULT_PORT       = 37;         // by default which port does the node listen
var TIMEOUT_SUBSCRIBE       = (5);        // number of seconds before re-attempting to subscribe 

//var TIMEOUT_REMOVE_GHOST  = (5);        // # of seconds before removing ghost objects at clients

function VAST_client(recv_callback, GW_addr) {

    // callback to notify subscribed messages received
    var _recv_CB = recv_callback;

    // info about the gateway server
    var _gateway = GW_addr || "127.0.0.1:37700";    
    
    // state of joining
    var _state = VAST.state.ABSENT;

    // my subscription record
    var _sub = VAST.sub();
    
    // callback to notify when subscribe is done
    var _sub_CB = undefined;
    
    // information regarding current node
    var _self;

    // id for owner matcher, default to gateway
    var _matcher_id = VAST_ID_GATEWAY;
    
/*
        // variables used by VASTClient component

        vector<Node *>      _neighbors;     // list of current AOI neighbors
        vector<Node *>      _physicals;     // list of physical neighbors
        vector<Node *>      _logicals;      // list of logical neighbors
        
        id_t                _closest_id;    // hostID for the closest neighbor matcher
        VASTRelay          *_relay;         // pointer to VASTRelay (to obtain relayID)        

        // timeouts
        timestamp_t         _next_periodic;     // next timestamp to perform tasks
        timestamp_t         _timeout_subscribe; // timeout for re-attempt to subscribe        
        map<id_t, timestamp_t> _last_update;    // last update time for a particular neighbor

        
        // storage for incoming messages        
        vector<Message *>   _msglist;   // record for incoming messages
        VASTBuffer          _recv_buf;  // a receive buffer for incoming messages
        Message *           _lastmsg;   // last message received from network (to be deleted)
                                        // TODO: a better way for it?
       
        // stats
        map<msgtype_t, StatType>  _latency; // latencies for different message types 
*/    
     
    //
    // public methods
    //
        
    // subscribe for an area at a given layer
    this.subscribe = function (layer, area, sub_CB) {
  
        // record callback when subscribe is done
        _sub_CB = sub_CB;
        
        // store host to which matching publication should be sent (back to myself)
        _sub.host_id = _getID();
        
        //_sub.host_id = _net->getHostID ();
        //_sub.active  = false;
        //_sub.relay   = _net->getAddress (_relay->getRelayID ());
                
        // record my subscription, not yet successfully subscribed  
        // NOTE: currently we assume we subscribe only one at a time  
        //       also, it's important to record the area & layer first, so that
        //       re-subscribe attempt may be correct (in case the check below is not passed yet)        
                       
        // NOTE: because my hostID is unique, it guarantee my subscription ID is also unique
        if (_sub.id === VAST_ID_UNASSIGNED)
            _sub.id = _getID();

        _sub.aoi    = area;
        _sub.layer  = layer;
                
        // activate re-try mechanism
        // NOTE: is this such a good idea (will result in request flooding?)
        _subscribeRetry();
        
        /*
        // if matcher or relay is not yet known, wait first
        if (_state != JOINED || _relay->isJoined () == false)
        {
            LogManager::instance ()->writeLogFile ("VASTClient::subscribe () [%llu] matcher or relay not ready, wait first. matcher: [%llu], relay joined: %s\n", _self.id, _matcher_id, (_relay->isJoined () ? "true" : "false"));
            return false;
        }
        */
        
    }
    
    // publish a message to an area at a given layer
    this.publish = function (layer, area, msg) {
    
    }
    
    // move a subscription to a new position
    this.move = function (subID, area) {
    }

    // send a message to specified user(s)
    this.send = function (id, msg) {
    }

    // get a list of subscribers within an area
    this.list = function (area, neighbor_CB) {
    } 
    
    //
    // private methods
    //
    
    var _subscribeRetry = function () {
    
        // no need to re-try if subscription is completed
        if (_sub_CB === undefined)
            return;
                    
        LOG.debug('[' + _self.id + '] sends SUBSCRIBE request to [' + _matcher_id + ']');

        // set timeout to re-try, necessary because it takes time to send the subscription, which can be lost       
        setTimeout(_subscribeRetry, 1000 * TIMEOUT_SUBSCRIBE);        
        
        // send out subscription request to owner matcher
        var pack = new VAST.pack(VAST.msgtype.SUB, _sub, VAST.priority.HIGH);
        _sendMatcherMessage(pack);        
    }    
    
    // send to gateway a message on a given handler
    var _sendGatewayMessage = function (pack) {
    
        pack.targets = [];
        pack.targets.push(VAST_ID_GATEWAY);
        _sendPack(pack, true);
    }

    // send to gateway a message on a given handler
    var _sendMatcherMessage = function (pack) {

        pack.targets = [];
        pack.targets.push(_matcher_id);
        _sendPack(pack, true);
    }
    
    //
    // handlers to communicate with network layer
    //
    
    var _packetHandler = this.packetHandler = function (from_id, pack) {

        // if join is not even initiated, do not process any message        
        if (_state == VAST.state.ABSENT) {
            LOG.error('node not yet join, should not process any messages');
            return false;
        }
        
        LOG.debug('VAST Client [' + _self.id + '] ' + VAST.msgstr[pack.type] + ' from [' + from_id + ']');        

        switch (pack.type) {
                       
            // VON's query, to find an acceptor that can take in a joining node
            case VAST.msgtype.VAST_SOMETHING: {
            }
            break;

            default: 
                // packet unhandled
                LOG.debug('VAST Client: message unprocessed');
                return false;
            break; 
        }

        // successfully handle packet
        return true;
    }
   
    var _connHandler = this.connHandler = function (id) {
        LOG.debug('VAST Client [' + id + '] connected');
    }
    
    var _disconnHandler = this.disconnHandler = function (id) {
        LOG.debug('VAST Client [' + id + '] disconnected');
        
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
            LOG.warn('VAST_client initStates called with msg_handler, id: ' + id);
                           
            // add convenience references
            _storeMapping = _msg_handler.storeMapping,
            _getID =        _msg_handler.getID,      
            _disconnect =   _msg_handler.disconnect,
            _sendMessage =  _msg_handler.sendMessage,
            _sendPack =     _msg_handler.sendPack;                
                        
            // add matcher as handler
            var matcher = new VAST.matcher();
            _msg_handler.addHandler(matcher);
            
            // create a self node
            _self = new VAST.node(_getID());
            
            // TODO: move this somewhere? so the above can be extracted as standard
            // do constructor work
    
            // ensure gateway's type is correct
            // TODO: validate gateway address
            var addr = new VAST.addr();
            addr.parse(_gateway);
            _gateway = addr;
                
            // store gateway address
            _storeMapping(VAST_ID_GATEWAY, _gateway);            
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
     
}

// export the class with conditional check
if (typeof module !== "undefined")
    module.exports = VAST_client;
