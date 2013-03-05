
// include VAST
require('../common');

// do not show debug
//LOG.setLevel(2);

var server = require("./server");
var router = require("./router");
var handlers = require("./handler");

var handle = {}
handle["publish"]   = handlers.publish;
handle["subscribe"] = handlers.subscribe;
handle["unsubscribe"] = handlers.unsubscribe;
handle["query"]     = handlers.query;
handle["revoke"]    = handlers.revoke;

server.start(router.route, handle);