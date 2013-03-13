
//
// logic.js -- VSS core logic to maintain multiple VAST nodes
//
// history:
//		2013-03-12	separated from handler.js to be sharable
//		

// include VAST
require('../VAST');

// default port for connecting / creating VON nodes
var _VON_port      = VAST.Settings.port_gateway;
var _VON_gateway   = VAST.Settings.IP_gateway;

// default radius when first joined
// TODO: need to have default radius?
var _default_radius = 0;

// number of nodes already created
var _nodes_created = 0;

// API keys -> layers -> nodes mapping
// NOTE: it's a 3-dimensional array
var _keys = {};

// node id -> ident mapping
var _id2ident = {};

// node id -> neighbor list mapping
var _id2neighbors = {};


//
// public calls
//

var _registerNode = exports.registerNode = function (position, info, done_CB) {

    var pos = new VAST.pos(position.x, position.y);
    
    // append additional z value
    pos.z = position.z;	

    // extract AOI for the VON node to create        
    var aoi = new VAST.area(pos, _default_radius);
    
    // specify where to locate VON gateway
    var ip_port  = new VAST.addr(_VON_gateway, _VON_port);                
    var new_node = new VON.peer();
                           
    // join in the network        
    new_node.init(VAST.ID_UNASSIGNED, ip_port.port + _nodes_created, function () {
    
        _nodes_created++;                   

        // store node ident for ident discovery across different VSS servers
        var ident = {
            apikey: info.apikey,
            layer:  info.layer,
            name:   info.name
        };
        
		// store as meta-data
        new_node.put(ident);
        
        new_node.join(ip_port, aoi,
        
            // done callback
            function (self_id) {
                                
                LOG.warn('\njoined successfully! id: ' + self_id + ' self id: ' + new_node.getSelf().id);
               
                // keep track of newly joined node in internal record
                if (_keys.hasOwnProperty(info.apikey) === false)
                    _keys[info.apikey] = {};
                if (_keys[info.apikey].hasOwnProperty(info.layer) === false)
                    _keys[info.apikey][info.layer] = {};
                    
                _keys[info.apikey][info.layer][info.name] = new_node;
    
                // store id to ident mapping
                LOG.debug('store mapping for node id: ' + self_id + ' name: ' + info.name);
                _id2ident[self_id] = info;
                
                //new_node.put(info);
                
                // check content
                LOG.debug('new_node (after join): ' + new_node.getSelf().toString());
    
                // perform initial publish pos
                // (so we can get a list of neighbors)
                // NOTE: doesn't appear to work...
                //_publishPos(new_node, info, new_node.getSelf().aoi.radius);
                
                done_CB(new_node);
            }
        );              
    });    
}

var _revokeNode = exports.revokeNode = function (info, done_CB) {

    // check if node exists, return error if not yet exist (need to publishPos first)
    var node = _getNode(info);
    
    if (node === undefined || node === null) 
        return done_CB(false);
    
    var node_id = node.getSelf().id;
    
    //destroy node
    node.leave();
    node.shut();
    node = null;
    
    delete _keys[info.apikey][info.layer][info.name];
    
    // check if we need to remove layer and/or API key
    if (Object.keys(_keys[info.apikey][info.layer]).length === 0)
        delete _keys[info.apikey][info.layer];
    if (Object.keys(_keys[info.apikey]).length === 0)
        delete _keys[info.apikey];
        
    // remove id to ident mapping
    LOG.debug('remove mapping for node id: ' + node_id + ' name: ' + info.name);
    delete _id2ident[node_id];    
        
    done_CB(true);
}

