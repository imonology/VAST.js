/*
    server.js
    
    Voronoi Spatial Publish (VSS) server


    2012.09.18      init


*/

var serverPort = 39900;

var http = require('http');
var urlParser = require('url');

// start server
var start = function (route, handle) {
    
    http.createServer(function (req, res) {

        // print out path 
        var obj = urlParser.parse(req.url, true);
        
        route(handle, obj.pathname, res);
         
    }).listen(serverPort);

    LOG.debug('Server running at http://127.0.0.1:' + serverPort + '/');
}

exports.start = start;