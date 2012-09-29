
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
var point2d = point2d || require( "./typedef/point2d.js" );

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
            this.x = js_obj.x;
            this.y = js_obj.y;
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
    this.radius = radius;

    this.covers = function (pos) {
        // NOTE: current check allows nodes even at AOI boundary to be considered as covered
        return (this.center.distance(pos) <= this.radius);
    }
    
    this.equals = function (other_area) {
        return (this.center.equals(other_area.center) && this.radius === other_area.radius);
    }
     
    this.toString = function () {
        return 'Area: ' + this.center.toString() + ' radius: ' + this.radius;
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

    // set default
    if (host === undefined)
        host = 0;
    if (port === undefined)
        port = 0;

    this.host = host;
    this.port = port;       
  
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

        //console.log('addr parse called, obj: ' + js_obj);
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
        return 'Endpoint: host [' + this.host_id + '] ' + this.addr.toString(); 
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

    // set default
    if (endpt === undefined)
        endpt = new l_endpt();
    if (aoi === undefined)
        aoi = new l_area();
    if (time === undefined)
        time = 0;
        
    this.id = id;               // a node's unique ID
    this.endpt = endpt;         // a node's contact endpoint (host_id & address)
    this.aoi  = aoi;            // a node's AOI (center + radius)
    this.time = time;           // a node's last updated time (used to determine whether it contains newer info)
        
    // update node info from another node
    // NOTE: this is powerful as it replaces almost everything (perhaps ID shouldn't be replaced?)
    // NOTE: we only replace if data is available
    this.update = function (new_info) {
        
        if (new_info.id !== 0)
            this.id     = new_info.id;
            
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
        }
        catch (e) {
            console.log('node parse error: ' + e);
        }
    }
    
    // print out node info
    this.toString = function () {
        return '[' + this.id + '] ' + this.endpt.toString() + ' ' + this.aoi.toString(); 
    }
}


// definition for a node
// 'area': a vast_area object
// 'addr': a vast_addr object
var l_pack = exports.pack = function (type, msg, priority) {
    
    // the message type
    this.type = type;
    
    // the message content
    this.msg = msg;
        
    // group is used to determine who will handle this message (still needed?)
    this.group = 0;
    
    // default priority is 1
    this.priority = (priority === undefined ? 1 : priority);
    
    // target is a list of node IDs
    this.targets = [];    
}


// definition for a simple stat object (ratio)
var l_ratio = exports.ratio = function () {
     
    this.normal = 0;
    this.total = 0;
    
    this.ratio = function () {
        return normal / total;
    } 
}