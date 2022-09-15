
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
// to be inherited by vast_pos
var point2d = point2d || require( "./voronoi/point2d.js" );
var segment = require("./voronoi/segment");

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
        return '(' + this.x + ', ' + this.y + ')';
    }
    
    // update info from existing object
    this.update = function(new_info) {
        this.x = new_info.x;
        this.y = new_info.y;
    }
    
    // convert from a generic javascript object
    this.parse = function (js_obj) {

        try {
            this.x = parseFloat(js_obj.x);
            this.y = parseFloat(js_obj.y);
        }
        catch (e) {
            console.log('pos parse error: ' + e);
        }
    }
}

// make l_pos inherent all properties of point2d
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
    this.radius = parseFloat(radius);

    this.coversPoint = function (pos) {
        // NOTE: current check allows nodes even at AOI boundary to be considered as covered
        return (this.center.distance(pos) <= this.radius);
    }

    this.intersectsArea = function (area){
        return (this.center.distance(area.center) <= (this.radius + area.radius));
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

// definition for a connectable IP/port pair (vast_addr)
var l_addr = exports.addr = function (host, port) {
    
    // set initial value or default
    this.host = host || 0;
    this.port = port || 0;       
  
    // turn object to string representation
    this.toString = function () {
        return this.host + ':' + this.port;
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
            
            //if (typeof js_obj.meta === 'object')
            //    this.meta = js_obj.meta;            
        }
        catch (e) {
            console.log('node parse error: ' + e.stack);
        }
    }
    
    // print out node info
    this.toString = function () {
        //return '[' + this.id + '] ' + this.endpt.toString() + ' ' + this.aoi.toString() + ' meta: ' + Object.keys(this.meta).length; 
        return '[' + this.id + ']: ' + this.endpt.toString() + ' ' + this.aoi.toString();
    }
}

// definition for a network packet (sent via VON)
var l_pack = exports.pack = function (type, msg, priority, sender) {
        
    // the message type
    this.type = type;
    
    // the message content
    this.msg = msg;
            
    // default priority is 1
    this.priority = (priority === undefined ? 1 : priority);
    
    // target is a list of node IDs
    this.targets = [];    
    
    // sender id
    this.src = sender || 0;    
}

// this pack is transported in msg of l_pack
// It is routed through VON until the accepting peer over targetPos is reached
// then is is passed to the matcher
var l_pointPacket = exports.pointPacket = function(type, msg, sender, sourcePos, targetPos){
    
    // The Matcher_Message type
    this.type = type;

    // The message content
    this.msg = msg;

    // sender id
    this.sender = sender || 0;

    // The source position
    this.sourcePos = sourcePos;

    // list of target positions (point publications)
    this.targetPos = targetPos;

    // each node the message has "hopped" along
    // no functional purpose, only used for debugging to see how a message is forwarded between VON peers
    this.chain = [];

    // The list of nodes a VON peer must check. It will only forward the message if this field is empty
    // or if it is the closest node to th target in the list
    this.checklist = [];
    
}

// this pack is transported in msg of l_pack
// It is routed through VON and sent to each node whose region overlaps 
// with the target AoI. Recipients are used to avoid redundant messaging
var l_areaPacket = exports.areaPacket = function(type, msg, sender, sourcePos, targetAoI){
    
    // The Matcher_Message type
    this.type = type;

    // The message content
    this.msg = msg;`    `

    // sender id
    this.sender = sender || 0;

    // The source position
    this.sourcePos = sourcePos;

    // target AoI)
    this.targetAoI = targetAoI;

    // list of IDs nodes that already received the message
    // the list is not exhaustive, but does contain all of the nodes needed for child selection
    // (this list differs between nodes)
    this.recipients = [];

    // each node the message has "hopped" along
    // no functional purpose, only used for debugging to see how a message is forwarded between VON peers
    this.chain = [];
}


// definition for a simple stat object (ratio)
var l_ratio = exports.ratio = function () {
     
    this.normal = 0;
    this.total = 0;
    
    this.ratio = function () {
        return normal / total;
    } 
}

