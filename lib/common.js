
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
global.VAST.client  = require('./VAST_client');
global.VAST.matcher = require('./matcher_new');
global.VAST.entryServer = require('./entryServer');

// ID definitions
global.VAST.ID_UNASSIGNED = 0;
global.VAST.ID_GATEWAY    = 1;
global.NET_ID_UNASSIGNED  = 0;

// TODO: find a better way to store this? (maybe in msg_handler?)
global.VAST.state = {
    ABSENT:         0,
    INIT:           1,           // init done
    JOINING:        2,           // different stages of join
    JOINED:         3
};

global.VSO = {
	CANDIDATE: 	1,      // a idle matcher
    PROMOTING: 	2,      // in the process of promotion
    ACTIVE: 	3,      // active regular matcher
    ORIGIN:		4      // active origin matcher
};

// enumeration of layers
global.LAYER = {
	VON: 0,			// VON layer
	MATCHER: 1,		// Matcher layer
	VAST:	2		// VAST client layer
}

global.Matcher = {
	NODE: 			0,	// receive a list of nodes that matcher should be aware of
	HELLO: 			1,	// receive information about a node that has joined, respond with subs that it needs to know about
	SUB_TRANSFER: 	2,	// receive list of subscriptions from nodes that matcher should know about
	SUB_REMOVE: 	3,	// remove subscription
	SUB_NOTIFY:		4,	// information about a subscription that anothe matcher thinks we should know about
	SUB_UPDATE:		5,
	PUB:			6,	// publication from a VAST client
	ID:				7,	// request a clientID from gateway matcher
	DISCONNECT:		8,	// disconnect a client from view
	MOVE:			9	// Move a matcher to a specified location
}

global.Matcher_string = [
	'MATCHER_NODE',
	'MATCHER_HELLO',
	'SUB_TRANSFER',
	'SUB_REMOVE',
	'SUB_NOTIFY',
	'SUB_UPDATE',
	'PUB',
	'ID',
	'DISCONNECT',
	'MOVE'
]

// enumation of VON message
global.VON_Message = {
    VON_BYE:         0, // VON's disconnect
    VON_HAIL:        1, // VON's hail, to check if a connected neighbor is still alive
    VON_QUERY:       2, // VON's query, to find an acceptor to a given point
    VON_JOIN:        3, // VON's join, to learn of initial neighbors
    VON_NODE:        4, // VON's notification of new nodes
    VON_HELLO:       5, // VON's hello, to allow a newly learned node to be mutually aware
    VON_HELLO_R:     6, // VON's hello response
    VON_EN:          7, // VON's enclosing neighbor inquiry (to see if my knowledge of EN is complete)
    VON_MOVE:        8, // VON's move, to notify AOI neighbors of new/current position
    VON_MOVE_F:    	 9, // VON's move, full notification on AOI
    VON_MOVE_B:    	10, // VON's move for boundary neighbors
    VON_MOVE_FB:   	11, // VON's move for boundary neighbors with full notification on AOI
    VON_POS:       	12, // VON's position update message
	VON_PING:	   	13, // VON's ping to determine latency to different clients
	VON_PONG:	   	14, // VON's response to a ping
	VON_SHIFT:		15	// VON's movement due to matcher load balancing
};

global.VON_Message_String = [
    'VON_BYE',
    'VON_HAIL',
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
    'VON_POS',
    'VON_PING',
    'VON_PONG',
	'VON_SHIFT'
];

global.VAST.priority = {
    HIGHEST:        0,
    HIGH:           1,
    NORMAL:         2,
    LOW:            3,
    LOWEST:         4
};

// TODO: combine into nicer-looking global
global.VAST.msgtype = {
    BYE:        		0,  // disconnect
    PUB:        		1,  // publish request
    SUB:        		2,  // subscribe request
	JOIN:				3,	// join request
	MATCHER_CANDIDATE:	4,	// possible candidate matcher
	MATCHER_INIT:		5,	// initialise matcher
	MATCHER_ALIVE: 		6,	// keepalive message from matcher to gateway
	MATCHER_WORLD_INFO: 7,	// learn world_id and origin matcher address
	NOTIFY_MATCHER: 	8,	// current matcher notifying client of new current matcher
	NOTIFY_CLOSEST:		9, 	// current matcher notifying client of closest alternative matcher
	LEAVE:				10, // departure of a client
	SUB_R:				11,	// to reply whether a node has successfully subscribed (VON node joined)
	SUB_TRANSFER:		12,	// transfer a subscription to a neighbor matcher
	SUB_UPDATE:			13,	// update of a subscription to neighboring matchers
	MOVE:				14,	// position update to normal nodes
	MOVE_F:				15,	// full update for an AOI region
	NEIGHBOR:			16,	// send back a list of known neighbors
	NEIGHBOR_REQUEST:	17,	// request full info for an unknown neighbor
	SEND:				18,	// send a particular message to certain targets
	ORIGIN_MESSAGE:		19,	// messsage to origin matcher
	MESSAGE:			20,	// deliver a message to a node
	SUB_NOTIFY:			21,	// client notifying a relay of its subscription
	STAT:				22,	// sending statistics for gateway to record
	SYNC_CLOCK:			23	// synchronize logical clock with gateway
};

global.VAST.msgstr = [
    'BYE',
    'PUB',
    'SUB',
	'JOIN',
	'MATCHER_CANDIDATE',
	'MATCHER_INIT',
	'MATCHER_ALIVE',
	'MATCHER_WORLD_INFO',
	'NOTIFY_MATCHER',
	'NOTIFY_CLOSEST',
	'LEAVE',
	'SUB_R',
	'SUB_TRANSFER',
	'SUB_UPDATE',
	'MOVE',
	'MOVE_F',
	'NEIGHBOR',
	'NEIGHBOR_REQUEST',
	'SEND',
	'ORIGIN_MESSAGE',
	'MESSAGE',
	'SUB_NOTIFY',
	'STAT',
	'SYNC_CLOCK'
];

global.VON          = {
    peer: require('./VON_peer')
};

// configurable settings
global.VAST.Settings = {
	port_gateway:	37700,
	IP_gateway:		'127.0.0.1'
};
