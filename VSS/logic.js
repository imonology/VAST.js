
//
// logic.js -- VSS core logic to maintain multiple VAST nodes
//
// history:
//		2013-03-12	separated from handler.js to be sharable
//		

// TODO: need to 

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
// NOTE: it's a 3-dimensional map
var _keys = {};

// node id -> ident mapping
var _id2ident = {};

// node id -> neighbor list mapping
var _id2neighbors = {};


//
// public calls
//

// get a specific node given its API key, layer, and name (i.e., ident)
// returns 'undefined' if key ident is missing
// returns 'null' if not found
// NOTE: the node returned is a VON_peer instance
var _getNode = exports.getNode = function (ident) {

    // check if any essential ident is missing
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
				var node = nodes[ident.name];
				LOG.warn('returning a node: ' + node.getSelf().id);
                return node;
            }
        }
    }
       
	// no node found, warn in advance    
	return null;
}

var _createNode = exports.createNode = function (ident, position, onDone) {
	
    var pos = new VAST.pos(position.x, position.y);
    
    // append additional z value
    pos.z = position.z;	

    // extract AOI for the VON node to create        
    var aoi = new VAST.area(pos, _default_radius);
    
    // specify where to locate VON gateway
    var ip_port  = new VAST.addr(_VON_gateway, _VON_port);                
    var new_node = new VON.peer();
                           
    // join in the network    
	// TODO: keep track and recycle ports?    
    new_node.init(VAST.ID_UNASSIGNED, ip_port.port + _nodes_created, function () {
    
        _nodes_created++;          

        // store node ident for ident discovery across different VSS servers        
        new_node.put({
            apikey: ident.apikey,
            layer:  ident.layer,
            name:   ident.name
        });
        
        new_node.join(ip_port, aoi,
        
            // done callback
            function (self_id) {
                                
                LOG.warn('\njoined successfully! id: ' + self_id + ' self id: ' + new_node.getSelf().id);
               
                // keep track of newly joined node in internal record
                if (_keys.hasOwnProperty(ident.apikey) === false)
                    _keys[ident.apikey] = {};
                if (_keys[ident.apikey].hasOwnProperty(ident.layer) === false)
                    _keys[ident.apikey][ident.layer] = {};
                    
                _keys[ident.apikey][ident.layer][ident.name] = new_node;
    
                // store id to ident mapping
                LOG.debug('store mapping for node id: ' + self_id + ' name: ' + ident.name);
                _id2ident[self_id] = ident;
                                
                // check content
                LOG.debug('new_node (after join): ' + new_node.getSelf().toString());
    
                // NOTE: perform initial publish pos (so we can get a list of neighbors) doesn't appear to work
                
                onDone(new_node);
            }
        );              
    });   
}

var _deleteNode = exports.deleteNode = function (ident, onDone) {

    // check if node exists, return error if not yet exist (need to publishPos first)
    var node = _getNode(ident);
	
    if (node === undefined || node === null) 
        return onDone(false);
    
    var node_id = node.getSelf().id;
    
    //delete node
    node.leave();
    node.shut();
    node = null;
    
    delete _keys[ident.apikey][ident.layer][ident.name];
    
    // check if we need to remove layer and/or API key
    if (Object.keys(_keys[ident.apikey][ident.layer]).length === 0)
        delete _keys[ident.apikey][ident.layer];
    if (Object.keys(_keys[ident.apikey]).length === 0)
        delete _keys[ident.apikey];
        
    // remove id to ident mapping
    LOG.debug('remove mapping for node id: ' + node_id + ' name: ' + ident.name);
    delete _id2ident[node_id];    
        
    onDone(true);
}

// update position or radius (AOI)
var _publishPos = exports.publishPos = function (node, pos, radius, onDone) {

    // build new AOI ident
    var aoi = new VAST.area(pos, radius);
    
    // perform movement
    node.move(aoi);

	onDone();
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
        var ident = undefined;
        if (neighbor.hasOwnProperty('meta'))
            ident = neighbor.meta;
        else if (_id2ident.hasOwnProperty(id))
            ident = _id2ident[id];
                                    
        // skip if
        //    1. is self
        //    2. no mapping for ident (the node is not created via VSS)
        if (self.id == id ||
            ident   === undefined)
			continue;

		// build unique ident for this neighbor
		var ident_str = ident.apikey + ':' + ident.layer + ':' + ident.name;

		// check if this neighbor should be put to subscriber list
		// is a subscriber to myself (i.e., subscribed area covers me)
		if (_isSubscriber(neighbors[id], self.aoi))
			subscribe_list.push(ident_str);
        
		// check if I am a subscriber to this neighbor
		if (_isSubscriber(self, neighbors[id].aoi)) {
					            
			// store this neighbor to a map
			curr_neighbors[id] = ident;
		    				
			// check if this neighbor is new neighbor
			if (prev_neighbors.hasOwnProperty(id) === false)
				new_list.push(ident_str);
		}
    }

	// check if any previously known neighbor are no longer neighbors
	for (var nid in prev_neighbors) {
		if (curr_neighbors.hasOwnProperty(nid) === false) {
			var ident = prev_neighbors[nid];
			left_list.push(ident.apikey + ':' + ident.layer + ':' + ident.name);
		}
	}

	// replace neighbor list for this node
	_id2neighbors[self.id] = curr_neighbors;

	LOG.warn('neighbors returned. new: ' + new_list.length + 
	         ' left: ' + left_list.length + ' subscribe: ' + subscribe_list.length);

	return [new_list, left_list, subscribe_list];
}

// get a list of subscribers to myself
// TODO: combine overlapped functions with getLists()
exports.getSubscribers = function (node) {

	var neighbors = node.list();
	var self      = node.getSelf();

	var subscribe_list = [];
	
    for (var id in neighbors) {
        var neighbor = neighbors[id];
                
        // get node ident (from either 'meta' field or from mapping)
		// 'meta' means remote, mapping means on this server (?)
        var ident = undefined;
        
		if (neighbor.hasOwnProperty('meta'))
            ident = neighbor.meta;
        else if (_id2ident.hasOwnProperty(id))
            ident = _id2ident[id];
                                    
        // skip if
        //    1. is self
        //    2. no mapping for ident (the node is not created via VSS)
        if (self.id == id ||
            ident   === undefined)
			continue;

		// build unique ident for this neighbor
		var ident_str = ident.apikey + ':' + ident.layer + ':' + ident.name;

		// check if this neighbor should be put to subscriber list
		// is a subscriber to myself (i.e., subscribed area covers me)
		if (_isSubscriber(neighbors[id], self.aoi))
			subscribe_list.push(ident_str);

	}

	return subscribe_list;
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


