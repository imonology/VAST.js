
//
//	handler.js	handles REST request and pass to logic to handling
//

var logic = require('./logic');

//
// directory-related
//

var directory = require('./directory');

// get the VSS server address for a particular node from central directory
var _queryNodeAddress = function (ident_str, onDone) {

	LOG.warn('local address: ' + CONFIG.localAddr, 'queryNodeAddress');

	var ident_path = ident_str.replace(/:/g, '/');

	// parameters are: ident/addr
	var url = 'http://' + CONFIG.gatewayIP + ':' + CONFIG.gatewayPort + '/manage/reg/' + ident_path + '/' + CONFIG.localAddr;
	
	LOG.warn('url: ' + url, 'queryNodeAddress');

	UTIL.HTTPget(url, function (res_obj) {

		// default to self address
		var addr = CONFIG.localAddr;
		LOG.warn('HTTPget res: ', 'queryNodeAddress');
		LOG.warn(res_obj);

		// if ident -> addr mapping exists,
		// record the mapping so we can know where to re-direct future requests 		
		// or check if some error has occured (gateway is down)
		if (res_obj === null) {			
			LOG.warn('error or gateway is down, store address as local', 'queryNodeAddress');			
		}
		else if (res_obj.addr !== '')
			addr = res_obj.addr;		

		var is_local = (addr === CONFIG.localAddr ? '(local)' : '(remote)');

		LOG.warn('record [' + ident_str + '] mapping to addr: ' + addr + ' ' + is_local, 'queryNodeAddress');
		directory.createNode(ident_str, addr);
		onDone(addr);
	});
}

// check if a particular ident belongs to this VSS server 
// or should be re-directed to another VSS server
var _validateIdent = exports.validateIdent = function (ident_str, onDone) {

	// first check if ident exists locally
	var addr = directory.checkNode(ident_str);

	var handleAddress = function (addr_found) {
		if (addr_found === CONFIG.localAddr) {
			LOG.warn('addr found is local: ' + addr_found);
			onDone('');
		}
		else {
			LOG.warn('addr found is remote: ' + addr_found); 
			onDone(addr_found);
		}
	}

	// if address mapping is found, return directly
	if (addr !== '')
		handleAddress(addr);
	else {

		// if not found then register centrally or obtain the actual VSS server
		_queryNodeAddress(ident_str, handleAddress);
	}	
}

// check if ident exists at this server, or forwarding is needed
// return a remote response, if forwarding is used, otherwise returns null for local action
var _checkForwarding = exports.checkForwarding = function (ident_str, pathname, onDone) {
	
	// check if this should be local action
	_validateIdent(ident_str, function (addr_validated) {

		// should be locally executed
		if (addr_validated === '') {
			LOG.warn('addr found is local, locally executing: ' + pathname);			
			return onDone(null);
		}

		// action should be executed remotely		
		var url = 'http://' + addr_validated + pathname;
		LOG.warn('local service not available, forward to: ' + url);
		
        UTIL.HTTPget(url, function (response) {

			// return remote response
			LOG.warn('Forwarding response received', 'checkForwarding');
			LOG.warn(response);
			onDone(response);
		});	
	});
}


//
//	helpers
//


// send back lists of in/out neighbors & subscribers to client
var _replyPublishPos = function (ident) {

    var error = [];
	var lists = [];
    var node = logic.getNode(ident);
	
    if (node === undefined || node === null) {
		var err_msg = 'node not found or response object invalid';
		LOG.error(err_msg, 'replyPublishPos');
		error.push(err_msg);
	}
	else {
		// list to be returned (subscribers, new neighbors, left neighbors)
		lists = logic.getLists(node);
		LOG.debug('node id: ' + node.getSelf().id, 'replyPublishPos');
	}
                            
    // return result
    return [lists, error];
}

// send back list of subscribers
var _replySubscribers = function (ident) {

    var error = [];
	var subscribers = [];
    var node = logic.getNode(ident);
	
    if (node === undefined || node === null) {
		var err_msg = 'node not found or response object invalid';
		LOG.error(err_msg, 'replySubscribers');
		error.push(err_msg);
	}
	else {
		// list to be returned (subscribers, new neighbors, left neighbors)
		subscribers = logic.getSubscribers(node);
	}

    LOG.debug('node id: ' + node.getSelf().id, 'replySubscribers');
                        
    // return result
    return [subscribers, error];
}



//
//	public actions
//

