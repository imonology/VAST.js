
/*
    A router for VSS server to execute actual commands

*/

var urlParser = require('url');

function printWords(words) {

    var str = '';
    for (var i=0; i < words.length; i++)
        str += i + ':' + words[i] + ' ';

    return str;
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

function route(handlers, req, res, JSONobj) {
    LOG.debug('routing a request: ' + req.url);

	// print out path 
	var obj = urlParser.parse(req.url, true);
	var pathname = obj.pathname;

	// extract action/target/path
	var words = pathname.split('/');            
	var action = words[1];
	var target = words[2];		
    var ident = {};
	ident.apikey = words[3] || '';
	ident.layer =  words[4] || '';
    ident.name =   words[5] || '';
	
	var para = words.slice(6, words.length);
	var ident_str = ident.apikey + ':' + ident.layer + ':' + ident.name;

	// check valid ident and actions are provided
    	
	var local_action = function (remote_res) {

		// remote action, simply return response
		if (remote_res !== null)
			_reply(res, remote_res);
		// check if local handlers exist
		// NOTE: we can skip the above to perform single VSS server scenario
		else {
			LOG.debug('calling request handler for: ' + action);

			// replace 'para' content if POST data exists
			if (JSONobj !== undefined)
				para = JSONobj;

			handlers[action](target, ident, para, function (response) {
				// if action was not handled
				if (response === undefined) 
					_reply(res, 'unrecongizable [' + action + '] parameter: ' + target);
				else
					_reply(res, response);
			});
		}
	}

	// always perform manage requests locally
	if (action === 'manage')
		local_action(null);
	// check if action is valid
	else if (typeof handlers[action] !== 'function') {

		// ignore favicon
		if (req.url === '/favicon.ico')
			return res.end();

        LOG.warn('no request handle for: ' + action);
        res.writeHead(404, {'Content-Type': 'text/plain'});
        res.end('404 Not Found: ' + req.url); 		
	}
	// check if ident is valid
	else if (ident.apikey === '' || ident.layer === '' || ident.name === '') {
		_reply(res, 'ident info is not enough (apikey/layer/name) missing');
	}
	else
		handlers.checkForwarding(ident_str, pathname, local_action);			
}

exports.route = route;
