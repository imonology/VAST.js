
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
    VON_peer.js
    
    The basic interface for a basic VON peer 
    supporting distributed neighbor discovery and management

    supported functions:
    
    // basic callback / structure
    addr    = {host, port};    
    center  = {x, y};
    aoi     = {center, radius};
    endpt   = {id, addr, last_accessed};
    node    = {id, endpt, aoi, time}; 
    pack    = {type, msg, group, priority, targets}  // message package during delivery
    vast_net (see definition in vast_net.js)
    
    // constructor
    VON_peer(id, port, aoi_buffer, aoi_use_strict)
    
    // basic functions
    join(addr, aoi, done_CB)            join a VON network with a given gateway (entry) 
    leave()                             leave the VON network
    move(aoi, send_time)                move the AOI to a new position (or change radius)
    list();                             get a list of AOI neighbors
    send(id, msg);                      send a message to a given node
    
    // accessors
    isJoined();                         check if we've joined the VON network
    isNeighbor(id);                     check if a given ID is an existing neighbor 
    getVoronoi();                       get a reference to the Voronoi object
    getNeighbor(id);                    get a particular neighbor's info given its ID
    getSelf();                          get self info
    getEdges();                         get a list of edges known to the current node
      
    history:
        2012-07-07              initial version (from VAST.h)
*/

require('./common.js');

// to be inherited by VON.peer
var msg_handler = msg_handler || require('./net/msg_handler.js');

var Voronoi = require('./vast_voro.js');

// config
var VON_DEFAULT_PORT        = 37;       // by default which port does the node listen
var AOI_DETECTION_BUFFER    = 32;       // detection buffer around AOI
var MAX_TIMELY_PERIOD       = 10;       // # of seconds considered to be still active
var MAX_DROP_SECONDS        = 2;        // # of seconds to disconnect a non-overlapped neighbor
var NONOVERLAP_MULTIPLIER   = 1.25;     // multiplier for aoi buffer for determining non-overlap
var TICK_INTERVAL           = 100;      // interval (in milliseconds) to perform tick tasks

// flags
var OVERLAP_CHECK_ACCURATE = false;     // whether VON overlap checks are accurate

// enumation of VON message
// TODO: combine DISCONNECT & BYE?
var VON_Message = {
    VON_DISCONNECT: 0, // VON's disconnect
    VON_QUERY:      1, // VON's query, to find an acceptor that can take in a joining node
    VON_NODE:       2, // VON's notification of new nodes 
    VON_HELLO:      3, // VON's hello, to let a newly learned node to be mutually aware
    VON_HELLO_R:    4, // VON's hello response
    VON_EN:         5, // VON's enclosing neighbor inquiry (to see if my knowledge of EN is complete)
    VON_MOVE:       6, // VON's move, to notify AOI neighbors of new/current position
    VON_MOVE_F:     7, // VON's move, full notification on AOI
    VON_MOVE_B:     8, // VON's move for boundary neighbors
    VON_MOVE_FB:    9, // VON's move for boundary neighbors with full notification on AOI
    VON_BYE:       10  // VON's disconnecting a remote node
};

var VON_Message_String = [
    'VON_DISCONNECT',
    'VON_QUERY',
    'VON_NODE', 
    'VON_HELLO',
    'VON_HELLO_R',
    'VON_EN',
    'VON_MOVE',
    'VON_MOVE_F',
    'VON_MOVE_B',    
    'VON_MOVE_FB',
    'VON_BYE'
];

// TODO: msg priority is probably not VON-specific
var VON_Priority = {
    HIGHEST:        0,
    HIGH:           1,
    NORMAL:         2,
    LOW:            3,
    LOWEST:         4
};

// TODO: node state is probably not VON-specific
var NodeState = {
    ABSENT:         0,
    QUERYING:       1,           // finding / determing certain thing
    JOINING:        2,           // different stages of join
    JOINED:         3,    
};

// status on known nodes in the neighbor list, can be either just inserted / deleted / updated
var NeighborUpdateStatus = {
    INSERTED:       1,
    DELETED:        2,
    UNCHANGED:      3,
    UPDATED:        4
};

// states for an enclosing neighbor
var NeighborState = {
    NEIGHBOR_REGULAR:       0,
    NEIGHBOR_OVERLAPPED:    1,
    NEIGHBOR_ENCLOSED:      2 
};