var l_pub = exports.pub = function(matcherID, clientID, aoi, payload, channel){
    matcherID = matcherID || 0;
    clientID = clientID || 0;
    aoi = aoi || new l_area();
    channel = channel || '0';
    
    this.matcherID = matcherID;
    this.clientID = clientID;
    this.aoi = aoi;
    this.payload = payload;
    this.channel = channel;
    this.recipients = [];
    this.chain = [];

    this.parse = function(js_obj){
        this.matcherID = parseInt(js_obj.matcherID);
        this.clientID = js_obj.clientID;
        this.aoi.parse(js_obj.aoi);
        this.payload = js_obj.payload;
        this.channel = js_obj.channel;
        this.recipients = Object.values(js_obj.recipients);
        this.chain = Object.values(js_obj.chain);
    }
}




// definition for a subscription
// 'host_id':   to which host a matched publication should be sent
// 'id':        unique subscription id
// 'layer':     which layer the subscription belongs
// 'aoi':       the aoi of the subscription

var l_sub = exports.sub = function (hostID, hostPos, clientID, subID, channel, aoi) {

    hostID = hostID || 0;
    hostPos = hostPos || new l_pos();   // Position to send matching pubs to
    clientID = clientID || 0;
    subID = subID || 0;
    channel = channel || '0';
    aoi = aoi || new l_area();

    this.hostID = hostID;       
    this.hostPos = hostPos;
    this.clientID = clientID;
    this.subID = subID;             
    this.channel  = channel;      
    this.aoi = aoi;              
    this.recipients = []; 
    this.heartbeat = UTIL.getTimestamp();
    
    this.changeHost = function(hostID, hostPos){
        this.hostID = hostID;
        this.hostPos = hostPos;
    }

    // parse a json object
    this.parse = function (js_obj) {
        try {
            this.hostID = parseInt(js_obj.hostID);
            this.hostPos.parse(js_obj.hostPos);
            this.clientID = js_obj.clientID;
            this.subID = js_obj.subID;
            this.channel   = js_obj.channel;
            this.aoi.parse(js_obj.aoi);
            this.recipients = Object.values(js_obj.recipients);
            this.heartbeat = js_obj.heartbeat;      
        }
        catch (e) {
            console.log('sub parse error: ' + e);
        }
    }
    
    // print out node info
    this.toString = function () {
        return '[' + this.id + '] hostID: ' + hostID + ' layer: ' + this.layer + ' AOI: ' + this.aoi.toString();
    }
}

var l_clientInfo = exports.clientInfo = function (matcherID, clientID, pos) {

    this.matcherID = matcherID;
    this.clientID = clientID;
    this.pos = l_pos(pos.x, pos.y);

    // update info from existing record
    // NOTE: we only replace if data is available
    this.update = function (matcherID,matcherAddr, clientID, pos) {
       try{
        this.matcherID = matcherID;
        this.matcherAddr = l_addr.parse(this.matcherAddr)
        this.clientID = clientID;
        this.pos = l_pos(pos.x, pos.y); 
       }
       catch (e){
           console.log('client info update error' + e);
       }
    }

    // parse a json object onto a node object
    this.parse = function (js_obj) {
        try {
            this.matcherID = parseInt(js_obj.matcherID);
            this.id      = parse(js_obj.clientID);
            this.pos = l_pos.parse(js_obj.pos)         
        }
        catch (e) {
            console.log('clientInfo parse error: ' + e);
        }
    }
}

