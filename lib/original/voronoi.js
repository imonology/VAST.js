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
    Voronoi.js  - A Voronoi-calculating class
*/    

// var Hash = require( "./hash.js" );
var SF = require("./sf_voronoi.js");

function Voronoi() {

    // insert a new site, the first inserted is myself
    this.insert = function(id, coord) {
    }
    
    // remove a site
    this.remove = function(id) {
    }
        
    // modify the coordinates of a site
    this.update = function(id, coord) {
         
    }
        
    // get the point of a site
    this.get = function(id) {
    }
        
    // check if a point lies inside a particular region
    this.contains = function(id, coord) {
    }
        
    // check if the node is a boundary neighbor
    this.is_boundary = function(id, center, radius) {
    }
    
    // check if the node is an enclosing neighbor
    this.is_enclosing = function(id, center_id) {
    
        // set default value
        center_id = (typeof center_id == 'undefined') ? (-1) : center_id;
    }
    
    // get a list of enclosing neighbors
    //virtual std::vector<id_t> & get_en (id_t id, int level = 1) = 0;
    this.get_en = function(id, level) {
    
        // set default value
        level = (typeof center_id == 'undefined') ? 1 : level;
    
    }
    
    // check if a circle overlaps with a particular region
    //virtual bool overlaps (id_t id, const Position &center, length_t radius, bool accurate_mode = false) = 0;
    this.overlaps = function(id, center, radius, accurate_mode) {
    
        // set default value
        accurate_mode = (typeof center_id == 'undefined') ? false : accurate_mode;
    
    }
    
    // remove all sites in the diagram
    this.clear = function() {
    }

    //
    // non Voronoi-specific methods
    //
    
    // returns the closest node to a point
    //virtual id_t closest_to (const Position &pt) = 0;
    this.closest_to = function(point) {
    }
    
    //virtual std::vector<line2d> &getedges() = 0;
    this.getedges() = function() {
    }

    // obtain the bounding box for this Voronoi object
    // returns true if the box exists, false if one of the dimensions is empty
    //virtual bool get_bounding_box (point2d& min, point2d& max) = 0;        
    this.get_bounding_box = function(min, max) {
    }

    // get the number of sites currently maintained
    this.size = function() {
    }

    // get edges of sites with ID = id
    //virtual std::set<int> & get_site_edges (int id) = 0;
    this.get_site_edges = function(id) {
    }
          
} // end Voronoi function
    
module.exports = Voronoi;
