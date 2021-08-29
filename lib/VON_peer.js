
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
    
    // VON functions
    join(addr, aoi, onDone)             join a VON network at a gateway with a given aoi 
    leave()                             leave the VON network
    move(aoi, send_time)                move the AOI to a new position (or change radius)
    list()                              get a list of AOI neighbors    
    send(id, msg)                       send a message to a given node
    put(obj)                            store app-specific data to the node
    
    // basic external functions
    init(id, port, onDone)              init a VON peer with id, listen port
    shut()                              shutdown a VON peer (will close down listen port)
    query(center, onAcceptor)           find app-specific data along with the node (will pass during node discovery)
    get()                               retrieve app-specific data for this node
    
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

// voronoi computation
var Voronoi = require('./voronoi/vast_voro.js');

// config
var VON_DEFAULT_PORT        = 37;       // by default which port does the node listen
var AOI_DETECTION_BUFFER    = 32;       // detection buffer around AOI
var MAX_TIMELY_PERIOD       = 10;       // # of seconds considered to be still active
var MAX_DROP_SECONDS        = 2;        // # of seconds to disconnect a non-overlapped neighbor
var NONOVERLAP_MULTIPLIER   = 1.25;     // multiplier for aoi buffer for determining non-overlap
var TICK_INTERVAL           = 100;      // interval (in milliseconds) to perform tick tasks

// flags
var OVERLAP_CHECK_ACCURATE  = false;     // whether VON overlap checks are accurate

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

//
// NOTE: this class interface with msg_handler via the following:
//          _connHandler, _disconnHandler, _packetHandler, _self_id
//       it also uses the following provided by msg_handler
//          sendMessage, sendPack, net
//

