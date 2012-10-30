
//
// local private variables to keep track of created nodes
//

// include VAST
require('../common');

// default port for connecting / creating VON nodes
var _VON_port = 37700;
var _VON_gateway = '127.0.0.1';
//var _VON_gateway = 'dev.imonology.com';

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


//
// actual execution code
//
var _publishPos = function (node, pos, radius) {

    // build new AOI info
    var aoi = new VAST.area(pos, radius);
    
    // perform movement
    node.move(aoi);
}

//
// helper code
//

var _registerNode = function (pos, info, done_CB) {

    // extract AOI for the VON node to create               
    var aoi = new VAST.area(pos, _default_radius);
    
    // specify where to locate VON gateway
    var ip_port = new VAST.addr(_VON_gateway, _VON_port);                
    var new_node = new VON.peer(VAST_ID_UNASSIGNED, ip_port.port + _nodes_created);
    _nodes_created++;
                    
    LOG.debug('new_node (before join): ' + new_node.getSelf().toString());
    
    // store node ident for ident discovery across different VSS servers
    var ident_info = {
        apikey: info.apikey,
        layer:  info.layer,
        ident:  info.ident
    };
    
    new_node.put(ident_info);
                       
    // join in the network        
    new_node.join(ip_port, aoi,
    
        // done callback
        function (self_id) {
                            
            LOG.warn('\njoined successfully! id: ' + self_id + ' self id: ' + new_node.getSelf().id);
            
            // keep track of newly joined node in internal record
            if (_keys.hasOwnProperty(info.apikey) === false)
                _keys[info.apikey] = {};
            if (_keys[info.apikey].hasOwnProperty(info.layer) === false)
                _keys[info.apikey][info.layer] = {};
                
            _keys[info.apikey][info.layer][info.ident] = new_node;

            // store id to ident mapping
            LOG.debug('store mapping for node id: ' + self_id + ' ident: ' + info.ident);
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
}

var _revokeNode = function (info, done_CB) {

    // check if node exists, return error if not yet exist (need to publishPos first)
    var node = _getNode(info);
    
    if (node === undefined || node === null) 
        return done_CB(false);
    
    var node_id = node.getSelf().id;
    
    //destroy node
    node.leave();
    node = null;
    delete _keys[info.apikey][info.layer][info.ident];
    
    // check if we need to remove layer and/or API key
    if (Object.keys(_keys[info.apikey][info.layer]).length === 0)
        delete _keys[info.apikey][info.layer];
    if (Object.keys(_keys[info.apikey]).length === 0)
        delete _keys[info.apikey];
        
    // remove id to ident mapping
    LOG.debug('remove mapping for node id: ' + node_id + ' ident: ' + info.ident);
    delete _id2ident[node_id];    
        
    done_CB(true);
}

// send back response to client
var _reply = function (res, res_obj) {

    // return response if exist, otherwise response might be returned 
    // AFTER some callback is done handling (i.e., response will be returned within the handler)
    if (typeof res_obj === 'string') {
        LOG.debug('replying a string: ' + res_obj);
        res.writeHead(200, {'Content-Type': 'text/plain'});					 
        res.end(res_obj);            
    }
    else {
        LOG.debug('replying a JSON: ' + JSON.stringify(res_obj));
        res.writeHead(200, {'Content-Type': 'application/json'});					 
        res.end(JSON.stringify(res_obj));        
    }
}

// send back subscriber list to client
var _replySubscribers = function (request, res) {

    var node = _getNode(request, res);

    if (node !== undefined && node !== null) {
    
        // get a list of current neighbors's id
        var neighbors = node.list();
        var list = [];
        
        var self = node.getSelf();
                       
        // TODO: send only those who's AOI covers me (as true subscribers, not simply enclosing neighbors)
        for (var id in neighbors) {
            // convert node id to node ident (only for those registered here)
            // NOTE: current approach can only do ident translation for nodes created via this VSS server
            
            var neighbor = neighbors[id];
            if (neighbor.hasOwnProperty('meta')) {
                LOG.warn('neighbor [' + id + '] has meta!');
                var info = neighbor.meta;
                for (var i in info) 
                    LOG.debug(i + ': ' + info[i]);
            }
            
            LOG.debug('checking neighbor id: ' + id + ' against self id: ' + self.id);
            // do not return a node if:
            //    1. is self
            //    2. no mapping for ident (the node is not created via VSS)
            //    3. is not a subscriber to myself (subscribed area does not cover me)
            if (self.id == id ||
                _id2ident.hasOwnProperty(id) === false || 
                _isSubscriber(neighbors[id], self.aoi) === false)
                continue;
                
            var info = _id2ident[id]; 
            list.push(info.apikey + ':' + info.layer + ':' + info.ident);            
        }
                        
        // return success
        var error = [];
        _reply(res, [list, error]);
    }
}


// get a specific node given its API key, layer, and node ident
// returns 'undefined' if key info is missing
// returns 'null' if not found
var _getNode = function (req, res) {

    // check if any essential info is missing
    if (req.apikey === '' || req.layer === '' || req.ident === ''){
        if (res !== undefined)
            _reply(res, ["", ["key info (apikey/layer/ident) missing"]]);               
        return undefined;
    }
                              
    for (var key in _keys)
        LOG.debug('key: ' + key);
    
    if (_keys.hasOwnProperty(req.apikey)) {
        var layers = _keys[req.apikey];
        
        for (var layer in layers)
            LOG.debug('layer: ' + layer);
        
        if (layers.hasOwnProperty(req.layer)) {
            var nodes = layers[req.layer];
            
            for (var node in nodes)
                LOG.debug('node: ' + node);
            
            if (nodes.hasOwnProperty(req.ident)) { 
                return nodes[req.ident];
            }
        }     
    }
       
    // no node found, warn in advance
    if (res !== undefined)
        _reply(res, ["", ['node not yet created']]);
    
    return null;
}

// check if a given node is a direct area subscriber for a center point
var _isSubscriber = function (node, aoi) {

    var result = node.aoi.covers(aoi.center);
    LOG.debug('check if node [' + node.toString() + '] covers ' + aoi.center.toString() + ': ' + result);
    return result;
}
 
function publish(words, res) {
    LOG.debug("Request handler 'publish' was called.");
    
    var request = {};
    
    switch (words[2]) {
    
        // publishPos
        case 'pos': {
            LOG.debug('pos ...');
            // need to update position, or create new node if nothing exists yet
            
            // extract parameters
            request = { apikey:  words[3] || '',
                        layer:   words[4] || '',                           
                        ident:   words[5] || '',                            
                        x:       Number(words[6]) || 0,
                        y:       Number(words[7]) || 0,
                        z:       Number(words[8]) || 0
                      };
                      
            // verify parameter validity          
            LOG.debug('request: ' + JSON.stringify(request));
                                        
            // check if node's already created, if so then send update
            // if not then need to create a new VON peer node
            var node = _getNode(request);

            switch (node) {
                // parameter invalid
                case undefined: {
                    _reply(res, ["", ["key info (apikey/layer/ident) missing"]]);
                    break;
                }
            
                // no node exist, create new
                case null: {
                    // if node does not exist, create one            
                    var pos = new VAST.pos(request.x, request.y);
                
                    // append additional z value
                    pos.z = request.z;
                
                    _registerNode(pos, request, function (new_node) {
                        
                        LOG.debug('new_node: ' + JSON.stringify(new_node));
                    
                        // send back node creation response                    
                        //_reply(res, ["OK", []]);            
                                                
                        _replySubscribers(request, res); 
                    });            
                    break;
                }
                     
                // publish pos
                default: {
                    _publishPos(node, request, node.getSelf().aoi.radius);
                    
                    //_reply(res, ["OK", []]);            
                    _replySubscribers(request, res);
                    break;
                }
            }  
            break;        
        }
        /*
        case 'area': {
            LOG.debug('area ...');
            break;        
        }
        */
        default: {
            _reply(res, JSON.stringify(request));
            break;
        }
    }
}

function subscribe(words, res) {
    LOG.debug("Request handler 'subscribe' was called.");
    
    var request = {};
    
    switch (words[2]) {
    
        // near
        case 'nearby': {
            LOG.debug('nearby ...');
            
            // extract parameters
            request = { apikey:  words[3] || '',
                        layer:   words[4] || '',                           
                        ident:   words[5] || '',                            
                        radius:  Number(words[6]) || 0
                      };

            // check parameters
            if (request.radius <= 0) {
                // return an error
                _reply(res, ["", ['radius is 0 or less than 0']]);
                break;            
            }
                                        
            // check if node exists, return error if not yet exist (need to publishPos first)
            var node = _getNode(request, res);
            
            if (node != undefined && node !== null) {
                // update AOI radius for area subscription
                _publishPos(node, node.getSelf().aoi.center, request.radius);
                
                // return success
                _reply(res, ["OK", []]);                  
            }    
            break; 
        }
        default: {
            _reply(res, JSON.stringify(request));
            break;
        }        
    }  
}

function unsubscribe(words, res) {
    LOG.debug("Request handler 'unsubscribe' was called.");

    var request = {};
    
    switch (words[2]) {
    
        // near
        case 'nearby': {
            LOG.debug('nearby ...');
            // ensure this method doesn't get abused
            
            // extract parameters
            request = { apikey:  words[3] || '',
                        layer:   words[4] || '',                           
                        ident:   words[5] || ''
                      };            

            // check if node exists, return error if not yet exist (need to publishPos first)
            var node = _getNode(request, res);

            if (node === null || node === undefined)
                break;
                      
            // update AOI radius for area subscription
            _publishPos(node, node.getSelf().aoi.center, 0);
            
            // return success
            _reply(res, ["OK", []]); 
            break;        
        }
        default: {
            _reply(res, JSON.stringify(request));
            break;
        }
    }
}


function query(words, res) {
    LOG.debug("Request handler 'query' was called.");
    
    var request = {};
    
    switch (words[2]) {
    
        // get subscribers of current node
        case 'subscribers': {
            LOG.debug('subscribers ...');
            // ensure this method doesn't get abused
            
            // extract parameters
            request = { apikey:  words[3] || '',
                        layer:   words[4] || '',                           
                        ident:   words[5] || ''
                      };       

            // check if node exists, return error if not yet exist (need to publishPos first)
            _replySubscribers(request, res);
                                      
            break;          
        }            
        default: {
            _reply(res, JSON.stringify(request));
            break;
        }        
    }    
}

// remove a node from system
function revoke(words, res) {
    LOG.debug("Request handler 'revoke' was called.");
    
    var request = {};
    
    switch (words[2]) {
    
        // get subscribers of current node
        case 'node': {
            LOG.debug('node ...');
            // ensure this method doesn't get abused
            
            // extract parameters
            request = { apikey:  words[3] || '',
                        layer:   words[4] || '',                           
                        ident:   words[5] || ''
                      };       

            _revokeNode(request, function(result) {
                // return success
                if (result === true)
                    _reply(res, ["OK", []]);
                else
                    _reply(res, ["", ["revoke fail"]]);
            });
                           
            break;        
        }
        default: {
            _reply(res, JSON.stringify(request));
            break;
        }        
    }    
}


exports.publish = publish;
exports.subscribe = subscribe;
exports.unsubscribe = unsubscribe;
exports.query = query;
exports.revoke = revoke;