// definition for a region (based off of cell in rhill-voronoi)
// site: the Voronoi site object associated with the Voronoi cell.
// halfedges: an array of Voronoi.Halfedge objects, ordered counterclockwise,
//  defining the polygon for this Voronoi cell.
var l_region = exports.region = function (site, halfEdges, boundarySize, closeMe) {
    this.site = site || new l_pos();
    this.halfedges = halfEdges || [];
    this.boundaryEdges = [];
    this.boundarySize = boundarySize || 24;
    this.convertedEdges = [];
    this.closeMe = closeMe || false;

    this.update = function (new_region) {
        this.site.update(new_region.site);
        this.halfedges = new_region.halfedges;
        this.convertedEdges = [];
        this.closeMe = new_region.closeMe;
    };

    this.parse = function(js_obj){
        this.site.parse(js_obj.site);
        this.halfedges = Object.values(js_obj.halfedges);
        this.boundaryEdges = Object.values(js_obj.boundaryEdges);
        this.boundarySize = parseInt(js_obj.boundarySize);
        this.closeMe = js_obj.closeMe || false;
    }

    this.move = function(position) {
        this.site.update(position);
        this.halfedges = [];
        this.closeMe = false;
    }

    // initialise the site of a region that has already been created but not instantiated
    // NOTE: the reason this field is not simply called 'aoi' to be aligned with 'node' API is because 'aoi'
    // is significantly different in what it contains relative to 'site', and therefore cannot be named as such
    // (hence the need for this function)
    this.init = function (site) {
        this.site.update(site);
    }

    // converts the halfedges from the type given by the voronoi
    // to type 'segment' from VAST
    // also creates boundary region around the region for load balancing
    this.convertingEdges = function () {
        //console.log("Converting Edges");
        var edgeList = [];
        var boundaryPoints = [];
        var boundaryList = []
        var pt, pt2, pt3;
        var point, point2;

        for (var i=0; i < this.halfedges.length; i++) {
            //console.log(i);
            pt1 = this.halfedges[i].getStartpoint();
            pt2 = this.halfedges[i].getEndpoint();

            if ((i+1) == this.halfedges.length) {
                pt3 = this.halfedges[0].getEndpoint();
            } else {
                pt3 = this.halfedges[i+1].getEndpoint();
            }

            //console.log("Getting new boundary vertex with points: ");
            //console.log("pt1:");
            //console.log(pt1);
            //console.log("pt2: ");
            //console.log(pt2);
            //console.log("pt3:");
            //console.log(pt3);
            point = _getBoundaryVertex(pt1,pt2,pt3, this.boundarySize);

            boundaryPoints.push(point);

            // create line segment
            edgeList.push(new segment(new point2d(pt1.x,pt1.y), new point2d(pt2.x, pt2.y)));
        }

        //console.log("Boundary points");
        //console.log(boundaryPoints);
        for (var k = 0; k < boundaryPoints.length; k++) {
            point1 = boundaryPoints[k];

            if (k+1 != boundaryPoints.length) {
                point2 = boundaryPoints[k+1];
            } else {
                point2 = boundaryPoints[0];
            }
            //console.log("Point 1");
            //console.log(point1);
            //console.log("Point 2");
            //console.log(point2);
            boundaryList.push(new segment(new point2d(point1.x,point1.y), new point2d(point2.x, point2.y)));
        }

        this.boundaryEdges = boundaryList;

        this.convertedEdges = edgeList;

        return true;
    }

    this.intersects = function (center, radius) {
        if (this.convertedEdges.length === 0) {
            console.log("There are no lengths to check intersection against");
            return false;
        }

        if (typeof this.convertedEdges[0].intersects !== 'function') {
            this.convertedEdges = _convertEdges();
        }

        //LOG.debug("Converted edges");
        //LOG.debug(this.convertedEdges);

        // check each line for intersection and return true if there is one
        for (var i=0; i < this.convertedEdges.length; i++) {
            if (this.convertedEdges[i].intersects(center, radius))
                return true;
        }
        //LOG.debug("returning false");
        return false;
    }

    // check whether a point lies within a polygon
    // reference: http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html
    var _within = this.within = function(pos, region) {
        //LOG.debug("Starting within");
        var polygon = true;
        if (region == undefined) {
            polygon = false;
            region = this.boundaryEdges;
        }

        var verty = [];
        var vertx = [];
        var pt1;

        for (var i=0; i < region.length; i++) {
            pt1 = region[i].p1 === undefined ? region[i] : region[i].p1;

            // NOTE we only store one point, as the polygon should close itself
            verty.push(pt1.y);
            vertx.push(pt1.x);
        }

        var nvert = region.length;

        //LOG.debug(nvert);
        var i, j, c = 0;

        //LOG.debug("vertx");
        //LOG.debug(vertx);
        //LOG.debug("verty");
        //LOG.debug(verty);
        //LOG.debug("pos");
        //LOG.debug(pos);

        for (i = 0, j = nvert-1; i < nvert; j = i++) {
          if ( ((verty[i] > pos.y) != (verty[j] > pos.y)) &&
				 (pos.x < (vertx[j] - vertx[i]) * (pos.y - verty[i]) / (verty[j] - verty[i]) + vertx[i]) )
             c = !c;
        }

        return (c != 0);
    }

    // pt2 is the focal point
    var _getBoundaryVertex = this.getBoundaryVertex = function(pt1,pt2,pt3, boundarySize) {
        //console.log("Points")
        //console.log(pt1);
        //console.log(pt2);
        //console.log(pt3);
        var m1,m2,alpha,theta,dx,dy,xBar,yBar;
        dx = pt2.x-pt1.x;
        dy = pt2.y-pt1.y;

        if (dx != 0) { // line 1 vertical
            //console.log("case 1");
            m1 = dy/dx;
            //console.log("m1: " + m1);

            dx = pt3.x-pt2.x;
            dy = pt3.y-pt2.y;

            if (dx != 0) { // line 2 vertical
            //console.log("case 2");
                m2 = dy/dx;
                ///console.log("m2: " + m2);

                if (m2*m1 != -1) {  // perpendicular lines
            //console.log("case 3");
                    alpha = ((pt2.y>pt1.y && m1 > 0) || (m2<0 && m1==0)) ? Math.PI - Math.atan(Math.abs((m2-m1)/(1+m2*m1))) : Math.atan(Math.abs((m2-m1)/(1+m2*m1)));

                    if (m1 > 0 && m2 > 0) {
                        theta = -alpha/2;
                    } else if (m1 < 0 && m2 > 0) {
                        theta = Math.PI + Math.atan(m1) + alpha/2;
                    } else if (m1 > 0 && m2 < 0) {
                        theta = -alpha/2 + Math.atan(m2);
                    } else if (m1 < 0 && m2 < 0){
                        theta = alpha/2-Math.atan(m1);
                    } else if ((m2 == 0 && m1 > 0) || (m1 < 0 && m2 == 0)) {
                        theta = -alpha/2;
                    } else {
                        theta = alpha/2;
                    }
                } else {
            //console.log("case 4");
                    alpha = Math.PI/2;
                    theta = m1 > 0  ? Math.atan(m2)-Math.atan(m1) : Math.atan(Math.abs(m2))-Math.atan(Math.abs(m1));
                }
            } else {
            //console.log("case 5");
                alpha = m1 < 0 ? Math.PI/2-Math.atan(m1) : m1 > 0 ? Math.PI/2- (Math.atan(m1)) : Math.PI/2;
                theta = m1 <= 0 ? alpha/2 - Math.atan(Math.abs(m1)) : alpha/2 + Math.atan(m1);
            }
        } else {
            //console.log("case 6");
            dx = pt3.x-pt2.x;
            dy = pt3.y-pt2.y;

            //NOTE: dx will never be negative here because then the lines would be parallel,
            // which is guaranteed not to happen for a convex polygon
            m2 = dy/dx;
            //console.log("m2: " + m2);

            alpha = Math.atan(m2)-Math.PI/2;

            if (pt3.x-pt1.x < 0) {
                alpha += Math.PI;
                theta = Math.PI/2 + alpha/2;
                theta += Math.PI;
            } else {
                alpha -= Math.PI;
                theta = Math.PI/2 + alpha/2;
            }
        }

        //console.log("Alpha: " + (alpha*180/Math.PI));
        //console.log("Theta: " + (theta*180/Math.PI));

        xBar = pt2.x + boundarySize*Math.cos(theta);
        yBar = pt2.y + boundarySize*Math.sin(theta);

        var pt = {
            x: xBar,
            y: yBar
        }


        if (_within(pt,[pt1,pt2,pt3])) {
            theta += Math.PI;
            //console.log("New theta: " + (theta*180/Math.PI));
            xBar = pt2.x + boundarySize*Math.cos(theta);
            yBar = pt2.y + boundarySize*Math.sin(theta);

            pt = {
                x: xBar,
                y: yBar
            }
        }



        return pt
    }

    this.toString = function () {
        return "site: " + this.site.toString() + " halfedges: " + this.halfedges + " closeMe: " + this.closeMe;
    }
}