// definition of a VON peer
function VONPeer(l_aoi_buffer, l_aoi_use_strict) {
    
    /////////////////////
    // public methods
    //
    
    var _that = this;
    
    // function to create a new net layer
    this.init = function (self_id, port, matcher, onDone) {
   
        self_id = self_id || VAST.ID_UNASSIGNED;
        port = port || VON_DEFAULT_PORT;
        _my_matcher = matcher;
                                                        
        // create new layer
        var handler = new msg_handler(self_id, port, function (local_addr) {
        
            // NOTE: this will cause initStates() be called
            handler.addHandler(_that);

            // notify done
            if (typeof onDone === 'function')
                onDone(local_addr);            
        });
    }
    
    // shutdown a VON peer (will close down listen port)
    this.shut = function () {
    
        if (_msg_handler !== undefined) {
            // stop server, if currently listening
            // NOTE: if VON peer is used with other nodes, stopping server here will impact other nodes as well
            _msg_handler.close();
            _msg_handler = undefined;                    
        }
        _state = VAST.state.ABSENT;        
    }
    
    // find the acceptor for a given center point 
    var _query = this.query = function (contact_id, center, msg_type, msg_para) {
        
        LOG.debug('VON_peer query() will contact node[' + contact_id + '] to find acceptor');
                       
        var msg = {
            pos:  center,
            type: msg_type,
            para: msg_para
        }
        
        // send out query request
        _sendMessage(contact_id, VON_Message.VON_QUERY, msg, VAST.priority.HIGHEST);
    }
    
    // join a VON network with a given aoi 
    var _join = this.join = function (GW_addr, aoi, onDone) {
                        
        // check if already joined
        if (_state === VAST.state.JOINED) {
            LOG.warn('VON_peer.join(): node already joined');
            if (typeof onDone === 'function')
                onDone(_self.id);
            return;
        }

        LOG.debug('VON_peer join() called, self: ' + _self.id + ' getID: ' + _getID());
        
        // store gateway address, ensure input conforms to internal data structure
        // NOTE: need to do it here, as _storeMapping is not effective after addHandler calls initStates            
        var addr = new VAST.addr();
        addr.parse(GW_addr);                        
        _storeMapping(VAST.ID_GATEWAY, addr);       
        LOG.warn('gateway set to: ' + addr.toString());
    
        // store initial aoi
        _self.aoi.update(aoi);       
        
        // change internal state
        _state = VAST.state.JOINING; 
                
        // keep reference to call future once join is completed
        _join_onDone = onDone;

        // if id is empty, send PING to gateway to learn of my id first
        // otherwise attempt to join by contacting gateway
        if (_getID() === VAST.ID_UNASSIGNED)
            _sendMessage(VAST.ID_GATEWAY, VON_Message.VON_PING, {request: true}, VAST.priority.HIGHEST);
        else
            _setInited();
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
        
        /*
        // remove ticking interval
        // TODO: remove js-specific code or collect them
        if (_interval_id !== undefined) {
            clearInterval(_interval_id);
            _interval_id = undefined;
        }
        */
    }    

    // move the AOI to a new position (or change radius)    
    var _move = this.move = function (aoi, sendtime) {
        //LOG.warn('VON_Peer moving to: ' + aoi.center.toString());

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
            VAST.priority.HIGHEST);
            
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
    
    // send a message to a given node
    var _send = this.send = function (id, msg) {

    }

    // store a app-specific data along with the node (will pass during node discovery)                      
    var _put = this.put = function (obj) {
        _meta = obj;
        LOG.debug('after put() meta keys: ' + Object.keys(_meta).length);
        
        // update to self (so that it can be sent over)
        _self.meta = _meta;
    }
    
    // retrieve app-specific data for this node
    var _get = this.get = function () {
        LOG.debug('get() meta keys: ' + Object.keys(_meta).length);    
        return _meta;
    }

    ////////////////////////////////////////////////
    // Public methods / accessors used by matcher

    // get a list of AOI neighbors
    this.list = function () {
        return _neighbors; 
    }

    // checks if id is an enclosing neighbour of center_node_id
    this.is_enclosing_neighbour = function(id, center_node_id){
        return _voro.is_enclosing(id, center_node_id);
    }
    //---------------------------------------
    // BROKEN ALWAYS RETURNS FALSE
    this.contains = function(pos){
        return _voro.contains(_self.id, pos);
    }

    
    this.nearest_common_neighbour = function(target_id, neighbour_id){
        target = _voro._getNode(target_id);
        neighbour = _voro._getNode(neighbour_id);
        myDistance = _self.aoi.center.distance(target.aoi.center);
        neighbourDistance = neighbour.aoi.center.distance(target.aoi.center);

        if (myDistance === neighbourDistance){
            return _self.id < neighbour_id ? _self.id : neighbour_id;
        }

        return myDistance > neighbourDistance ? _self.id : neighbour_id;
    }

    this.closest_to = function(pos){
        return _voro.closest_to(pos);
    }

    // send message to another matcher via it's VON peer
    this.matcherMessage = function(matcher_pack){
        var VON_pack = new VAST.pack(VON_Message.MATCHER_FORWARD, matcher_pack, VAST.priority.HIGHEST);
        VON_pack.targets = matcher_pack.targets;

       // console.log(VON_pack);

        _sendPack(VON_pack, true);
    }

    // return true if my voronoi region overlaps / contains 
    this.isOverlapping = function (aoi){
        
        var region = new VAST.region();
        region.update(_voro.getRegion(_self.id));
        region.convertingEdges();

        if(region.intersects(aoi.center, aoi.radius)){
            return true;
        }
        else{
            return false;
        }
    }

    // return a list of neighbours that overlap with an AoI
    this.getOverlappingNeighbours = function(aoi){
        var overlapping = [];
        var temp;

        // Need to convert voronoi cell to VAST region for intersect checking
        // TODO: combine required functionality into single region/cell type
        var region = new VAST.region();

        for (var key in _neighbors) {
            temp = _neighbors[key].id;
            // skip self
            // TODO: accept list of nodes not to check? (Sub already forwarded to them, don't recheck and resend)
            if (temp === _self.id)
            continue 

            region.update(_voro.getRegion(temp));
            region.convertingEdges();
            if(region.intersects(aoi.center, aoi.radius)){
                overlapping.push(temp);
            }
        }
        return overlapping;
    }
    
    /////////////////////
    // public accessors
    //

    this.getHandler = function () {
        //LOG.debug("Get Handler", _self.id);
        return _msg_handler;
    }
    
    // check if we've joined the VON network
    var _isJoined = this.isJoined = function () {        
        return (_state === VAST.state.JOINED);
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
    
        LOG.debug('insertNode [' + node.id + '] isNeighbor: ' + _isNeighbor(node.id));
        
        // check for redundency
        if (_isNeighbor(node.id))     
            return false;
          
        // notify network layer about connection info, no need to actually connect for now
        _storeMapping(node.id, node.endpt.addr);
        
        // update last access time
        node.endpt.lastAccessed = UTIL.getTimestamp();
        //LOG.debug('last accessed: ' + node.endpt.lastAccessed);
 
        // store the new node to 
        _voro.insert(node.id, node.aoi.center);
        
        // store to neighbors
        _neighbors[node.id] = node; 

        // init mapping of neighbor's states
        _neighbor_states[node.id] = {};
        
        // TODO: still needed?
        // record time to determine a neighbor is no longer active and can disconnect
        _time_drop[node.id] = 0;
        
        // update node status
        _updateStatus[node.id] = NeighborUpdateStatus.INSERTED;

        var meta_keys = node.hasOwnProperty('meta') ? Object.keys(node.meta).length : 0;
        LOG.debug('[' + _self.id + '] insertNode neighbor (after insert) size: ' + Object.keys(_neighbors).length + 
                  ' voro: ' + _voro.size() + 
                  ' meta: ' + meta_keys);
        
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

        if (_isNeighbor(node.id) === false)
            return false;
        
        // only update the node if it's the same or a later time
        if (node.time < _neighbors[node.id].time)
            return false;

        _voro.update(node.id, node.aoi.center);
        _neighbors[node.id].update(node);
        
        // update meta, if available
        if (node.hasOwnProperty('meta'))
            _neighbors[node.id].meta = node.meta;

        // NOTE: should not reset drop counter here, as it might make irrelevant neighbor 
        //       difficult to get disconnected
        //_time_drop[node.id] = 0;

        // update last access time of this node
        node.endpt.lastAccessed = UTIL.getTimestamp();

        // set flag so that updated nodes' states are also sent 
        // instead of sending only updates for newly inserted node
        if (_updateStatus.hasOwnProperty(node.id) === false || _updateStatus[node.id] !== NeighborUpdateStatus.INSERTED)
            _updateStatus[node.id] = NeighborUpdateStatus.UPDATED;

        return true;
    }

    // get a clean node to send (no extra stuff in 'node.aoi.center', for example)
    // TODO: remove this? (will need to make sure all nodes are clean)
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
    /*
    var _tick = function () {
    
        //_sendKeepAlive();
        try {
            _contactNewNeighbors();
            _checkNeighborDiscovery();
            _removeNonOverlapped();
        }
        catch (e) {
            LOG.error('tick error:\n' + e.stack);
        }
    }
    */
    
    // self creation once self ID is obtained
    var _setInited = function () {
    
        // update id & address info for self (we need valid self address for acceptor to contact)
        _self.id = _getID();
        var addr = _msg_handler.getAddress();
        _self.endpt = new VAST.endpt(addr.host, addr.port);

        LOG.warn('init myself as ' + _self.toString());        
        
        // store self node to neighbor map
        _insertNode(_self);
        
        // if I'm gateway, no further action required
        // TODO: doesn't look clean, can gateway still send query request to itself?
        //       that'll be a more general process
        //       (however, will deal with how to determined 'already joined' for gateway)
        if (_self.id === VAST.ID_GATEWAY)
            _setJoined();
        else
            // send out query request first to find acceptor
            _query(VAST.ID_GATEWAY, _self.aoi.center, VON_Message.VON_JOIN, _self);
    }
    
    // set current node to be 'joined'
    // NOTE: should not do other init stuff (such as insert self to neighbor list) here
    //       otherwise VON_NODE message may be incorrectly processed
    var _setJoined = function () {
    
        _state = VAST.state.JOINED;
        
        // notify join is done
        if (typeof _join_onDone === 'function')
            _join_onDone(_self.id);         
            
        // start ticking
        //_interval_id = setInterval(_tick, TICK_INTERVAL);
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
        
        // record a list of relevant neighbors to be inserted
        var relevant_neighbors = [];
        
        // check through each newly inserted Voronoi for relevance                      
        for (var i=0; i < new_list.length; ++i) {
        
            target = new_list[i];
            var node = _new_neighbors[target];

            // if the neighbor is relevant and we insert it successfully
            // NOTE that we're more tolerant for AOI buffer when accepting notification
            if (_isRelevantNeighbor(node, _self)) {
                        
                LOG.debug('[' + node.id + '] is relevant to self [' + _self.id + ']');
                                
                // add a new relevant neighbor
                // NOTE: we record first without inserting because we need to remove
                //       the new neighbor positions from Voronoi first
                relevant_neighbors.push(node);
                
                // notify mapping for sending Hello message
                // TODO: a cleaner way (less notifymapping call?)
                _storeMapping(node.id, node.endpt.addr);

                // send HELLO message to newly discovered nodes
                // NOTE that we do not perform insert yet (until the remote node has confirmed via MOVE)
                //      this is to avoid outdated neighbor discovery notice from taking effect
                //LOG.debug('before calling get_en, target: ' + target + ' node.id: ' + node.id);
                //LOG.debug('voro nodes before get_en: ' + _voro.size());
                
                // NOTE: even if en_list is empty, should still send out HELLO
                // empty can occur if initially just two nodes with overlapped positions
                //_sendHello(target);
                //_sendEN(target);
            }
        }

        // clear up the temporarily inserted test node from Voronoi (if not becoming neighbor)
        for (var i=0; i < new_list.length; ++i)            
            _voro.remove(new_list[i]);
            
        // insert new neighbors
        for (var i=0; i < relevant_neighbors.length; i++) {
            _insertNode(relevant_neighbors[i]);
            
            // NOTE: even if en_list is empty, should still send out HELLO
            // empty can occur if initially just two nodes with overlapped positions            
            _sendHello(relevant_neighbors[i].id);
            _sendEN(relevant_neighbors[i].id);
        }
        
        // NOTE: erase new neighbors seems to bring better consistency 
        //       (rather than keep to next round, as in previous version)
        _new_neighbors = {};
            
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
        
        var now = UTIL.getTimestamp ();
        
        // check if we should perform check (should check no more than once per second)
        if ((now - _lastRemoveNonOverlapped) < 1000)
            return 0;
            
        // update check time
        _lastRemoveNonOverlapped = now;

        // prepare neighbor list to remove
        var delete_list = [];
        
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
        
        _sendMessage(target, VON_Message.VON_NODE, nodes, VAST.priority.NORMAL, reliable);
    }
    
    // send a list of IDs to a particular node
    // target:   destination node id
    // list:     a list of id to be sent
    var _sendHello = function (target) {
                    
        //LOG.warn('[' + _self.id + '] sendHello to [' + target + ']');
        
        var node = _getNode(_self.id);
     
        LOG.debug('meta keys: ' + Object.keys(_meta).length);
        
        // add app-specific attributes, if exist 
        // TODO: find a cleaner way (for example, meta already exists in the node returned by getNode)
        if (Object.keys(_meta).length > 0) {
            LOG.debug('storing meta keys ' + Object.keys(_meta).length + ' to node to be sent for VON_HELLO');
            node.meta = _meta;
        }
        
        // prepare HELLO message
        // TODO: do not create new HELLO message every time? (local-side optimization)
        _sendMessage(target, VON_Message.VON_HELLO, node, VAST.priority.HIGHEST, true);
    }

    // send a particular node its perceived enclosing neighbors
    var _sendEN = function (target) {
    
        var id_list = _voro.get_en(target);
        if (id_list.length > 0)
            _sendMessage(target, VON_Message.VON_EN, id_list, VAST.priority.HIGH, true);        
    }
    
    var _sendBye = function (targets) {

        var num_deleted = 0;
                
        if (targets.length > 0) {
        
            LOG.debug('sendBye target size: ' + targets.length);
        
            var pack = new VAST.pack(VON_Message.VON_BYE, {}, VAST.priority.HIGHEST);               
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
    
    // new ID assignment
    var _new_ID = undefined;     
    var _assignNewID = function () {

        // we use our own ID as first
        // NOTE if we start with VAST.ID_UNASSIGNED (0) then first ID will be 1
        if (_new_ID === undefined)
            _new_ID = _getID() + 1;
            
        LOG.warn('new ID assigned: ' + _new_ID); 
        return _new_ID++;
    }
    
    var _packetHandler = this.packetHandler = function (from_id, pack) {
    
        // if node is not joined, do not process any message, unless it's response for
        // getting ID (VON_PING) or neighbor list (VON_NODE) or handshake (VON_HELLO)
        // NOTE: it's possible for VON_HELLO to arrive earlier than VON_NODE
        /*
        if (_state < VAST.state.JOINED) {   

            if (pack.type !== VON_Message.VON_PING && 
                pack.type !== VON_Message.VON_NODE &&
                pack.type !== VON_Message.VON_HELLO) {
                LOG.error('VON_peer: node not yet joined, should not process any messages');                
                return false;
            }
        }
        */
        
        if (_self.id === VAST.ID_UNASSIGNED && pack.type !== VON_Message.VON_PING) {
            LOG.error('VON_peer: node not yet init (got unique ID), should not process any messages');
            return false;        
        }
        
        LOG.debug('[' + _self.id + '] ' + VON_Message_String[pack.type] + ' from [' + from_id + '], neighbor size: ' + Object.keys(_neighbors).length);

        switch (pack.type) {

            // VON's ping, to check if a connected host is still alive          
            case VON_Message.VON_PING: {
                        
                // check if it's a request, respond to it
                if (typeof pack.msg.request !== 'undefined' && pack.msg.request == true) {
                
                    // if remote id is not yet assigned, assign new one
                    var remote_id = _assignNewID();
                    LOG.warn('assign new ID [' + remote_id + '] to [' + from_id + ']');                        
                    
                    // check if this is the first ever ID assigned by me
                    // if so, then I'm likely the gateway (my ID is also unassigned yet)
                    if (_self.id === VAST.ID_UNASSIGNED) {
                        LOG.warn('first ID assigned, likely I am the gateway');
                        _self.id = remote_id;
                    }
                                
                    //LOG.warn('VON_PING receive request, simply respond');
                    _sendMessage(from_id, VON_Message.VON_PING, {request: false, aid: remote_id}, VAST.priority.HIGH, true);
                }
                // otherwise we got a response from gateway, set my ID, can now send join request
                else if (_self.id === VAST.ID_UNASSIGNED) {
                    var assigned_id = parseInt(pack.msg.aid);
                    LOG.debug('assigned_id: ' + assigned_id);
                    _setID(assigned_id);                    
                    _setInited();               
                }
            }
            break;
            
            // VON's query, to find an acceptor to a given point            
            case VON_Message.VON_QUERY: {
                        
                // extract message
                var pos = new VAST.pos();
                pos.parse(pack.msg.pos);
                LOG.debug('VON_QUERY checking pos: ' + pos.toString());
                                                 
                // find the node closest to the joiner
                var closest = _voro.closest_to(pos);
                LOG.debug('closest node: ' + closest + ' (' + typeof closest + ')');
                                      
                // forward the request if a more appropriate node exists
                // TODO: contains() might recompute Voronoi, isRelevantNeighbor below 
                //       also will recompute Voronoi. possible to combine into one calculation?
                if (closest === null) {
					LOG.warn('closest node is null, something is not right.. please check', 'VON_QUERY');
				}				

				if (closest !== null &&
					_voro.contains(_self.id, pos) === false &&
                    _isSelf(closest) === false &&
                    closest != from_id) {

                    //LOG.warn('forward VON_QUERY request to: ' + closest);
                    
                    // re-assign target for the query request
                    pack.targets = [];
                    pack.targets.push(closest);
                    _sendPack(pack);
                }                    
                else {

                    LOG.debug('accepting VON_QUERY from: ' + from_id);
                
                    // I'm the acceptor, re-direct message content to self
                    pack.type = pack.msg.type;
                    pack.msg = pack.msg.para;
                    pack.targets = [];
                    pack.targets.push(_self.id);
                    
                    // add from_id as this is not found elsewhere
                    // TODO: not clean to add to pack?
                    //pack.from_id = from_id;
                    
                    LOG.debug('redirect to self: ' + JSON.stringify(pack));
                    
                    // NOTE: need to check if this works correctly, to send back to self
                    //_sendPack(pack);
                    
                    // NOTE: has danger to enter infinite loop
                    // TODO: make some kind of msgqueue for sending?
                    _packetHandler(from_id, pack);
                }          
            }
            break;
        
            // VON's join, to learn of initial neighbors
            case VON_Message.VON_JOIN: {

                // extract message
                var joiner = new VAST.node();
                joiner.parse(pack.msg);
                LOG.debug('joiner: ' + joiner.toString());
                
                // TODO: verify message in a systematic way
                if (joiner.endpt.addr.isEmpty()) {
                    LOG.error('joiner has no valid IP/port address, ignore request');
                    break;
                }
                                 
                // insert first so we can properly find joiner's EN
                _insertNode(joiner);
   
                // if this is gateway receiving its own request
                // TODO: to check correctness
                if (Object.keys(_neighbors).length === 1) {
                    LOG.warn('gateway getting its own VON_QUERY, return empty list');
                    _sendNodes(from_id, [], true);
                    break;
                }
   
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
                    LOG.debug('is relevant: ' + is_relevant);
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
                _sendNodes(joiner.id, list, true);
            }
            break;
            
            // process notifications for new nodes
            case VON_Message.VON_NODE: {
                       
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

                // process new neighbors immediately after learning new nodes
                _contactNewNeighbors();
                
                // if VON_NODE is received for the first time, we're considered joined
                if (_state === VAST.state.JOINING) {
                
                    // process new neighbors if we just joined, 
                    // otherwise, do this periodically & collectively during tick                                
                    //_contactNewNeighbors();
                
                    // NOTE: we don't notify join success until neighbor list is processe
                    //       so that upon join success, the client already has a list of neighbors
                    _setJoined();
                }                
            }
            break;            
   
            // VON's hello, to let a newly learned node to be mutually aware
            // NOTE: it's found a node may already knows a neighbor even if it receives 
            //       VON_HELLO for the first time
            //       this occurs when the current node first receives VON_QUERY and had inserted
            //       the joining node before
            case VON_Message.VON_HELLO: {
                                
                var node = new VAST.node();
                node.parse(pack.msg);                
                LOG.debug('node: ' + node.toString());
                    
                // store meta data, if any
                if (pack.msg.hasOwnProperty('meta') && typeof pack.msg.meta === 'object') {
                    LOG.debug('VON_HELLO storing to node meta keys: ' + Object.keys(pack.msg.meta).length);
                    node.meta = pack.msg.meta;
                }
                    
                // update existing or new neighbor status                                            
                if (_isNeighbor(from_id))
                    _updateNode(node);
                else                                      
                    _insertNode(node);
                                        
                // send HELLO_R as response (my own position, reliably)
                // NOTE: we need to create a new pos as self.aoi.center has other properties (put by Voronoi)
                // TODO: this should be clean-up
                var pos = new VAST.pos;
                pos.parse(_self.aoi.center);
                var res_obj = {
                    pos: pos
                };
                
                // add meta-data, if any
                if (Object.keys(_meta).length > 0)
                    res_obj.meta = _meta;
                    
                _sendMessage(from_id, VON_Message.VON_HELLO_R, res_obj, VAST.priority.HIGH, true);

                // check if enclosing neighbors need any update
                _checkConsistency(from_id);
            }
            break;
            
            // VON's hello response
            case VON_Message.VON_HELLO_R: {
                
                // check if it's a response from an existing neighbor
                if (_neighbors.hasOwnProperty(from_id) === true) {
                
                    // update the neighbor's position
                    // NOTE: that 'time' is not updated here
                    var neighbor = _neighbors[from_id];                    
                    neighbor.aoi.center.parse(pack.msg.pos); 
                    
                    // store meta data, if any
                    if (pack.msg.hasOwnProperty('meta') && typeof pack.msg.meta === 'object') {
                        LOG.debug('meta keys received: ' + Object.keys(pack.msg.meta).length);
                        neighbor.meta = pack.msg.meta;
                    }
                    
                    LOG.debug('got latest pos: ' + neighbor.aoi.center.toString() + ' id: ' + from_id);  
                    try {                    
                        _updateNode(neighbor);        
                    }
                    catch(e) {
                        LOG.debug(e.stack);
                    }
                }
                else
                    LOG.warn('[' + _self.id + '] got VON_HELLO_R from unknown neighbor [' + from_id + ']');
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
                _checkNeighborDiscovery();
                
                // remove neighbors I'm no longer interested
                _removeNonOverlapped();
            }
            break;            
            
            // VON's disconnecting a remote node
            case VON_Message.VON_BYE: {

                // TODO: check if from_id is certainly the sending node's ID
                if (_neighbors.hasOwnProperty(from_id)) {
                    _checkConsistency(from_id);
                    _deleteNode(from_id);
                }                
                
                // physically disconnect the node (or it will be done by the remote node)
                var result = _disconnect(from_id);
                LOG.debug('disconnect succcess: ' + result);                
                LOG.debug('after removal, neighbor size: ' + Object.keys(_neighbors).length);
            }
            break;

            // Message intended for matcher, so pass it on
            case VON_Message.MATCHER_FORWARD: {
                if ((_my_matcher !== undefined)&&
                (typeof _my_matcher.handlePacket === 'function')){
                    _my_matcher.handlePacket(from_id, pack.msg);
                }
            }
            break
                                              
            default: 
                // packet unhandled
                return false;
            break; 
        }

        // successfully handle packet
        return true;
    }
              
    var _connHandler = this.connHandler = function (id) {
        LOG.debug('VON peer [' + id + '] connected');
    }
    
    var _disconnHandler = this.disconnHandler = function (id) {
        LOG.debug('VON peer [' + id + '] disconnected');
        
        // generate a VON_BYE message 
        var pack = new VAST.pack(
            VON_Message.VON_BYE,
            {},
            VAST.priority.HIGHEST);

        _packetHandler(id, pack);            
    }    

    /////////////////////
    // msg_handler methods
    //
    
    // clean up all internal states for a new fresh join
    var _initStates = this.initStates = function (msg_handler) {
    
        LOG.debug('initStates called');
        
        if (msg_handler !== undefined) {
        
            _msg_handler = msg_handler;
            
            var id = _msg_handler.getID();
            //LOG.warn('VON_peer initStates called with msg_handler, id: ' + id);
                            
            // add convenience references
            _storeMapping = _msg_handler.storeMapping,
            _getID =        _msg_handler.getID,      
            _setID =        _msg_handler.setID,
            _disconnect =   _msg_handler.disconnect,
            _sendMessage =  _msg_handler.sendMessage,
            _sendPack =     _msg_handler.sendPack;                
        }
                
        // node state definition
        _state = VAST.state.ABSENT; 
    
        // list of AOI neighbors (map from node id to node)
        _neighbors = {};
        
        // list of new neighbors (learned via VON_NODE messages)
        _new_neighbors = {};
        
        // record on EN neighbors (& their states) for each of my neighbor (used in VON_EN)
        _neighbor_states = {}; 
        
        _updateStatus = {};
        _req_nodes = {};
        _time_drop = {};
        
        _lastRemoveNonOverlapped = 0;
                
        // create an object to calculate Voronoi diagram for neighbor mangement/discovery 
        _voro = new Voronoi();
        
        // init stat collection for selected messsage types
        _stat = {};
        _stat[VON_Message.VON_NODE] = new VAST.ratio();                   
    
        // clear meta data
        _meta = {};        
    }
            
    /////////////////////
    // constructor
    //
    LOG.debug('VON_peer constructor called');
            
    //
    // constructor actions
    //
    var _my_matcher;
    
    // set default AOI buffer size
    l_aoi_buffer = l_aoi_buffer || AOI_DETECTION_BUFFER;
        
    // check whether AOI neighbor is defined as nodes whose regions
    // are completely inside AOI, default to be 'true'
    l_aoi_use_strict = l_aoi_use_strict || true;
             
    //
    //  handler-related
    //
                                                      
    // register with an existing or new message handler
    // NOTE: to register, must provide: connHandler, disconnHandler, packetHandler
    var _msg_handler = undefined;
        
    // convenience references
    var _storeMapping, _getID, _setID, _disconnect, _sendMessage, _sendPack;

    //
    // internal states
    //
        
    // reference to self (NOTE: need to be initialized in init())
    var _self = new VAST.node(); 
             
    // callback to use once join is successful
    var _join_onDone = undefined;

    // callback to use once init is successful (got self ID from server)
    var _init_onDone = undefined;
    
    // interval id for removing periodic ticking
    //var _interval_id = undefined;
   
    // node state definition
    var _state; 
    
    // list of AOI neighbors (map from node id to node)
    var _neighbors;
        
    // TODO: combine these structures into one?
    var _new_neighbors;             // nodes worth considering to connect (learned via VON_NODE messages)
    var _neighbor_states;           // neighbors' knowledge of my neighbors (for neighbor discovery check)
    var _req_nodes;                 // nodes requesting neighbor discovery check
    
    var _updateStatus;              // status about whether a neighbor is: 1: inserted, 2: deleted, 3: updated
        
    var _time_drop;
    
    var _lastRemoveNonOverlapped;   // last timestamp when removeNonOverlapped is called
        
    // create an object to calculate Voronoi diagram for neighbor mangement/discovery 
    var _voro; 
    
    // init stat collection for selected messsage types
    var _stat;

    // app-specific meta data
    var _meta;

} // end of peer

// NOTE: it's important to export VONPeer after the prototype declaration
//       otherwise the exported method will not have unique msg_handler instance
//       (that is, all msg_handler variables will become singleton, only one instance globally)
if (typeof module !== 'undefined')
	module.exports = VONPeer;