// definition of a VON peer
function VONPeer(l_self_id, l_port, l_aoi_buffer, l_aoi_use_strict) {
        
    /////////////////////
    // public methods
    //
    
    // join a VON network with a given gateway (entry)    
    var _join = this.join = function (GW_addr, aoi, done_CB) {
        
        // check if already joined
        if (_state === NodeState.JOINED) {
            LOG.warn('VON_peer.join(): node already joined');
            if (done_CB !== undefined)
                done_CB(_self.id);
            return;
        }

        // ensure function input conforms to internal data structure
        var addr = new VAST.addr();
        addr.parse(GW_addr);
        LOG.debug('VON_peer join() called, joining: ' + addr.toString());
                     
        // change internal state
        _state = NodeState.JOINING; 
                
        // keep reference to call future once join is completed
        _join_done_CB = done_CB;
        
        // set self AOI
        _self.aoi.update(aoi);
                     
        LOG.debug('calling getHost()');
        
        // create self object
        _net.getHost(function (local_IP) {
        
            LOG.debug('local IP: ' + local_IP);
   
            // update address info for self
            _self.endpt = new VAST.endpt(local_IP, l_port);
              
            // return value is actual port binded
            _net.listen(l_port, function (actual_port) {
                // update port of self if different from the one attempting to bind
                if (actual_port != l_port)
                    _self.endpt.addr.port = actual_port;
            
                // store self node to neighbor map
                _insertNode(_self);
                            
                // if I'm gateway, no further action required
                // TODO: doesn't look clean, can gateway still send query request to itself?
                //       that'll be a more general process
                //       (however, will deal with how to determined 'already joined' for gateway)
                if (_self.id === VAST_ID_GATEWAY)
                    return _setJoined();
                       
                // send out join request
                // TODO: if id is not correct, remote host will send back correct one
                _net.storeMapping(VAST_ID_GATEWAY, GW_addr);                
                _sendMessage(VAST_ID_GATEWAY, VON_Message.VON_QUERY, _self, VON_Priority.HIGHEST);
                        
            }); 
        });             
    }
    
    // leave the VON network
    var _leave = this.leave = function () {

        LOG.debug('VON_peer leave() called, neighbor size: ' + Object.keys(_neighbors).length);
    
        // always notify neighbors
        var notify_neighbors = true;
    
        // see if we need to explicityly notify neighbors of our leave
        if (notify_neighbors) {
        
            var targets = [];
            for (var id in _neighbors) {
                if (_isSelf(id) === false)
                    targets.push(id);
            }

            _sendBye(targets);
                        
            // TODO: notify potential_neighbors
        }
        
        // clean data structure
        _initStates();
        
        // remove ticking interval
        // TODO: remove js-specific code or collect them
        if (_interval_id !== undefined) {
            clearInterval(_interval_id);
            _interval_id = undefined;
        }
    }    

    // move the AOI to a new position (or change radius)    
    var _move = this.move = function (aoi, sendtime) {
        LOG.debug('VON_Peer moving to: ' + aoi.center.toString());

        try {
            if (typeof aoi.radius === 'string')
                aoi.radius = parseInt(aoi.radius);
            else if (typeof aoi.radius !== 'number') {
                LOG.error('radius format incorrect, ignore move request'); 
                return _self.aoi;
            }
        }           
        catch (e) {
            LOG.error('parsing radius error: ' + e);
            return _self.aoi;
        }
        
        _self.aoi.center = aoi.center;

        // check if AOI radius has changed (besides position)        
        var aoi_reshaped = (aoi.hasOwnProperty('radius') && _self.aoi.radius !== aoi.radius);
        if (aoi_reshaped)
            LOG.warn('AOI radius updated to: ' + aoi.radius);
        
        _self.aoi.update(aoi);

        // TODO: check if my new position overlaps a neighbor, if so then move slightly        
        // avoid moving to the same position as my neighbor 
        //_self.aoi.center = _isOverlapped (_self.aoi.center);
        
        // record send time of the movement
        // this is to help receiver determine which position update should be used
        // also to help calculate latency
        // if external time is supplied (we respect the sender's time), then record it
        _self.time = (sendtime != undefined ? sendtime : UTIL.getTimestamp());        
        _updateNode(_self);
       
        // notify all connected neighbors, pack my own node info & AOI info

        // if AOI radius has changed, send full self info
        // otherwise just send new center for AOI
        // NOTE: we make a copy for this, so any modifications required won't affect original
        var node_info = _getNode(_self.id);
        
        // remove info not needed by VON_MOVE
        delete node_info['endpt'];
                
        if (aoi_reshaped === false)
            delete node_info.aoi['radius'];
            
        // go over each neighbor and do a boundary neighbor check	
        var boundary_list = [];
        var regular_list = [];

        for (var id in _neighbors) {
            
            if (_isSelf(id))
                continue;
            // save boundary neighbors for later
            if (_voro.is_boundary (id, _self.aoi.center, _self.aoi.radius))
                boundary_list.push(id);                
            else
                regular_list.push(id);
        }
        
        // create a delivery package to send
        // NOTE: For now we send move reliably, but can experiment with unreliable delivery        
        var pack = new VAST.pack(
            VON_Message.VON_MOVE,
            node_info,
            VON_Priority.HIGHEST);
            
        // send to regular neighbors            
        pack.targets = regular_list;
        pack.type = (aoi_reshaped ? VON_Message.VON_MOVE_F : VON_Message.VON_MOVE);        
        _sendPack(pack, true);
        
        // send MOVE to boundary neighbors
        pack.targets = boundary_list;
        pack.type = (aoi_reshaped ? VON_Message.VON_MOVE_FB : VON_Message.VON_MOVE_B);
        _sendPack(pack, true);
        
        return _self.aoi;    
    }
    
    // get a list of AOI neighbors
    this.list = function () {
        return _neighbors; 
    }
    
    // send a message to a given node
    var _send = this.send = function (id, msg) {

    }
    
    /////////////////////
    // public accessors
    //
    
    // check if we've joined the VON network
    var _isJoined = this.isJoined = function () {        
        return (_state === NodeState.JOINED);
    }
    
    // check if a given ID is an existing neighbor  
    var _isNeighbor = this.isNeighbor = function (id) {    
        return _neighbors.hasOwnProperty(id);    
    }

    // get a reference to the Voronoi object
    this.getVoronoi = function () {
        return _voro;
    }
    
    // get a particular neighbor's info given its ID
    this.getNeighbor = function (id) {
        return (_neighbors.hasOwnProperty(id) ? _neighbors[id] : undefined);
    }    
    
    // get self info
    this.getSelf = function () {
        return _self;
    }    

    // get a list of edges known to the current node
    this.getEdges = function () {
        return _voro.getedges();
    }    
    
    /////////////////////
    // internal methods
    //
    
    //
    // check helpers
    //
    
    var _isSelf = function (id) {
        return (_self.id == id);
    }
    
    // is a particular neighbor within AOI
    // NOTE: right now we only consider circular AOI, not rectangular AOI.. 
    // NOTE: l_aoi_buffer is a paramter passed to VON_peer when creating instance    
    var _isAOINeighbor = function (id, neighbor) {
        return _voro.overlaps(id, neighbor.aoi.center, neighbor.aoi.radius + l_aoi_buffer, OVERLAP_CHECK_ACCURATE);
    }

    // whether a neighbor is either 1) AOI neighbor or 2) an enclosing neighbor
    // NOTE: enclosing neighbor is checked mutually, as it's possible
    //       for A to not consider B as enclosing neighbor, but B sees A as enclosing neighbor    
    var _isRelevantNeighbor = function (node1, node2) {
                 
        return (_voro.is_enclosing(node1.id, node2.id) || 
                _isAOINeighbor(node1.id, node2) || 
                _isAOINeighbor(node2.id, node1));                    
    }

    // whether a neighbor has stayed alive with regular updates
    // input period is in number of seconds
    var _isTimelyNeighbor = function (id, period) {
        return true;
/*
        if (_isNeighbor (id) == false)
            return false;

        var timeout = period * _net.getTimestampPerSecond ();   
        return ((_tick_count - _neighbors[id].endpt.lastAccessed) < timeout);
*/
    }

    //
    // node management
    //
  
    var _insertNode = function (node) {
    
        //LOG.debug('insertNode [' + node.id + '] isNeighbor: ' + _isNeighbor(node.id));
        
        // check for redundency
        if (_isNeighbor(node.id))     
            return false;
          
        // notify network layer about connection info, no need to actually connect for now
        _net.storeMapping (node.id, node.endpt.addr);
        
        // update last access time
        node.endpt.lastAccessed = UTIL.getTimestamp();
        //LOG.debug('last accessed: ' + node.endpt.lastAccessed);
 
        // store the new node to 
        _voro.insert (node.id, node.aoi.center);
        
        // store to neighbors
        _neighbors[node.id] = node; 

        // init mapping of neighbor's states
        _neighbor_states[node.id] = {};
        
        // TODO: still needed?
        // record time to determine a neighbor is no longer active and can disconnect
        _time_drop[node.id] = 0;
        
        // update node status
        _updateStatus[node.id] = NeighborUpdateStatus.INSERTED;

        LOG.debug('[' + _self.id + '] insertNode neighbor (after insert) size: ' + Object.keys(_neighbors).length + ' voro: ' + _voro.size());
        
        return true;
    }

    var _deleteNode = function (id) {
    
        // NOTE: it's possible to remove self or EN, use carefully.
        //       we don't check for that to allow force-remove in
        //       the case of disconnection by remote node, or 
        //       when leaving the overlay (removal of self)
        if (_isNeighbor(id) === false)            
            return false;        
        
        // remove from Voronoi & neighbor list
        _voro.remove (id);
        delete _neighbors[id];
        
        // clean neighbor states
        _neighbor_states[id] = undefined;
        delete _neighbor_states[id];
            
        delete _time_drop[id];                
        _updateStatus[id] = NeighborUpdateStatus.DELETED;

        return true;
    }
    
    var _updateNode = function (node) {    

        if (_isNeighbor (node.id) === false)
            return false;
        
        // only update the node if it's at a later time
        if (node.time < _neighbors[node.id].time)
            return false;

        _voro.update (node.id, node.aoi.center);
        _neighbors[node.id].update (node);

        // NOTE: should not reset drop counter here, as it might make irrelevant neighbor 
        //       difficult to get disconnected
        //_time_drop[node.id] = 0;

        // update last access time of this node
        node.endpt.lastAccessed = UTIL.getTimestamp ();

        // set flag so that updated nodes' states are also sent 
        // instead of sending only updates for newly inserted node
        if (_updateStatus.hasOwnProperty(node.id) === false || _updateStatus[node.id] !== NeighborUpdateStatus.INSERTED)
            _updateStatus[node.id] = NeighborUpdateStatus.UPDATED;

        return true;
    }

    // get a clean node to send (no extra stuff in 'node.aoi.center')
    // TODO: remove this?
    // do not keep anything else besides the original attributes
    var _getNode = function (id) {
        var node = new VAST.node();
        node.parse(_neighbors[id]);
        var center = new VAST.pos();
        center.parse(node.aoi.center);
        node.aoi.center = center;
        return node;
    }
    
    //
    // regular processing (done periodically)
    //
    
    // the master function for all things regular
    var _tick = function () {
    
        //_sendKeepAlive();
        try {
            _contactNewNeighbors();
            _checkNeighborDiscovery();
            _removeNonOverlapped();
        }
        catch (e) {
            LOG.error('tick error: ' + e);
        }
    }
    
    // set current node to be 'joined'
    var _setJoined = function () {
    
        _state = NodeState.JOINED;

        // notify callback
        if (_join_done_CB !== undefined)
            _join_done_CB(_self.id);         
            
        // start ticking
        _interval_id = setInterval(_tick, TICK_INTERVAL);
    }
    
    var _sendKeepAlive = function () {
    
        // simply move a little to indicate keepalive
        if (_isJoined() && _isTimelyNeighbor (_self.id, MAX_TIMELY_PERIOD/2) == false) {
            LOG.debug('[' + _self.id + '] sendKeepAlive ()', _self.id);
            move(_self.aoi);
        }    
    }
        
    var _contactNewNeighbors = function () {

        // check if any new neighbors to contact
        if (Object.keys(_new_neighbors).length === 0)
            return;
    
        //
        // new neighbor notification check
        //
        var new_list = [];      // list of new, unknown nodes               
        var target;

        //LOG.debug('voro nodes before insertion: ' + _voro.size());
        
        // loop through each notified neighbor and see if it's unknown
        for (var target in _new_neighbors) {
                
            // NOTE: be careful that 'target' is now of type 'string', not 'number'
            var new_node = _new_neighbors[target];
            
            // ignore self
            if (_isSelf(new_node.id))
                continue;
            
            // update existing info if the node is known, otherwise prepare to add
            if (_isNeighbor(new_node.id))
                _updateNode(new_node);            
            else {                                
                // insert to Voronoi first to see if this addition indeed is relevant to us                                
                _voro.insert(new_node.id, new_node.aoi.center);            
                new_list.push(new_node.id);
            }
        }
        
        //LOG.debug('voro nodes after insertion: ' + _voro.size());
        
        // check through each newly inserted Voronoi for relevance                      
        for (var i=0; i < new_list.length; ++i) {
        
            target = new_list[i];
            var node = _new_neighbors[target];

            // if the neighbor is relevant and we insert it successfully
            // NOTE that we're more tolerant for AOI buffer when accepting notification
            if (_isRelevantNeighbor (node, _self)) {
                        
                LOG.debug('[' + node.id + '] is relevant to self [' + _self.id + ']');
                
                // store new node as a potential neighbor, pending confirmation from the new node 
                // this is to ensure that a newly discovered neighbor is indeed relevant
                _potential_neighbors[target] = node;

                // notify mapping for sending Hello message
                // TODO: a cleaner way (less notifymapping call?)
                _net.storeMapping(node.id, node.endpt.addr);

                // send HELLO message to newly discovered nodes
                // NOTE that we do not perform insert yet (until the remote node has confirmed via MOVE)
                //      this is to avoid outdated neighbor discovery notice from taking effect
                //LOG.debug('before calling get_en, target: ' + target + ' node.id: ' + node.id);
                //LOG.debug('voro nodes before get_en: ' + _voro.size());
                
                // NOTE: even if en_list is empty, should still send out HELLO
                // empty can occur if initially just two nodes with overlapped positions
                _sendHello(target);
                _sendEN(target);
            }
        }

        // clear up the temporarily inserted test node from Voronoi (if not becoming neighbor)
        for (var i=0; i < new_list.length; ++i)            
            _voro.remove(new_list[i]);
        
        // NOTE: erase new neighbors seems to bring better consistency 
        //       (rather than keep to next round, as in previous version)
        _new_neighbors = {};
    
        // TODO: _potential_neighbors should be cleared once in a while  
        
        LOG.debug('total neighbors (after process neighbors): ' + Object.keys(_neighbors).length);
        LOG.debug('total voro nodes: ' + _voro.size() + '\n');        
    }

    var _checkNeighborDiscovery = function (check_requester_only, check_en_only) {
        
        var req_size = Object.keys(_req_nodes).length;
        if (req_size === 0)
            return;
            
        //LOG.debug(req_size + ' neighbors need neighbor discovery check');
        
        // by default we check only those requested
        if (check_requester_only === undefined)
            check_requester_only = true;
            
        // by default all neighbors are potential candiates to notify
        if (check_en_only === undefined)
            check_en_only = false;

        var requesters = {};
            
        // re-build request list if we need to check all neighbors (instead of those sending MOVE_B or MOVE_FB)
        if (check_requester_only === true)
            requesters = _req_nodes;
        else
            requesters = _neighbors;            
        
        // build a list of nodes to be checked (can be either my enclosing neighbors, or all my neighbors)
        var check_list;
        if (check_en_only)
            check_list = _voro.get_en(_self.id);
        else {
            check_list = [];
            for (var id in _neighbors)
                check_list.push(id);
        }
        
        // list of new neighbors to notify a node requesting neighbor discovery
        var notify_list;
        
        // go over each requesting node
        for (var from_id in requesters) {
        
            // a node requesting for check might be disconnected by now, as requests are processed in batch
            // TODO: is it correct? as this is event-driven now, maybe neighbor list can always be assumed to be correct
            if (_isSelf(from_id) || _isNeighbor(from_id) === false)
                continue;                                       

            // TODO: determine whether clear or new is better / faster (?)
            notify_list = [];

            var known_list = {};            // current neighbor's states
            var state, known_state;
            
            for (var i=0; i < check_list.length; i++) {
            
                var id = check_list[i];
            
                // avoid checking myself or the requester
                if (_isSelf(id) || id === from_id)
                    continue;
                
                // TODO:
                // do a simple test to see if this enclosing neighbor is
                // on the right side of me if I face the moving node directly
                // only notify the moving node for these 'right-hand-side' neighbors                
                
                //if (right_of (id, from_id) == false)
                //    continue;                

                // TODO: need to check whether values of states are correct
                state = NeighborState.NEIGHBOR_REGULAR;
                known_state = NeighborState.NEIGHBOR_REGULAR;
                
                if (_isAOINeighbor(id, _neighbors[from_id]))
                    state = state | NeighborState.NEIGHBOR_OVERLAPPED;
                if (_voro.is_enclosing(id, from_id))
                    state = state | NeighborState.NEIGHBOR_ENCLOSED;

                // notify case1: new overlap by moving node's AOI
                // notify case2: new EN for the moving node                
                if (state != NeighborState.NEIGHBOR_REGULAR) {
                
                    // TODO: check known_state correctness
                    if (_neighbor_states[from_id].hasOwnProperty(id))
                        known_state = _neighbor_states[from_id][id];
                    
                    // note: what we want to achieve is:
                    //       1. notify just once when new enclosing neighbor (EN) is found
                    //       2. notify about new overlap, even if the node is known to be an EN

                    // check if the neighbors not overlapped previously is
                    //    1) currently overlapped, or... 
                    //    2) previously wasn't enclosing, but now is
                    
                    if ((known_state & NeighborState.NEIGHBOR_OVERLAPPED) == 0 && 
                        ((state & NeighborState.NEIGHBOR_OVERLAPPED) > 0 || 
                        ((known_state & NeighborState.NEIGHBOR_ENCLOSED) == 0 && (state & NeighborState.NEIGHBOR_ENCLOSED) > 0)))
                        notify_list.push(id);
                    
                    // store the state of this particular neighbor
                    known_list[id] = state;
                }
            }

            // update known states about neighbors
            delete _neighbor_states[from_id];
            _neighbor_states[from_id] = known_list;

            // notify only moving nodes of new neighbors
            // NOTE: we still update neighbor states for all known neighbors
            if (_req_nodes.hasOwnProperty(from_id) && notify_list.length > 0)
                _sendNodes(from_id, notify_list);  
        }

        _req_nodes = {};
    }

    // check consistency of enclosing neighbors
    var _checkConsistency = function (skip_id) {
    
        // NOTE: must make a copy of the enclosing neighbors, as sendEN will also call get_en ()
        // (still appliable in js?)
        var en_list = _voro.get_en(_self.id);
                                
        // notify my enclosing neighbors to check for discovery        
        for (var i=0; i < en_list.length; i++) {
            var target = en_list[i];
            if (target != skip_id)
                _sendEN (target);
        }                    
    }
    
    // remove neighbors no longer in view
    var _removeNonOverlapped = function () {

        //vector<id_t> delete_list;
        var delete_list = [];
        
        var now = UTIL.getTimestamp ();
        
        // wait time in milliseconds
        var grace_period = now + (MAX_DROP_SECONDS * 1000);

        // go over each neighbor and do an overlap check
        //for (map<id_t, Node>::iterator it = _id2node.begin(); it != _id2node.end(); ++it)
        for (var id in _neighbors) {
        
            // check if a neighbor is relevant (within AOI or enclosing)
            // or if the neighbor still covers me
            // NOTE: the AOI_BUFFER here should be slightly larger than that used for 
            //       neighbor discovery, this is so that if a node is recently disconnect
            //       here, other neighbors can re-notify should it comes closer again
            // TODO: possible to avoid checking every time, simply record some
            //       flag when messages come in, then check whether connection's still active?
            //       or.. simply use network timeout (if available)?
            if (_isSelf(id) ||
                (_isRelevantNeighbor(_self, _neighbors[id], l_aoi_buffer * NONOVERLAP_MULTIPLIER)) && 
                 _isTimelyNeighbor(id)) {
                _time_drop[id] = grace_period;
                continue;
            }
   
            // if current time exceeds grace period, then prepare to delete
            if (now >= _time_drop[id]) {
                delete_list.push(id);
                delete _time_drop[id];
            }
        }
        
        // send BYE message to disconnected node
        return _sendBye(delete_list);
    }
    
    //
    // send helpers
    //
    
    // send node infos (NODE message) to a particular target
    // target:   destination node id
    // list:     a list of neighbor id to be sent
    // reliable: whether to deliver reliably
    var _sendNodes = function (target, list, reliable) {

        LOG.debug('_sendNodes: [' + _self.id + '] sends to [' + target + '] ' + list.length + ' nodes');
        
        // we warn but do not prevent send (this is needed when gateway joins itself as client)
        if (list.length === 0) {
            LOG.warn('sendNodes send out a list of 0 neighbors');
        }
           
        // grab the node info
        var nodes = [];
        for (var i=0; i < list.length; i++)
            nodes.push(_getNode(list[i]));
        
        _sendMessage(target, VON_Message.VON_NODE, nodes, VON_Priority.NORMAL, reliable);
    }
    
    // send a list of IDs to a particular node
    // target:   destination node id
    // list:     a list of id to be sent
    var _sendHello = function (target) {
                    
        LOG.debug('sendHello target: ' + target); 
           
        // prepare HELLO message
        // TODO: do not create new HELLO message every time? (local-side optimization)
        _sendMessage(target, VON_Message.VON_HELLO, _getNode(_self.id), VON_Priority.HIGHEST, true);
    }

    // send a particular node its perceived enclosing neighbors
    var _sendEN = function (target) {
    
        var id_list = _voro.get_en(target);
        if (id_list.length > 0)
            _sendMessage(target, VON_Message.VON_EN, id_list, VON_Priority.HIGH, true);        
    }
    
    var _sendBye = function (targets) {

        var num_deleted = 0;
                
        if (targets.length > 0) {
        
            LOG.debug('sendBye target size: ' + targets.length);
        
            var pack = new VAST.pack(VON_Message.VON_BYE, {}, VON_Priority.HIGHEST);               
            pack.targets = targets;
            _sendPack(pack, true);
                        
            // perform node removal
            for (var i=0; i < targets.length; i++) {
                LOG.debug('removing node: ' + targets[i]);
                if (_deleteNode(targets[i]) === true)
                    num_deleted++;
            }
        }
        
        return num_deleted;
    }
    
    //
    // handlers for incoming messages, connect/disconnect
    //
    
    var _handlePacket = function (from_id, pack) {

        // if join is not even initiated, do not process any message        
        if (_state == NodeState.ABSENT) {
            LOG.error('node not yet join, should not process any messages');
            return false;
        }
        
        LOG.debug('[' + _self.id + '] ' + VON_Message_String[pack.type] + ' from [' + from_id + '], neighbor size: ' + Object.keys(_neighbors).length);        

        switch (pack.type) {
                       
            // VON's query, to find an acceptor that can take in a joining node
            case VON_Message.VON_QUERY: {
            
                // update the joiner's id (if it's a newly joined node)
                if (pack.msg.id === VAST_ID_UNASSIGNED)
                    pack.msg.id = from_id;
            
                // extract message
                var joiner = new VAST.node();
                joiner.parse(pack.msg);                
                LOG.debug('joiner: ' + joiner.toString());
                                
                // TODO: verify message in a systematic way
                if (joiner.endpt.addr.isEmpty()) {
                    LOG.error('joiner has no valid IP/port address, ignore request');
                    break;
                }
                 
                // find the node closest to the joiner
                var closest = _voro.closest_to(joiner.aoi.center);
                
                LOG.debug('closest node found: ' + closest);
                
                // if this is gateway receiving its own request
                if (closest === VAST_ID_UNASSIGNED && Object.keys(_neighbors).length === 1) {
                    LOG.warn('gateway getting its own VON_QUERY, return empty list');
                    _sendNodes (from_id, [], true);
                    break;
                }
  
                LOG.debug('closest node: ' + closest + ' (' + typeof closest + ')');
                                
                // forward the request if a more appropriate node exists
                // TODO: contains() might recompute Voronoi, isRelevantNeighbor below 
                //       also will recompute Voronoi. possible to combine into one calculation?
                if (_voro.contains (_self.id, joiner.aoi.center) === false &&
                    _isSelf (closest) === false &&
                    closest != from_id) {

                    LOG.warn('forward VON_QUERY request to: ' + closest);
                    
                    // re-assign target for the query request
                    pack.targets = [];
                    pack.targets.push(closest);
                    _sendPack(pack);
                }                    
                else {
                
                    // insert first so we can properly find joiner's EN
                    _insertNode (joiner);

                    // I am the acceptor, send back initial neighbor list
                    var list = [];
                    
                    // loop through all my known neighbors and check which are relevant to the joiner to know
                    var out_str = '';
                    for (var id in _neighbors) {                            
                    
                        var neighbor = _neighbors[id];
                        //LOG.debug('checking if neighbor [' + neighbor.id + '] should be notified');                    
                        // store only if neighbor is both relevant and timely
                        // TODO: more efficient check (EN of joiner is calculated multiple times now)
                        
                        var is_relevant = _isRelevantNeighbor(neighbor, joiner);
                        //LOG.debug('is relevant: ' + is_relevant);
                        if (neighbor.id != joiner.id && 
                            is_relevant &&
                            _isTimelyNeighbor(neighbor.id)) {
                            list.push(neighbor.id);
                            out_str += neighbor.id + ' ';
                        }
                    }
                    
                    LOG.debug('notify ' + list.length + ' nodes to joiner: ' + out_str);
                    if (list.length <= 1) {
                        LOG.warn('too few neighbors are notified! check correctness\n');
                        LOG.debug(_voro.to_string());
                    }
                    
                    // send a list of nodes to a specific target node                   
                    _sendNodes (joiner.id, list, true);
                }          
            }
            break;
            
            // process notifications for new nodes
            case VON_Message.VON_NODE: {
                
                // if VON_NODE is received, we're considered joined
                // NOTE: do this first as we need to update our self ID for later VON_NODE process to work
                LOG.warn('checking joining state: ' + _state);
                if (_state === NodeState.JOINING) {

                    // check if we're getting new ID
                    // TODO: is this clean? consider use VON_HELLO first when contacting new node/neighbor?
                    var selfID = _net.getID();
                    LOG.debug('selfID, prev: ' + _self.id + ' new: ' + selfID);
                    
                    // update self
                    // NOTE: we don't use _updateNode as it requires the same node id
                    _deleteNode(_self.id);
                    _self.id = selfID;
                    _insertNode(_self);
                                    
                    _setJoined();                    
                }                                      
                            
                var nodelist = pack.msg;
                                
                for (var i=0; i < nodelist.length; i++) {
                                        
                    // extract message
                    var new_node = new VAST.node();                    
                    new_node.parse(nodelist[i]);   
                    
                    LOG.debug('node ' + new_node.toString());
                    
                    _stat[pack.type].total++;
                    
                    // check data validity
                    /*
                    if (new_node.endpt.addr.isEmpty()) {
                        LOG.error('new node has no valid IP/port address, ignore info');
                        continue;
                    } 
                    */                    
                                                                                               
                    // store the new node and process later
                    // if there's existing notification, then replace only if newer     
                    if (_new_neighbors.hasOwnProperty(new_node.id) === false ||
                        _new_neighbors[new_node.id].time <= new_node.time) {
                        
                        LOG.debug('adding node id [' + new_node.id + '] type: ' + typeof new_node.id);
                    
                        _stat[pack.type].normal++;
                        _new_neighbors[new_node.id] = new_node;
                    }
                } // end going through node list                
                                
                // process new neighbors
                // NOTE: do this collectively during tick
                //_contactNewNeighbors();
                                
            }
            break;            
   
            // VON's hello, to let a newly learned node to be mutually aware
            case VON_Message.VON_HELLO: {
                                
                var node = new VAST.node();
                node.parse(pack.msg);                
                LOG.debug('node: ' + node.toString());
                               
                // update existing or new neighbor status                                            
                if (_isNeighbor (from_id))
                    _updateNode(node);
                else                                      
                    _insertNode(node);

                // send HELLO_R as response (my own position, reliably)
                var pos = new VAST.pos();
                pos.parse(_self.aoi.center);
                _sendMessage(from_id, VON_Message.VON_HELLO_R, pos, VON_Priority.HIGH, true);

                // check if enclosing neighbors need any update
                _checkConsistency(from_id);
            }
            break;
            
            // VON's hello response
            case VON_Message.VON_HELLO_R: {
                
                // check if it's a response from new neighbor
                if (_potential_neighbors.hasOwnProperty(from_id) === true) {
                
                    // insert the new node as a confirmed neighbor with updated position
                    var neighbor = _potential_neighbors[from_id];                    
                    neighbor.aoi.center.parse(pack.msg); 
                    
                    LOG.debug('got latest pos: ' + neighbor.aoi.center.toString() + ' id: ' + from_id);                    
                    _insertNode(neighbor);
                    
                    delete _potential_neighbors[from_id];
                }                
            }
            break;
            
            // VON's enclosing neighbor inquiry (to see if knowledge of EN is complete)
            case VON_Message.VON_EN: {
                
                //
                // check my enclosing neighbors to notify moving node any missing neighbors
                //

                // check if the neighbor still exists 
                // (it's possible the neighbor will depart before VON_EN is processed)
                // TODO: cleaner way to check?
                if (_neighbors.hasOwnProperty(from_id) === false) {
                    LOG.debug('neighbor [' + from_id + '] is no longer connected, ignore VON_EN request');
                    break;
                }
                
                // extract list of EN id received & create searchable list of EN
                var id_list = pack.msg;
                LOG.debug('recv en_list size: ' + id_list.length);
                
                var list = {};
                for (var i=0; i < id_list.length; i++) {
                    var id = id_list[i];
                    //LOG.debug('en: ' + id);
                    list[id] = NeighborState.NEIGHBOR_OVERLAPPED;
                }
                
                // enclosing neighbors missing from remote node's knowledge
                var missing = [];
                
                // my view of my current enclosing neighbors
                var en_list = _voro.get_en(_self.id);
                                             
                // store as initial known list                 
                // TODO: do we need to update the neighbor_states here?
                //       because during neighbor discovery checks, each node's knowledge will be calculated               
                delete _neighbor_states[from_id];
                _neighbor_states[from_id] = list;
                
                var id;
                for (var i=0; i < en_list.length; ++i)
                {
                    id = en_list[i];
                
                    // send only relevant missing neighbors, defined as
                    //  1) not the sender node  
                    //  2) one of my enclosing neighbors but not in the EN list received
                    //  3) one of the sender node's relevant neighbors
                    //  
                    if (id != from_id && 
                        list.hasOwnProperty(id) === false &&  
                        _isRelevantNeighbor (_neighbors[id], _neighbors[from_id]))
                        missing.push(id);
                }
                
                // notify the node sending me HELLO of neighbors it should know
                if (missing.length > 0)
                    _sendNodes(from_id, missing);                
            }
            break;
            
            // VON's move, to notify AOI neighbors of new/current position
            // VON's move, full notification on AOI
            // VON's move for boundary neighbors
            // VON's move for boundary neighbors with full notification on AOI
            case VON_Message.VON_MOVE: 
            case VON_Message.VON_MOVE_F: 
            case VON_Message.VON_MOVE_B: 
            case VON_Message.VON_MOVE_FB: {
                                
                // we only take MOVE from known neighbors
                if (_isNeighbor(from_id) === false)
                    break;
                
                // extract full node info or just position update
                var node = new VAST.node(from_id);
                node.parse(pack.msg);
                
                // if the remote node has just been disconnected,
                // then no need to process MOVE message in queue
                if (_updateNode(node) === false)
                    break;

                // records nodes requesting neighbor discovery check
                if (pack.type == VON_Message.VON_MOVE_B || pack.type == VON_Message.VON_MOVE_FB)
                    _req_nodes[from_id] = true;                                              
                    
                // check for neighbor discovery 
                // NOTE: do this only periodically during tick
                //_checkNeighborDiscovery();
            }
            break;            
            
            // VON's disconnecting a remote node
            case VON_Message.VON_DISCONNECT: 
            case VON_Message.VON_BYE: {

                // TODO: check if from_id is certainly the sending node's ID
                if (_neighbors.hasOwnProperty(from_id)) {
                    _checkConsistency (from_id);
                    _deleteNode (from_id);
                }                
                
                // TODO: physically disconnect the node? (or it will be done by the remote node?)
                var result = _net.disconnect(from_id);
                LOG.debug('disconnect succcess: ' + result);                
                LOG.debug('after removal, neighbor size: ' + Object.keys(_neighbors).length);
            }
            break;
                                              
            default: 
                // packet unhandled
                return false;
            break; 
        }

        // successfully handle packet
        return true;
    }
          
    // clean up all internal states for a new fresh join
    var _initStates = function () {
    
        LOG.debug('initStates called');
        
        // node state definition
        _state = NodeState.ABSENT; 
    
        // list of AOI neighbors (map from node id to node)
        _neighbors = {};
        
        // list of new neighbors (learned via VON_NODE messages)
        _new_neighbors = {};
        
        // record on EN neighbors (& their states) for each of my neighbor (used in VON_EN)
        _neighbor_states = {}; 
        
        _updateStatus = {};
        _potential_neighbors = {};
        _req_nodes = {};
        _time_drop = {};
                
        // create an object to calculate Voronoi diagram for neighbor mangement/discovery 
        _voro = new Voronoi();
        
        // init stat collection for selected messsage types
        _stat = {};
        _stat[VON_Message.VON_NODE] = new VAST.ratio();                   
    }
    
    var _connHandler = function (id) {
        LOG.debug('VON peer [' + id + '] connected');
    }
    
    var _disconnHandler = function (id) {
        LOG.debug('VON peer [' + id + '] disconnected');
        
        // generate a VON_DISCONNECT message 
        var pack = new VAST.pack(
            VON_Message.VON_DISCONNECT,
            {},
            VON_Priority.HIGHEST);

        _handlePacket(id, pack);            
    }    

    /////////////////////
    // constructor
    //
    LOG.debug('VON_peer constructor called');
    
    // call parent class's constructor
    //this.init(_connHandler, _disconnHandler, _handlePacket, l_self_id);
    msg_handler.call(this, _connHandler, _disconnHandler, _handlePacket, l_self_id);
    
    // make a local reference to the parent class (msg_handler)'s net object
    // need to create reference here because within functions (such as callbacks)
    // 'this' refers to the function itself
    
    // TODO: a cleaner approach?
    var _net = this.net;
    var that = this;
    
    // convenience functions with the right executation context (the desirable 'this')
    var _sendMessage = function () {
        that.sendMessage.apply(that, arguments);
    }
    
    var _sendPack = function () {
        that.sendPack.apply(that, arguments);
    }
    
    LOG.warn('_net: ' + _net + ' this.net: ' + this.net);
    
    // set default AOI buffer size
    if (l_aoi_buffer === undefined)
        l_aoi_buffer = AOI_DETECTION_BUFFER;
        
    // check whether AOI neighbor is defined as nodes whose regions
    // are completely inside AOI, default to be 'true'
    if (l_aoi_use_strict === undefined)
        l_aoi_use_strict = true;
    
    if (l_port === undefined)
        l_port = VON_DEFAULT_PORT;
        
    // reference to self
    // NOTE: other info of 'self' may be empty at this moment (e.g., endpt, aoi, etc.)
    var _self = new VAST.node(l_self_id);
 
    //
    // internal states
    //
   
    // callback to use once join is successful
    var _join_done_CB = undefined;
    
    // interval id for removing periodic ticking
    var _interval_id = undefined;
   
    // node state definition
    var _state; 
    
    // list of AOI neighbors (map from node id to node)
    var _neighbors;
        
    // TODO: combine these structures into one?
    var _new_neighbors;             // nodes worth considering to connect (learned via VON_NODE messages)
    var _neighbor_states;           // neighbors' knowledge of my neighbors (for neighbor discovery check)
    var _potential_neighbors;       // neighbors to be discovered
    var _req_nodes;                 // nodes requesting neighbor discovery check
    
    var _updateStatus;              // status about whether a neighbor is: 1: inserted, 2: deleted, 3: updated
        
    var _time_drop;
        
    // create an object to calculate Voronoi diagram for neighbor mangement/discovery 
    var _voro; 
    
    // init stat collection for selected messsage types
    var _stat;

    // clean all states
    _initStates();
    
} // end of peer

VONPeer.prototype = new msg_handler();

// NOTE: it's important to export VONPeer after the prototype declaration
//       otherwise the exported method will not have unique msg_handler instance
//       (that is, all msg_handler variables will become singleton, only one instance globally)
if (typeof module !== 'undefined')
	module.exports = VONPeer;
