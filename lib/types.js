
/*
 * VAST, a scalable peer-to-peer network for virtual environments
 * Copyright (C) 2005-2011 Shun-Yun Hu (syhu@ieee.org)
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 */

/*
    Basic data structures used by the VAST library

    supported structures

    vast_pos        position = {x, y}
    vast_area       area = {pos, radius}
    vast_addr       address = {host, port}
    vast_endpt      endpoint = {host_id, lastAccessed, addr}
    vast_node       node = {id, endpt, aoi, time}
*/

// to be inherited by vast_pos
var point2d = point2d || require( "./voronoi/point2d.js" );
var segment = require("./voronoi/segment");
var voronoi = require('./rhill-voronoi-core-min');

// common data structures

// definition of a node position
var l_pos = exports.pos = function (x, y) {

    // set default
    if (x === undefined)
        x = 0;
    if (y === undefined)
        y = 0;

    this.x = x;
    this.y = y;

    this.equals = function (other_pos) {
        return (this.x === other_pos.x && this.y === other_pos.y);
    }

    this.toString = function () {
        return '(' + this.x + ',' + this.y + ')';
    }

    // update info from existing object
    this.update = function(new_info) {
        this.x = new_info.x;
        this.y = new_info.y;

        if (new_info.hasOwnProperty('voronoiId')) {
            this.voronoiId = new_info.voronoiId;
        }
    }

    // convert from a generic javascript object
    this.parse = function (js_obj) {

        try {
            this.x = js_obj.x;
            this.y = js_obj.y;
        }
        catch (e) {
            console.log('pos parse error: ' + e);
            return false;
        }
    }
}

// make l_pos inheret all properties of point2d
l_pos.prototype = new point2d();

// definition for an area
// 'center': a vast_pos
var l_area = exports.area = function (center, radius) {

    // set default
    if (center === undefined)
        center = new l_pos(0, 0);
    if (radius === undefined)
        radius = 0;

    // store center & radius, with potential error checking
    this.center = new l_pos(0, 0);
    this.center.parse(center);
    this.radius = radius;

    this.covers = function (pos) {

        // NOTE: current check allows nodes even at AOI boundary to be considered as covered
        return (this.center.distance(pos.center) <= (this.radius + pos.radius));
    }

    this.equals = function (other_area) {
        return (this.center.equals(other_area.center) && this.radius === other_area.radius);
    }

    this.toString = function () {
        return 'area: ' + this.center.toString() + ' radius: ' + this.radius;
    }

    // update info from existing object
    this.update = function(new_info) {
        this.center.update(new_info.center);

        // only update if radius is valid
        if (new_info.hasOwnProperty('radius') && new_info.radius >= 0)
            this.radius = new_info.radius;
    }

    // convert from a generic javascript object
    this.parse = function (js_obj) {
        try {
            this.center = new l_pos();
            this.center.parse(js_obj.center);

            // we make decoding radius optional
            // NOTE: use negative radius, so it won't be updated when performing a 'update'
            if (js_obj.hasOwnProperty('radius'))
                this.radius = js_obj.radius;
            else
                this.radius = -1;
        }
        catch (e) {
            console.log('area parse error: ' + e);
        }
    }
}

// definition for a region (based off of cell in rhill-voronoi)
// site: the Voronoi site object associated with the Voronoi cell.
// halfedges: an array of Voronoi.Halfedge objects, ordered counterclockwise,
//  defining the polygon for this Voronoi cell.
var l_region = exports.region = function (site, halfEdges, closeMe) {
    this.site = site || new l_pos();
    this.halfedges = halfEdges || [];
    this.closeMe = closeMe || false;

    this.update = function (new_region) {
        this.site.update(new_region.site);
        this.halfedges = new_region.halfedges;
        this.closeMe = new_region.closeMe;
    };

    this.convertEdges = function () {
        var edgeList = [];
        var pt;
        var pt2;
        for (var i=0; i < this.halfedges.length-1; i++) {
            // if this is the first edge being created, get the start point of the
            // first halfedge, else just get the end of the first edge
            pt = i==0 ? this.halfedges[i].getStartpoint() : pt2;
            pt2 = this.halfedges[i+1].getStartpoint();

            // create line segment
            edgeList.push(new segment(new point2d(pt.x,pt.y), new point2d(pt2.x, pt2.y)))
        }

        // closing off the voronoi section with the last line that connects to the start of the first line
        edgeList[edgeList.length] = new segment(new point2d(pt2.x, pt2.y),edgeList[0].p1);

        this.halfedges = edgeList;
    };

    this.intersects = function (center, radius) {
        // check each line for intersection and return true if there is one
        for (var i=0; i < this.halfedges.length; i++) {
            if (this.halfedges[i].intersects(center, radius))
                return true;
        }
        return false;
    };

    this.toString = function () {
        return "site: " + this.site.toString() + " halfedges: " + this.halfedges + " closeMe: " + this.closeMe;
    }
}

