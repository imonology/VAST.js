
//
//	handler.js	handles REST request and pass to logic to handling
//

var logic = require("./logic");

//
//	helpers
//

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
var _replyPublishPos = function (request, res) {

    var node = logic.getNode(request, res);
    
    if (node === undefined || node === null || res === undefined) {
		LOG.error('node not found or response object invalid', 'replyPublishPos');
		return;
	}

    LOG.debug('replySubscribers called, node id: ' + node.getSelf().id);

	// list to be returned (subscribers, new neighbors, left neighbors)
    var lists = logic.getLists(node);
                    
    // return success
    var error = [];
    _reply(res, [lists, error]);    
}

//
//	public actions
//

var publish = function (words, res) {
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
                        name:    words[5] || '',                            
                        x:       Number(words[6]) || 0,
                        y:       Number(words[7]) || 0,
                        z:       Number(words[8]) || 0
                      };
                      
            // verify parameter validity          
            LOG.debug('request: ' + JSON.stringify(request));
                                        
            // check if node's already created, if so then send update
            // if not then need to create a new VON peer node
            var node = logic.getNode(request);

            switch (node) {
                // parameter invalid
                case undefined: {
                    _reply(res, ["", ["key info (apikey/layer/name) missing"]]);
                    break;
                }
            
                // no node exist, create new
                case null: {

                    // if node does not exist, create one                            
                    logic.registerNode(request, request, function (new_node) {
                        
                        LOG.debug('new_node: ' + JSON.stringify(new_node));                                                                        
                        _replyPublishPos(request, res);
                    });            
                    break;
                }
                     
                // publish pos
                default: {
                    logic.publishPos(node, request, node.getSelf().aoi.radius);
                    
                    _replyPublishPos(request, res);
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

var subscribe = function (words, res) {
    LOG.debug("Request handler 'subscribe' was called.");
    
    var request = {};
    
    switch (words[2]) {
    
        // near
        case 'nearby': {
            LOG.debug('nearby ...');
            
            // extract parameters
            request = { apikey:  words[3] || '',
                        layer:   words[4] || '',                           
                        name:    words[5] || '',                            
                        radius:  Number(words[6]) || 0
                      };

            // check parameters
            if (request.radius <= 0) {
                // return an error
                _reply(res, ["", ['radius is 0 or less than 0']]);
                break;            
            }
                                        
            // check if node exists, return error if not yet exist (need to publishPos first)
            var node = logic.getNode(request);

			if (node === undefined) {
				_reply(res, ["", ["key info (apikey/layer/name) missing"]]);               
			}
			else if (node === null) {
				_reply(res, ["", ['node not yet created']]);
			}            
            else {
                // update AOI radius for area subscription
                logic.publishPos(node, node.getSelf().aoi.center, request.radius);
                
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

var unsubscribe = function (words, res) {
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
                        name:    words[5] || ''
                      };            

            // check if node exists, return error if not yet exist (need to publishPos first)
            var node = logic.getNode(request);

			if (node === undefined) {
				_reply(res, ["", ["key info (apikey/layer/name) missing"]]);
			}
			else if (node === null) {
				_reply(res, ["", ['node not yet created']]);
			}
			else
                break;
                      
            // update AOI radius for area subscription
            logic.publishPos(node, node.getSelf().aoi.center, 0);
            
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


var query = function (words, res) {
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
                        name:    words[5] || ''
                      };       

            // check if node exists, return error if not yet exist (need to publishPos first)
            _replyPublishPos(request, res);
                                      
            break;          
        }            
        default: {
            _reply(res, JSON.stringify(request));
            break;
        }        
    }    
}

// remove a node from system
var revoke = function (words, res) {
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
                        name:    words[5] || ''
                      };       

            logic.revokeNode(request, function(result) {
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


exports.publish     = publish;
exports.subscribe   = subscribe;
exports.unsubscribe = unsubscribe;
exports.query	    = query;
exports.revoke      = revoke;

