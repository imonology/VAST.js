
/*
    common definitions for VAST.js  
*/

//
// utilities
//

// define log if not defined
if (typeof global.LOG === 'undefined') {
	var logger  = require('./common/logger');
	global.LOG  = new logger();

	// set default error level
	LOG.setLevel(3);
}


//
// VAST & VON
//
global.UTIL			= require('./common/util');

global.VAST         = require('./types');
global.VAST.net     = require('./net/vast_net');
//global.VAST.client  = require('./client');
//global.VAST.matcher = require('./matcher');

// ID definitions
global.VAST.ID_UNASSIGNED = 0;
global.VAST.ID_GATEWAY    = 1;

// enumation of VON message
global.VON_Message = {
    VON_BYE:        0, // VON's disconnect
    VON_PING:       1, // VON's ping, to check if a connected neighbor is still alive
    VON_QUERY:      2, // VON's query, to find an acceptor to a given point 
    VON_JOIN:       3, // VON's join, to learn of initial neighbors
    VON_NODE:       4, // VON's notification of new nodes 
    VON_HELLO:      5, // VON's hello, to let a newly learned node to be mutually aware
    VON_HELLO_R:    6, // VON's hello response
    VON_EN:         7, // VON's enclosing neighbor inquiry (to see if my knowledge of EN is complete)
    VON_MOVE:       8, // VON's move, to notify AOI neighbors of new/current position
    VON_MOVE_F:     9, // VON's move, full notification on AOI
    VON_MOVE_B:     10,// VON's move for boundary neighbors
    VON_MOVE_FB:    11,// VON's move for boundary neighbors with full notification on AOI
    MATCHER_POINT:  12,// Packets/Messages sent to a point, between matchers over VON
    MATCHER_AREA:  13 // Packets/Messages sent to an area, between matchers over VON
};

global.VON_Message_String = [
    'VON_BYE',
    'VON_PING',
    'VON_QUERY',
    'VON_JOIN',
    'VON_NODE', 
    'VON_HELLO',
    'VON_HELLO_R',
    'VON_EN',
    'VON_MOVE',
    'VON_MOVE_F',
    'VON_MOVE_B',    
    'VON_MOVE_FB',
    'MATCHER_POINT',
    'MATCHER_AREA'
];

// enumation of Matcher message
global.Matcher_Message = {
    FIND_MATCHER:           0,      // Find the matcher for a given position
    FOUND_MATCHER:          1,      // Found the matcher, receiving its info
    PUB:                    2,
    PUB_MATCHED:            3,      // sent a pub to the owner of a matching subscription      
    SUB_NEW:                4,      
};

global.Matcher_Message_String = [
    'FIND_MATCHER',
    'FOUND_MATCHER',
    'PUB',
    'PUB_MATCHED',
    'SUB_NEW'
];

// TODO: find a better way to store this? (maybe in msg_handler?)
global.VAST.state = {
    ABSENT:         0,
   // INIT:           1,           // init done
    JOINING:        2,           // different stages of join
    JOINED:         3
};

global.VAST.priority = {
    HIGHEST:        0,
    HIGH:           1,
    NORMAL:         2,
    LOW:            3,
    LOWEST:         4
};

// TODO: combine into nicer-looking global
global.VAST.msgtype = {
    BYE:        0,  // disconnect
    PUB:        1,  // publish request  
    SUB:        2   // subscribe request
};

global.VAST.msgstr = [
    'BYE',
    'PUB',  
    'SUB'
];

global.VON          = {
    peer: require('./VON_peer')
};

// configurable settings
global.VAST.Settings = {
	port_gateway:	37700,
	IP_gateway:		'127.0.0.1'	
};