// definition for a connectable IP/port pair (vast_addr)
var l_addr = exports.addr = function (host, port) {

    // set initial value or default
    this.host = host || 0;
    this.port = port || 0;

    // turn object to string representation
    this.toString = function () {
        return this.host + ':' + this.port;
    }

    this.equals = function (addr) {
        return (this.host === addr.host && this.port === addr.port);
    }

    // check if address is unassigned
    this.isEmpty = function () {
        return (this.host === 0 || this.port === 0);
    }

    // update info from existing object
    this.update = function(new_info) {
        if (new_info.host !== 0)
            this.host = new_info.host;
        if (new_info.port !== 0)
            this.port = new_info.port;
    }

    // convert from a generic javascript object
    this.parse = function (js_obj) {

        try {
            //console.log('js obj host: ' + js_obj.host + ' port: ' + js_obj.port);
            if (js_obj.hasOwnProperty('host'))
                this.host = js_obj.host;

            // port must be provided
            this.port = js_obj.port;
        }
        catch (e) {
            console.log('addr parse error: ' + e);
        }
    }
}

// definition for a host address
var l_endpt = exports.endpt = function (host, port) {

    this.host_id = 0;
    this.lastAccessed = 0;
    this.addr = new l_addr(host, port);

    this.toString = function () {
        return 'host [' + this.host_id + '] ' + this.addr.toString();
    }

    // update info from existing object
    this.update = function (new_info) {
        if (new_info.host_id !== 0)
            this.host_id = new_info.host_id;
        if (new_info.lastAccessed !== 0)
            this.lastAccessed = new_info.lastAccessed;
        this.addr.update(new_info.addr);
    }

    // convert from a generic javascript object
    this.parse = function (js_obj) {

        try {
            this.host_id = js_obj.host_id;
            this.lastAccessed = js_obj.lastAccessed;
            this.addr = new l_addr();
            this.addr.parse(js_obj.addr);
        }
        catch (e) {
            console.log('endpt parse error: ' + e);
        }
    }
}

// definition for a node
// 'aoi': a vast_area object
// 'endpt': a vast_endpt object
var l_node = exports.node = function (id, endpt, aoi, time) {

    // set initial values or default
    this.id     = id    || 0;               // a node's unique ID
    this.endpt  = endpt || new l_endpt();   // a node's contact endpoint (host_id & address)
    this.aoi    = aoi   || new l_area();    // a node's AOI (center + radius)
    this.time   = time  || 0;               // a node's last updated time (used to determine whether it contains newer info)
    //this.meta = {};               // a node's meta-data, default to empty

    // update node info from another node
    // NOTE: this is powerful as it replaces almost everything (perhaps ID shouldn't be replaced?)
    // NOTE: we only replace if data is available
    this.update = function (new_info) {

        if (new_info.id !== 0)
            this.id     = new_info.id;

        //if (typeof new_info.meta === 'object' && Object.keys(new_info.meta).length > 0)
        //    this.meta = new_info.meta;

        this.endpt.update(new_info.endpt);
        this.aoi.update(new_info.aoi);

        if (new_info.time !== 0)
            this.time   = new_info.time;
    }

    // parse a json object onto a node object
    this.parse = function (js_obj) {
        try {
            this.id      = parseInt(js_obj.id);

            // we make decoding end point optional
            if (js_obj.hasOwnProperty('endpt'))
                this.endpt.parse(js_obj.endpt);

            this.aoi     = new l_area();
            this.aoi.parse(js_obj.aoi);
            this.time    = js_obj.time;

            return true;

            //if (typeof js_obj.meta === 'object')
            //    this.meta = js_obj.meta;
        }
        catch (e) {
            console.log(js_obj);
            console.log('node parse error: ' + e.stack);
            return false;
        }
    }

    // print out node info
    this.toString = function () {
        //return '[' + this.id + '] ' + this.endpt.toString() + ' ' + this.aoi.toString() + ' meta: ' + Object.keys(this.meta).length;
        return '[' + this.id + ']: ' + this.endpt.toString() + ' ' + this.aoi.toString();
    }
}

// definition for a matcher's info
// state:       the state of the matcher
// world_id:    world that the matcher belongs to
// addr:        address for the matcher
// time:        last update of the info
var l_matcher = exports.match = function (id, endpt, time, region) {
    this.id - id || 0;
    this.endpt = endpt || new l_endpt();
    this.region = region || new l_region();
    // convert site type to pos for the auxilliary functions
    this.region.site = new l_pos(this.region.site.x, this.region.site.y);
    this.time = time || 0;

    // TODO: put in the filler functions
    this.update = function (new_info) {
        this.id = new_info.id;
        this.endpt.update(new_info.endpt);
        this.region.update(new_info.region);
        this.time = new_info.time;
    }
}

