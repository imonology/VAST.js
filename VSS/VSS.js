
// include VAST (need it here?)
require('../VAST');

// default settings
global.CONFIG = {
	gatewayIP:	'127.0.0.1',
	gatewayPort: 39900	
};

// do not show debug
//LOG.setLevel(2);

var server   = require("./server");
var router   = require("./router");
var handlers = require("./handler");

server.start(router.route, handlers);