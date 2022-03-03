
/*
    common utilities for vast.js       
*/

const http = require('http');
const https = require('https');
const url  = require('url');

// returns number of milliseconds since 1970
exports.getTimestamp = function () {
    var now = new Date();
    return now.getTime();
}

exports.parseAddress = function (ip_port) {

	var addr = {host: '', port: 0};

    // check if this is port only
    var idx = ip_port.search(':');
    
    // ':' not found, port only
    if (idx === (-1))
        addr.port = parseInt(ip_port);       
    else {
        addr.host = ip_port.slice(0, idx);
        addr.port = ip_port.slice(idx+1, ip_port.length);        
    }

	return addr;
}

//
// support for HTTP requests (GET/POST) 
//

// helper to send HTTP post request to an URL with JSON parameters
// ref: http://stackoverflow.com/questions/6158933/http-post-request-in-node-js
// onDone = function(error, response)
var l_HTTPpost = exports.HTTPpost = function (url_request, data_obj, onDone) {

	// parse the url first to extract different fields
	var parsed_url = url.parse(url_request);

    // Build the post string from an object to string format
    //var data = querystring.stringify(data_obj);
	var data = encodeURIComponent(JSON.stringify(data_obj));

	//LOG.warn('POSTing to: ' + url_request + ':');
	//LOG.warn(data);

    // An object of options to indicate where to post to
    var options = {
        host: parsed_url.hostname,
        port: parsed_url.port,
        path: parsed_url.path,
        method: 'POST',
        headers: {
			//'Connection':	  'keep-alive',
            'Content-Type':   'application/x-www-form-urlencoded',
            'Content-Length': data.length			
        }
    };

	// setup server to HTTP or HTTPS
	var server = (url_request.indexOf('https') === 0 ? https : http);

    // Set up the request
    var req = server.request(options, function (res) {
		
        res.setEncoding('utf8');

		// TODO: check for 'end' event?
        res.on('data', function (chunk) {
            LOG.sys('HTTP Post response: ' + chunk);
			// return some positive data
			//onDone(null, res, chunk);
			onDone(chunk, res);
        });
    });

	req.on('error', function (e) {
		LOG.error("HTTP post error: " + e.message);
		onDone(e);
	});

    // post the data
    req.write(data);
    req.end();	
}


// helper to send a HTTP get request to an URL and get response
// TODO: this is borrowed from ImonCloud, possibly share them?
var l_HTTPget = exports.HTTPget = function (url, onDone) {

	LOG.warn(url);

	// send request to app server to get stat
	http.get(url, function (res) {

		// temp buffer for incoming request
		var data = '';

        res.on('data', function (chunk) {
            data += chunk;
        });

        res.on('end', function() {

            var JSONobj = undefined;
            try {
                if (data !== '')
                    JSONobj = JSON.parse(data);
            }
            catch (e) {
                LOG.error('JSON parsing error for data: ' + data);
				onDone(null);
            }

			// return parsed JSON object
			onDone(JSONobj);
		})

	}).on('error', function(e) {

		LOG.error("HTTP get error: " + e.message);
		onDone(null);
	});
}

// get my hostname
exports.getHostname = function(){
    var os = require('os');
    return os.hostname();
}


// get the local IP address, only IPv4
exports.getIPAddress = function (CB_done) {
    var interfaces = require('os').networkInterfaces();
    for (var devName in interfaces) {
      var iface = interfaces[devName];
  
      for (var i = 0; i < iface.length; i++) {
        var alias = iface[i];
        // Preferably, do not return '127.0.0.1'. Need to share our public address over the network
        if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal)
          return CB_done(alias.address);
      }
    }
    // return '127.0.0.1' if no other address is found 
    return CB_done('127.0.0.1');
}

exports.sizeof = function(obj){
    return Buffer.byteLength(JSON.stringify(obj));
}


exports.lookupIP = function (hostname, CB_done){
    
    require('dns').lookup(hostname, function (err, addr, fam) {
        if (err) {
            console.log(err + '. No IP for given hostname');
        }
        else {
            CB_done(addr);
        }
    })
}