// data structure to record actions that happen to a client
// type: the type of action that happens
// sender: the ID of the client that initiated the action
// targets: the IDs of clients that the action affects
var l_action = exports.action = function (type, name, sender,targets, msg, direction) {
    this.type = type;
    this.name = name;
    this.sender = sender;
    this.targets = targets;
    this.msg = msg;
    this.direction = direction;

    this.parse = function (js_obj) {
        try {
            this.type = js_obj.type;
            this.name = js_obj.name;
            this.sender = js_obj.sender;
            this.targets = js_obj.targets;
            this.msg = js_obj.msg;
        } catch (e) {
            console.log('action parse error: '+e.stack);
        }
    }
}

// definition for a network packet
// type:        number  message type
// msg:         string  actual message
// priority:    number  sending priority
// sender:      string  sender id
var l_pack = exports.pack = function (type, msg, priority, layer, sender) {

    // the message type
    this.type = type;

    // the message content
    this.msg = msg;

    // default priority is 1
    this.priority = (priority === undefined ? 1 : priority);

    // target is a list of node IDs
    this.targets = [];

    // the layer of the pack
    this.layer = layer;

    // sender id
    this.src = sender || 0;

    // packet sent time
    this.sendTime = 0;

    // packet received time
    this.receiveTime = 0;

    // time taken for packet to be passed to handler
    this.forwardTime = 0;

    // TODO: add a time for how long it was delayed for debug if debug is active

    // time taken to process packet
    this.processTime = 0;

    // packet latency
    this.latency = 0;

    this.ping = 0;

    // bandwidth of client (if 0 then following packets will have bandwidth)
    this.bandwidth = 0;
}


// definition for a simple stat object (ratio)
var l_ratio = exports.ratio = function () {

    this.normal = 0;
    this.total = 0;

    this.ratio = function () {
        return normal / total;
    }
}

// definition for a subscription
// 'host_id':   to which host a matched publication should be sent
// 'id':        unique subscription id
// 'layer':     which layer the subscription belongs
// 'aoi':       the aoi of the subscription
var l_sub = exports.sub = function (host_id, id, channel, aoi, type, username, time) {

    // set default
    host_id = host_id || 0;
    id      = id || 0;
    channel   = channel || "";
    aoi     = aoi || new l_area();
    time    = time || 0;
    type    = type || "server";
    username = username || "unknown";

    this.host_id    = host_id;                                      // 'number' HostID of the subscriber
    this.id         = id;                                           // 'number' subscriber/client ID
    this.channel      = channel;                                    // 'string' layer number for the subscription
    this.subID     = this.host_id + "-" + this.id + "-" + channel   // 'string' subscriptionID (different subscriptions may have same hostID)
    this.aoi        = aoi;                                          // 'area'   aoi of the subscription (including a center position)
    this.recipients = []                                            // 'array'  list of ids that have this sub (full list on host_id only)
    this.time = time;
    this.type = type;
    this.username = username;
    //this.relay = relay;                                           // 'endpt'  the address of the relay of the subscriber (to receive messages)

    // update info from existing record
    // NOTE: we only replace if data is available
    this.update = function (info) {

        this.host_id = (info.host_id !== 0  ? info.host_id  : this.host_id);
        this.id      = (info.id !== 0       ? info.id       : this.id);
        this.channel   = (info.channel !== ""    ? info.channel    : this.channel);
        this.subID   = this.host_id + "-" + this.id + "-" + this.channel;
        this.aoi.update(info.aoi);
        this.time    = (info.time !== 0 ? info.time         : this.time);
        this.type = (info.type !== "" ? info.type : this.type);
        this.username = (info.username !== "" ? info.username : this.username);
    }

    // parse a json object onto a sub object
    this.parse = function (js_obj) {
        try {
            this.host_id = parseInt(js_obj.host_id);
            this.id      = parseInt(js_obj.id);
            this.subID   = js_obj.subID;
            this.channel   = js_obj.channel;
            this.aoi.parse(js_obj.aoi);
            this.time    = parseInt(js_obj.time);
            this.type = js_obj.type;
            this.username = js_obj.username;
        }
        catch (e) {
            console.log('sub parse error: ' + e);
        }
    }

    // print out node info
    this.toString = function () {
        return '[' + this.subID + '] host_id: ' + this.host_id + ' clientID: ' + this.id + ' type: ' + this.type + ' username: ' +  this.username + 'layer: ' + this.channel + ' AOI: ' + this.aoi.toString() + ' time: ' + this.time;
    }
}

// definition for storing a client's state
var l_state = exports.clientState = function (id,time, position, neighbours, latMax, latMin, latAve, bandwidth, latencies) {
        this.id = id;

        // the time the state was captured
        this.time = time;

        // the current position of the client
        this.position = position;

        // the neighbours of the client
        this.neighbours = neighbours;

        // maximum latency
        this.latMax = latMax;

        // minimum latency
        this.latMin = latMin;

        // average latency
        this.latAve = latAve;

        // bandwidth at time of recording
        this.bandwidth = bandwidth;

        // collection of latencies for different message types
        this.latencies = latencies;
}
