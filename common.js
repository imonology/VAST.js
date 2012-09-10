
/*
    common definitions for VAST  
*/

//
// utilities
//

var logger = require('./common/logger');
global.LOG = new logger();
global.UTIL = require('./common/util');

//
// VAST & VON
//
global.VAST = require('./vast_types');
global.VAST.net = require('./vast_net');
global.VON = require('./VON_peer');

// ID definitions
global.VAST_ID_GATEWAY = 1;
global.VAST_ID_UNASSIGNED = 0;