var publish = function (target, ident, para, onDone) {
    
    switch (target) {
    
        // publishPos
		// update position, or create new node if nothing exists yet
        case 'pos': {
            LOG.debug('pos ...');
                        
            // extract parameters
            var pos = { x: Number(para[0]) || 0,
                        y: Number(para[1]) || 0,
                        z: Number(para[2]) || 0
                      };
					  		                      
            // check if node's already created, if so then send update
            // if not then need to create a new VON peer node
            var node = logic.getNode(ident);

            switch (node) {
                // parameter invalid
                case undefined: {
                    onDone(["", ["key info (apikey/layer/name) missing"]]);
                    break;
                }
            
                // no node exist, create new
                case null: {

                    // if node does not exist, create one                            
                    logic.createNode(ident, pos, function (new_node) {
                        
                        LOG.debug('new_node: ' + JSON.stringify(new_node));                                                                        
                        var response = _replyPublishPos(ident);
						onDone(response);
                    });            
                    break;
                }
                     
                // publish pos
                default: {
                    logic.publishPos(node, pos, node.getSelf().aoi.radius, function () {
                        var response = _replyPublishPos(ident);
						onDone(response);				
					});                
                    break;
                }
            }                                        
            break;        
        }

        default: {
            onDone();
            break;
        }
    }	  
}

var subscribe = function (target, ident, para, onDone) {    
    
    switch (target) {
    
        // near
        case 'nearby': {
            LOG.debug('nearby ...');
            
            // extract parameters
			var radius = Number(para[0]) || 0;

            // check parameters
            if (radius <= 0) {
                // return an error
                onDone(["", ['radius is 0 or less than 0']]);
                break;            
            }
				                                        
            // check if node exists, return error if not yet exist (need to publishPos first)
            var node = logic.getNode(ident);
			
			if (node === undefined) {
				onDone(["", ["key info (apikey/layer/name) missing"]]);
			}
			else if (node === null) {
				onDone(["", ['node not yet created']]);
			}            
            else {
                // update AOI radius for area subscription
                logic.publishPos(node, node.getSelf().aoi.center, radius, function () {				
	                // return success
		            onDone(["OK", []]);
				});                
            }			
            break; 
        }
        default: {
            onDone();
            break;
        }        
    }  
}

var unsubscribe = function (target, ident, para, onDone) {
    
    switch (target) {
    
        // near
        case 'nearby': {
            LOG.debug('nearby ...');

            // TODO: make sure this method doesn't get abused
            
            // check if node exists, return error if not yet exist (need to publishPos first)
            var node = logic.getNode(ident);

			if (node === undefined) {
				onDone(["", ["key info (apikey/layer/name) missing"]]);
			}
			else if (node === null) {
				onDone(["", ['node not yet created']]);
			}
			else {
                        
				// update AOI radius for area subscription
				logic.publishPos(node, node.getSelf().aoi.center, 0, function () {
			
					// return success
					onDone(["OK", []]);
				});            
			}								
            break;        
        }
        default: {
            onDone();
            break;
        }
    }
}


var query = function (target, ident, para, onDone) {
    
    switch (target) {
    
        // get subscribers of current node
        case 'subscribers': {
            LOG.debug('subscribers ...');
            // TODO: ensure this method doesn't get abused (or DDoS attack)
					  
            // check if node exists, return error if not yet exist (need to publishPos first)
            var response = _replySubscribers(ident);
			onDone(response);                                      
            break;          
        }
        default: {
            onDone();
            break;
        }        
    }    
}

// remove a node from system
var revoke = function (target, ident, para, onDone) {
    
    switch (target) {
    
        // get subscribers of current node
        case 'node': {
            LOG.debug('node ...');

            // ensure this method doesn't get abused            
            logic.deleteNode(ident, function (result) {
                // return success
                if (result === true)
                    onDone(["OK", []]);
                else
                    onDone(["", ["revoke fail"]]);
            });
                           
            break;        
        }
        default: {
            onDone();
            break;
        }        
    }    
}

// manage VAST node register / unregister / check existence
var manage = function (target, ident, para, onDone) {
    
	// prepare ident's string form
	var ident_str = ident.apikey + ':' + ident.layer + ':' + ident.name;

    switch (target) {
    
        // register a new node
        case 'reg': {
            LOG.debug('registering new node...');
            
            // extract node ident and the IP/port info of its VSS server
            var addr = para[0];			
			var result = directory.checkNode(ident_str);
			
			// if nothing was registered then store new
			if (result !== '') {     
				// return existing
				onDone({addr: result});
				break;
			}
			
			LOG.debug('node [' + ident_str + '] register succcessful...');                                          
			var result = directory.createNode(ident_str, addr);
			onDone({addr: ''});
			break;    
        }

        // unregister an existing node 
        case 'unreg': {
            LOG.debug('unregistering node...');
            
            // extract node ident and the IP/port info of its VSS server
			var result = directory.deleteNode(ident_str);
			onDone({result: result}); 
            break;        
        }

		// execute remote function locally
		case 'remote': {

			var func  = para.func;
			var args  = para.args;

			var onDone = function (result) {

				var return_obj = {func: func, res: result};

				LOG.warn('RPC returning: ');
				LOG.warn(return_obj);
				
				onDone(return_obj); 
			}

			// execute the function locally
			args.push(onDone);
			logic[func].apply(this, args);			
			break;
		}
        
        default: {
            onDone();
            break;
        }
    }    
}

exports.publish     = publish;
exports.subscribe   = subscribe;
exports.unsubscribe = unsubscribe;
exports.query	    = query;
exports.revoke      = revoke;
exports.manage      = manage;