// get a specific node given its API key, layer, and name (i.e., ident)
// returns 'undefined' if key info is missing
// returns 'null' if not found
var _getNode = exports.getNode = function (ident) {

    // check if any essential info is missing
    if (ident.apikey === '' || ident.layer === '' || ident.name === '')
        return undefined;
                              
    for (var key in _keys)
        LOG.debug('key: ' + key);
    
    if (_keys.hasOwnProperty(ident.apikey)) {
        var layers = _keys[ident.apikey];
        
        for (var layer in layers)
            LOG.debug('layer: ' + layer);
        
        if (layers.hasOwnProperty(ident.layer)) {
            var nodes = layers[ident.layer];
            
            for (var node in nodes)
                LOG.debug('node: ' + node);
            
            if (nodes.hasOwnProperty(ident.name)) { 
                return nodes[ident.name];
            }
        }     
    }
       
    // no node found, warn in advance    
    return null;
}

var _publishPos = exports.publishPos = function (node, pos, radius) {

    // build new AOI info
    var aoi = new VAST.area(pos, radius);
    
    // perform movement
    node.move(aoi);
}

// get a list of subscribers, new neighbors, left neighbors
exports.getLists = function (node) {

    // get a list of current neighbors's id
    var neighbors = node.list();
    var self      = node.getSelf();

	var new_list = [];
	var left_list = [];
	var subscribe_list = [];

	// list of current neighbors
	var curr_neighbors = {};
                   
	// get previous neighbor list for this node, if available
	var prev_neighbors = {};
	if (_id2neighbors.hasOwnProperty(self.id) === true)
		prev_neighbors = _id2neighbors[self.id];

    // TODO: send only those who's AOI covers me (as true subscribers, not simply enclosing neighbors)
    for (var id in neighbors) {
        
        LOG.debug('checking neighbor id: ' + id + ' against self id: ' + self.id);
        
        // convert node id to node ident (only for those registered here)
        // NOTE: current approach can only do ident translation for nodes created via this VSS server
        
        var neighbor = neighbors[id];
        
        //for (var i in neighbor) 
        //    LOG.debug(i + ': ' + typeof neighbor[i]);
        
        // get node ident (from either 'meta' field or from mapping)
		// 'meta' means remote, mapping means on this server (?)
        var info = undefined;
        if (neighbor.hasOwnProperty('meta'))
            info = neighbor.meta;
        else if (_id2ident.hasOwnProperty(id))
            info = _id2ident[id];
                                    
        // skip if
        //    1. is self
        //    2. no mapping for ident (the node is not created via VSS)
        if (self.id == id ||
            info    === undefined)
			continue;

		// build unique ident for this neighbor
		var ident = info.apikey + ':' + info.layer + ':' + info.name;

		// check if this neighbor should be put to subscriber list
		// is a subscriber to myself (i.e., subscribed area covers me)
		if (_isSubscriber(neighbors[id], self.aoi))
			subscribe_list.push(ident);
        
		// check if I am a subscriber to this neighbor
		if (_isSubscriber(self, neighbors[id].aoi)) {
					            
			// store this neighbor to a map
			curr_neighbors[id] = info;
		    				
			// check if this neighbor is new neighbor
			if (prev_neighbors.hasOwnProperty(id) === false)
				new_list.push(ident);
		}
    }

	// check if any previously known neighbor are no longer neighbors
	for (var nid in prev_neighbors) {
		if (curr_neighbors.hasOwnProperty(nid) === false) {
			var info = prev_neighbors[nid];
			left_list.push(info.apikey + ':' + info.layer + ':' + info.name);
		}
	}

	// replace neighbor list for this node
	_id2neighbors[self.id] = curr_neighbors;

	LOG.warn('neighbors returned. new: ' + new_list.length + 
	         ' left: ' + left_list.length + ' subscribe: ' + subscribe_list.length);

	return [new_list, left_list, subscribe_list];
}

//
//	helpers
//

// check if a given node is a direct area subscriber for a center point
var _isSubscriber = function (node, aoi) {

    // NOTE: if subscription radius is 0, then we consider it's not subscribing anything
    var result = (node.aoi.radius != 0 && node.aoi.covers(aoi.center));
    LOG.debug('isSubscriber check if node ' + node.toString() + ' covers ' + aoi.center.toString() + ': ' + result);
    return result;
}
