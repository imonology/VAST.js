/*
    server.js
    
    Voronoi Spatial Publish (VSS) server


    2012.09.18      init


*/

var http = require('http');

// start server
var start = function (route, handle) {

	// set binding port, default to be the same as gateway
	var serverPort = CONFIG.gatewayPort;

	// use port argument, if available
	if (process.argv[2] !== undefined) {
		var addr = UTIL.parseAddress(process.argv[2]);
		serverPort = addr.port;
		LOG.warn('setting custom VSS server port: ' + serverPort);
	}

	// get local IP
	UTIL.getLocalIP(function (local_IP) {

		CONFIG.localIP = local_IP;
		CONFIG.localPort = serverPort;
		CONFIG.localAddr = local_IP + ':' + serverPort;

        http.createServer(function (req, res) {

			// temp buffer for incoming request
            var data = '';

            req.on('data', function (chunk) {
                data += chunk;
            });

            req.on('end', function() {
                
                var JSONobj = undefined;
                try {
                    if (data !== '') {
						data = decodeURIComponent(data);
						LOG.warn('data to parse: ' + data);
                        JSONobj = JSON.parse(data);
					}
                }
                catch (e) {
                    LOG.error('JSON parsing error for data: ' + data);
                }

				route(handle, req, res, JSONobj);
            })
             
        }).listen(serverPort);

        LOG.warn('Server running at http://' + local_IP + ':' + serverPort + '/');
	});    
}

exports.start = start;