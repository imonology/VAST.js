
/*
    common definitions for VAST  
*/

//
// utilities
//

var logger = require('./common/logger');
global.LOG = new logger();
global.UTIL = require('./common/util');

// set default error level
LOG.setLevel(3);

//
// VAST & VON
//
// ID definitions
global.VAST_ID_GATEWAY = 1;
global.VAST_ID_UNASSIGNED = 0;

global.VAST = require('./vast_types');
global.VAST.net = require('./net/vast_net');
global.VON = {
    peer: require('./VON_peer')
};
