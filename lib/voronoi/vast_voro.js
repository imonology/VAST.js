
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
    A Generic Voronoi wrapper for computing Voronoi Diagrams for VAST

    supported functions:

    // the following insert/update/remove sites to the Voronoi
    insert(id, pos)             inserting a new site with a position and id
    remove(id)                  removing an existing site with an id
    update(id, pos)             updating the position for a site given an id
    get(id)                     get stored position for a given id
    clear()                     clear all stored site positions

    // the following returns true/false
    contains(id, pos)           check if a given position is within the region for a site
    is_boundary(id, pos, rad)   check if a site is the boundary neighbor for a position with given radius
    is_enclosing(id, cent_id)   check if a site is the enclosing neighbor for another site given the 'center id'
    overlaps(id, pos, rad, mode) check if a site's region overlaps with a given position & radius
	closest_to(pos)				find the site closest to a particular position

    // the following returns an array
    get_en(id, level)		    get an array of id's of the enclosing neighbors for a given site (under a certain level)

    // misc
    to_string()                 get a string represntations of all currently stored sites

    history:
        2012-06-09              initial version (extract code from sf_voronoi.js)
        2012-06-25              first working version (porting done)
*/

// if already defined (as included in website) then don't define
var point2d = point2d || require( "./point2d.js" );
var segment = segment || require( "./segment.js" );
//var Voronoi = Voronoi || require( "./sf_voronoi.js" );
var Voronoi = Voronoi || require( "./rhill-voronoi-core.js" );

var LOG = (typeof logger !== 'undefined' ? new logger() : (typeof global.LOG !== 'undefined' ? global.LOG : undefined));

// vast_voro is used without including global, need to create one
if (LOG === undefined) {
    var logger = require('../common/logger');
    LOG = new logger();
}

// this constant is to determine how far will two different points be considered the same
// potential BUG: is it small enough?
var EQUAL_DISTANCE = 1e-9;

// standard bbox size
var STANDARD_SIZE = 1000;

function VAST_Voronoi(bbox) {

    //
    // private variables
    //

    // internal data to compute Voronoi diagram
    var voro = new Voronoi();

    // storage of all the Voronoi sites given externally (a map from id to position)
    var sites = {};

    // mapping from site id to index in sorted site list
    var id2idx = {};

    // whether we need to re-calculate the edges (introduced by Peter Liao)
    var invalidated = false;

    // result of the Voronoi computation
    var result = undefined;

    // store bounding box or provide default (for RHVoronoi)
    // NOTE: boundaries are important, as it'll affect the range of calculation for the Voronoi
    //       if input site positions are outside boundary, Voronoi won't be computed correctly
    // NOTE: 'xl' must be less than 'xr', and 'yt' must be less than 'yb',
    //       or else enclosing computation will be incorrect
    if (bbox === undefined)
        //bbox = {xl:-STANDARD_SIZE, xr:STANDARD_SIZE, yt:-STANDARD_SIZE, yb:STANDARD_SIZE};
        bbox = {xl:0, xr:STANDARD_SIZE, yt:0, yb:STANDARD_SIZE};

    //
    // public methods
    //

    // insert a new site, the first inserted is myself
    var l_insert = this.insert = function (id, pos) {

        //LOG.debug('insert to voro id: ' + id + ' ' + typeof id);

        // avoid duplicate insert
        if (sites.hasOwnProperty(id) === true) {
            LOG.error('duplicate voro id exists: ' + id);
            return false;
        }

        if (pos == undefined) {
            LOG.error('undefined node sent through');
            return false;
        }

        //LOG.debug(bbox);
        //LOG.debug(pos);

        // perform boundary check and reject those outside of boundary
        if ((pos.x >= bbox.xl && pos.x <= bbox.xr && pos.y >= bbox.yt && pos.y <= bbox.yb) === false) {
            LOG.error('position of site outside of bounding box');
            return false;
        }

        if (_isOverlapped(pos, id)) {
            pos = _adjustPos(pos,id);
        }

        invalidated = true;
        sites[id] = pos;

        //LOG.debug('site [' + id + '] added');

        return true;
    }

    // remove a site
    var l_remove = this.remove = function (id) {

        if (sites.hasOwnProperty(id) === false)
            return false;

        invalidated = true;

        delete sites[id];

        return true;
    }

    // modify the coordinates of a site
    this.update = function (id, pos) {

        if (sites.hasOwnProperty(id) == true) {
            if (_isOverlapped(pos, id)) {
                pos = _adjustPos(pos,id);
            }
            invalidated = true;
            sites[id] = pos;
        }
        // if id doesn't exist, we allow a new insertion
        else
            return l_insert(id, pos);

        return true;
    }

    // get the point of a site
    this.get = function (id) {

        if (sites.hasOwnProperty(id) == false)
            return null;

        return sites[id];
    }

    // get a cell from the voronoi diagram
    this.getRegion = function (id) {
        recompute();
        return result.cells[id2idx[id]];
    }

    // remove all sites in the diagram
    //void clear ();
    this.clear = function () {
        invalidated = true;
        sites = {};
        //voro.clear();
    }

    // check if a point lies inside a particular region
    //bool contains (id_t id, const Position &coord);
    this.contains = function (id, pos) {

        // we need id -> index mapping to find the relevant site entry in mSites
        var idx = check_id (id);
        if (idx == -1)
            return false;

        // NOTE insideRegion takes 'index' (in mSites) as parameter
        return insideRegion(idx, pos);
    }

    // check if the node is a boundary neighbor
    this.is_boundary = function (id, pos, radius) {

        var idx = check_id (id);
        if (idx == -1)
            return false;

        var bound_list = get_bound(id, radius, pos.x, pos.y);

        // go through each boundary neighbour and check whether it matches the given ID
        for (var i=0; i< bound_list.length; i++) {
            if (bound_list[i] == id) {
                return true;
            }
        }

        return false;
    }

    // check if the node 'id' is an enclosing neighbor of 'center_node_id'
    this.is_enclosing = function (id, center_node_id) {

        // get index for the input node id
        var idx = check_id(center_node_id);
        if (idx == -1)
            return false;

        var en_list = getNeighborSet(idx);

        // go through each enclosing neighbor return and check for match
        for (var i=0; i < en_list.length; i++) {
            //LOG.debug('id: ' + id + ' en ' + (i+1) + ': ' + en_list[i]);
            if (en_list[i] == id)
                return true;
        }

        return false;

        /* less code but more work version
        var list = this.get_en(center_node_id);
        for (var i=0; i < list.length; i++)
            if (list[i] === id)
                return true;
        return false;
        */
    }

    //get a list of boundary neighbours
    var get_bound = this.get_bound = function (id, radius, x,y) {
        //convert id into site idx
        var idx = check_id(id);
        if (idx == -1)
            return false;

        //clear record of the site id of boundary neighbours
        var bound_list = [];

        // create a copy of the sites object
        //var temp_sites = JSON.parse(JSON.stringify(sites));

        var site_list = [];         //storage of sites before removal

        var AOI_list = {};          //temp list of AOI neighbours

        //var i;

        for (var key in sites){
            if (!withinAOI(sites[key],radius, x,y)){

                site_list[key] = sites[key];
                l_remove(sites[key].id);
            } else {
                AOI_list[sites[key].id] = sites[key].voronoiId;
            }
        }

        /*
        for (i=1; i <= result.cells.length; i++){
            LOG.warn(i);
            LOG.warn(typeof i);
            LOG.warn(sites[1]);
            LOG.warn(sites["1"]);
            LOG.warn(sites[i]);
            LOG.warn(sites[i].x);
            //look through sites and decide whether AOI neighbours or not
            if (!withinAOI(sites[i],idx,radius, x,y)){

                site_list[i] = sites[i];
                l_remove(sites[i].id);
            } else {
                AOI_list[sites[i].id] = sites[i].voronoiId;
            }
        }
        */

        recompute();

        //look at AOI_list and decide which are fully enclosed by AOI and remove them. Place the rest in bound_list
        var j,k;

        for (j=0; j < result.cells.length; j++) {
            var voronoi_section = result.cells[j];
            for (k=0; k < voronoi_section.halfedges.length; k++){

                //check to see if a vertex is out of the AOI
                if (!withinAOI(voronoi_section.halfedges[k].edge.va,radius, x,y) || !withinAOI(voronoi_section.halfedges[k].edge.vb,radius, x,y)) {
                    bound_list.push(result.cells[j].site.id);
                    break;
                }
            }
        }

        for (var id in site_list) {
            l_insert (id, site_list[id]);
        }
        recompute();


        return bound_list;
    }

    // get a list of enclosing neighbors
    //vector<id_t> &get_en (id_t id, int level = 1);
    // a more efficient version (avoids Voronoi rebuilt unless sites are removed by necessity)
    var get_en = this.get_en = function (id, lvl) {

        //LOG.debug('get_en: for id: ' + id);

        if (typeof id === 'undefined')
            return undefined;

        // level is default to 1
        var level = (typeof lvl === 'undefined' ? 1 : lvl);

        // clear record of the site id of enclosing neighbors
        var en_list = [];

        var id_list = undefined; // temp list of enclosing neighbor IDs
        var site_list = {};      // temp list to store sites removed

        var remove_count = 0;   // int
        var j;                  // int

        while (level > 0) {

            // remove enclosing neighbors already recorded, if any
            for (j = remove_count; j < en_list.length; j++) {

                // backup site info to be restored later
                var id = en_list[j];
                site_list[id] = sites[id];

                // remove it
                l_remove(id);
                remove_count++;
            }

            recompute();

            // get enclosing neighbor id for the input node id
            // NOTE: get_idx() should be called after recompute() otherwise it'll be invalid
            // NOTE: the id_list returned contains id (not index)
            id_list = getNeighborSet(get_idx(id));

            // get a list of current enclosing neighbors to be stored away
            // store enclosing neighbor IDs (to be returned to caller)
            for (var i = 0; i < id_list.length; i++)
                en_list.push(id_list[i]);

            level--;
        }

        // add back the removed neighbors (when queries beyond 1st-level neighbors are made)
        for (var id in site_list) {
            //LOG.debug('get_en put back ' + id + ' to list');
            l_insert (id, site_list[id]);
        }

        //LOG.debug('get_en found ' + en_list.length + ' neighbors');
        return en_list;
    }

    // get a set of AOI neighbours
    var get_AoI = this.get_AoI = function (id, radius) {
        var neighbour_list = [];
        for (var key in sites)
            if (withinAOI(sites[id],radius, sites[key].x,sites[key].y))
                neighbour_list.push(key);

        return neighbour_list;
    }

    // get a set of AoI and enclosing neighbours
    this.get_neighbour = function (id,radius) {
        if (!sites.hasOwnProperty(id))
            return [];

        // get a list of enclosing neighbours
        var neighbour_list = get_en(id);

        // get a list of AoI neighbours and add it to the list of enclosing neighbours
        for (var key in sites) {
            if (!neighbour_list.includes(key)) {
                if (withinAOI(sites[id],radius, sites[key].x,sites[key].y))
                    neighbour_list.push(key);
            }
        }

        return neighbour_list;
    }

    // check if a circle overlaps with a particular region (given its id)
    // NOTE: that in non-accurate mode it's quicker but also more strict for overlap to occur
    // NOTE: in accurate mode, overlaps always returns 'false' if there's only one site
    this.overlaps = function (id, pos, radius, mode) {

        var idx = check_id(id);
        if (idx == -1)
            return false;

        // default accurate mode to false
        var accurate_mode = (typeof mode === 'undefined' ? false : mode);

        var r = false;
        if (accurate_mode === true) {
            // version 1: accurate but slower
            //LOG.debug('idx: ' + idx + ' pos: ' + pos.toString());
            r = collides(idx, pos, (radius+5));
        }
        else {
            // version 2: simply check if the center of region is within AOI
            if (sites.hasOwnProperty(id)) {
                var site_pos = sites[id];
                r = (site_pos.distance(pos) <= radius);
            } else {
                return false;
            }
        }

        //LOG.debug('if [' + id + '] overlaps with ' + pos.toString() + ' (radius: ' + radius + '): ' + r + ' accurate: ' + accurate_mode);
        return r;
    }

    // returns the closest site id to a point

    // Added 20080724 by Csc
    // an extra case to ensure that a unique closest point is returned by checking their IDs
    // (i.e. when two or more sites are both closest to the point, smaller ID is returned)
    this.closest_to = function (pos) {

        // make sure position has a distance function
        if (typeof pos.distance !== 'function')
            pos = new point2d(pos.x, pos.y);

        // error checking
		if (Object.keys(sites).length === 0)
			return null;

        // id for the closest site, get first
        var closest;        // id_t
        var min;            // double
        var d;              // double

        // use the first record in sites as the starting point
        for (var key in sites) {

            closest = key;
            min = pos.distance(sites[key]);
            break;
        }

        var id;     // id_t
        var p;      // position


        // go through each site's position and find the closest to point
        for (var key in sites) {


            //LOG.debug('key: ' + key + ' type: ' + typeof key);
            id  = key;
            p   = sites[key];

            // NOTE: it's important if distance is equal or very close, then
            //       there's a second way to determine ordering (i.e., by ID)
            //       otherwise the query may be thrown in circles

            d = pos.distance (p);

            // update minimal distance point
            if (d < min || (((d-min) < EQUAL_DISTANCE) && id < closest)) {
                min = d;
                closest = id;
            }
        }

        // NOTE: id should be a number... but keys in 'sites' will change into 'string type'
        return parseInt(closest);
    }

    //
    // accessor methods to Voronoi result
    //

    // get an array of computed edges in this Voronoi
    this.getedges = function () {
		recompute();
        return result.edges;
    }

    // get an array of all the sites in the voronoi
    this.get_sites = function () {
        return JSON.stringify(sites);
    }


    // get result of computation
    this.get_result = function () {
        recompute();
        return result;
    }

    // obtain the bounding box for this Voronoi object
    // returns true if the box exists, false if one of the dimensions is empty
    //bool get_bounding_box (point2d& min, point2d& max);
    this.get_bounding_box = function () {
        return bbox;
    }

    this.set_bounding_box = function (bounding_box) {
        bbox = bounding_box;
    }

    // get the number of sites currently maintained
    this.size = function () {
        return Object.keys(sites).length;
    }

    // lookup of index from id
    this.getidx = function (id) {
        return get_idx(id);
    }

    // return string representation of currently stored sites
    this.to_string = function () {
        var str = '';
        for (var key in sites) {
            str += '[' + key + '] (' + sites[key].x + ', ' + sites[key].y + ') ';
        }
        return str;
    }

    /*
    // get edges of sites with ID = id
    //std::set<int> & get_site_edges (int id);
    this.get_site_edges = function (id) {

        recompute();
        var idx = get_idx(id);
        if (idx == -1)
            return [];

        return voro.mSites[idx].edge_idxlist;
    }
    */

    //
    // private methods
    //

    // check validity for an action (node id exists, recompute is done, if required)
    // returns the index for the id or (-1) for failure
    var check_id = function (id) {
        recompute();
        return get_idx(id);
    }

    // re-calculate Voronoi if sites have changed
    var recompute = function () {
        if (invalidated === true) {

            //LOG.debug('recomputing... sites size: ' + Object.keys(sites).length);
            var list = [];

            // translate sites to an array
            // TODO: use a tree to store site info directly into sorted list (better performance?)
            for (var key in sites) {
                sites[key].id = key;
                list.push(sites[key]);
            }

            // compute Voronoi & store resulting sites & edges to 'result'
            result = voro.compute(list, bbox);

            // NOTE: it may be relatively common for cell size < list size
            if (result.cells.length !== list.length) {
                LOG.debug('init id2idx... mismatch! list size: ' + list.length + ' cell size: ' + result.cells.length);

                /*
                for (var key in sites) {
                    LOG.debug('id: ' + sites[key].id + ' x: ' + sites[key].x + ' y: ' + sites[key].y);
                }
                */
            }

            // get id to index mapping (in new site array)
            id2idx = {};
            for (var i=0; i < result.cells.length; i++) {
                var cell = result.cells[i];

                //LOG.debug('site id: ' + cell.site.id  + ' (' + cell.site.x + ', ' + cell.site.y + ')');
                id2idx[cell.site.id] = i;

                /*
                var halfedges = cell.halfedges;

                // print edges
                for (var j=0; j < halfedges.length; j++) {
                    LOG.debug('halfedge[' + j + '] idx: ' + halfedges[j]);
                }
                */

            }

            invalidated = false;
        }
    }

    // get id to index mapping
    var get_idx = function (id) {

        // NOTE: it may be relatively common to not be able to find index for an id
        //       if the number of cells produced is less than the number of sites
        //       we thus print 'debug' instead of 'error' here
        if (id2idx.hasOwnProperty(id) === false) {
            if (isNaN(id))
                LOG.error('get_idx () cannot find index for id: ' + id + ' (not a number)');
            else
                LOG.debug('get_idx () cannot find index for id: ' + id);

            // check if index list and site list have equal length
            if (Object.keys(id2idx).length !== Object.keys(sites).length) {
                LOG.debug('list size mismatch! there may be overlapped site coords. id2idx size: ' + Object.keys(id2idx).length + ' sites size: ' + Object.keys(sites).length);
            }

            return -1;
        }
        return id2idx[id];
    }

	//
	// private support methods
	//

    // check whether a point lies within a polygon
    // reference: http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html
    function insideRegion(index, p) {

        // produce x & y coordinate arrays
        var cell         = result.cells[index];
        var halfedges    = cell.halfedges;

        var verty = [];
        var vertx = [];
        var pt1;

        for (var i=0; i < halfedges.length; i++) {

            // NOTE: we use getStartpoint() and not edge.va, because the point ordering in edge may not be consistent
            pt1 = halfedges[i].getStartpoint();
            //pt2 = halfedges[i].getEndpoint();
            //va  = halfedges[i].edge.va;
            //vb  = halfedges[i].edge.vb;

            //LOG.debug('half ' + i + ': (' + pt1.x + ', ' + pt1.y + ') (' + pt2.x + ', ' + pt2.y + ')');
            //LOG.debug('edge ' + i + ': (' + va.x + ', ' + va.y + ') (' + vb.x + ', ' + vb.y + ')');
            //LOG.debug('half ' + i + ': ' + pt1.x + ' edge: ' + va.x);

            // NOTE we only store one point, as the polygon should close itself
            verty.push(pt1.y);
            vertx.push(pt1.x);
        }

        //LOG.debug('\n');

        var nvert = halfedges.length;
        var i, j, c = 0;

        for (i = 0, j = nvert-1; i < nvert; j = i++) {
          if ( ((verty[i] > p.y) != (verty[j] > p.y)) &&
				 (p.x < (vertx[j] - vertx[i]) * (p.y - verty[i]) / (verty[j] - verty[i]) + vertx[i]) )
             c = !c;
        }
        return (c != 0);
    }

    //bool collides (int index, const point2d &center, int radius);
    // NOTE: a recentular overlap version is removed from this code, check original C++ version for it
    function collides(index, center, radius) {

        if (typeof center.distance !== 'function') {
            LOG.debug('center does not have distance function');
            return false;
        }

        // case 1: check if center lies inside the polygon
        if (insideRegion(index, center) == true) {
            //LOG.debug('center ' + center.to_string() + ' inside polygon of site ' + result.cells[index].site.id);
            return true;
        }

        var halfedges = result.cells[index].halfedges;

        for (var j=0; j < halfedges.length; j++) {

            var edge = halfedges[j].edge;

            // case 2: check if *any* vertex of the region's edge lies inside the circle
            if (center.distance(edge.va) <= radius) {
                //LOG.debug('circle with center ' + center.to_string() + ' contains va edge end ');
                return true;
            }

            if (center.distance(edge.vb) <= radius) {
                //LOG.debug('circle with center ' + center.to_string() + ' contains vb edge end ');
                return true;
            }

            // case 3: check if the line seg intersects with the circle
            // TODO: possibly costly, do it just once instead of every time?
            var seg = new segment(edge.va, edge.vb);
            if (seg.intersects(center, radius) === true) {
                LOG.debug('circle with center ' + center.to_string() + ' intersects with edge ends');
                return true;
            }
        }

        LOG.warn(index+" doesn't overlap with ("+center.x+", "+center.y+")");
        return false;
    }

    // get the set of enclosing neighbors for a site (given its index)
    // NOTE: nset returns site id (not index in result.cells)
    function getNeighborSet(cell_idx) {

        // reset return array
        var nset = [];

        if (!result.cells.hasOwnProperty(cell_idx) || result.cells[cell_idx] == undefined)
        {
            LOG.debug("No cell with that ID: " + cell_idx);
            return nset;
        }

        //LOG.debug('getNeighborSet cell_idx: ' + cell_idx + ' cell size: ' + result.cells.length);

        // check if index range is sensible
        if (cell_idx >= 0 && cell_idx < result.cells.length && result.cells[cell_idx].site != undefined) {

            var cell_id = result.cells[cell_idx].site.id;
            var halfedges = result.cells[cell_idx].halfedges;

            //LOG.debug(result.cells);

            //LOG.debug('halfedge count: ' + halfedges.length);

            // go through each halfedge & check for edge's sites on two ends
            for (var i=0; i < halfedges.length; i++) {

                var edge = halfedges[i].edge;
                /*
                LOG.debug('edge ' + i + ' site_id: ' + halfedges[i].site.id + ' va (' + edge.va.x + ', ' + edge.va.y + ') vb (' + edge.vb.x + ', ' + edge.vb.y + ')');
                LOG.debug('lSite: ' + edge.lSite + ' id: ' + (edge.lSite !== null ? edge.lSite.id : 'null'));
                LOG.debug('rSite: ' + edge.rSite + ' id: ' + (edge.rSite !== null ? edge.rSite.id : 'null'));
                */
                // take the bisector's site from the other side of current given index
                //var id = (edge.bisectingID[0] == index ? edge.bisectingID[1] : edge.bisectingID[0]);

                var site = (edge.lSite.id === cell_id ? edge.rSite : edge.lSite);
                //LOG.debug('lSite.id: ' + edge.lSite.id + ' cell_id: ' + cell_id + ' site: ' + site);

                if (site !== null)
                    nset.push(site.id);
            }
        }

        return nset;
    }

    // currently unused
    // TODO: should be used by is_boundary() check
	// check if a site of a given index is boundary (one endpoint for the edge is open / unassigned)
    function isBoundarySite(index) {

        for (var i=0; i < voro.mSites[index].edge_idxlist.length; i++) {
            var edge_idx = voro.mSites[index].edge_idxlist[i];
            //var edge = voro.mEdges[edge_idx];
            var edge = result.edges[edge_idx];

            if (edge.vertexIndex[0] == -1 || edge.vertexIndex[1] == -1)
                return true;
        }
        return false;
    }

    // check if a given site (via its 'index') is fully enclosed within some center & radius
    function enclosed(index, center, radius) {

        //LOG.debug('enclosed(), checking whether index ' + index + ' is enclosed within (' + center.x + ', ' + center.y + ') radius: ' + radius);

        // check center for distance function
        if (typeof center.distance !== 'function')
            center = new point2d(center.x, center.y);

        var halfedges = result.cells[index].halfedges;
        var pt;

        for (var i=0; i < halfedges.length; i++) {

            // NOTE: we only need to check one edge point for each edge
            // (it comes around in a circle)
            pt = halfedges[i].getStartpoint();

            //LOG.debug('center: ' + center.to_string() + ' pt:(' + pt.x + ', ' + pt.y + ') dist: ' + center.distance(pt));

            if (center.distance (pt) >= radius)
                return false;
        }
        return true;
    }

    function withinAOI(pos, radius, pos_x, pos_y) {
        var dx = pos.x-pos_x;
        var dy = pos.y-pos_y;
        var dr = Math.sqrt(Math.pow(dx,2) + Math.pow(dy,2));
        if (dr <= radius) {
            return true;
        }
        return false;
    }

    var _isOverlapped = function (pos, id) {
        for (var key in sites) {
            if (sites[key].x == pos.x && sites[key].y == pos.y && id != key)
                return true;
        }
        return false
    }

    var _adjustPos = function (pos, id) {
        do {
            // adjust position randomly between -0.1 and 0.1
            pos.x += Math.random()-0.1;
            pos.y += Math.random()-0.1;

            // make sure the pos is within boundaries of region
            pos = _bound(pos);
        } while (_isOverlapped(pos, id));

        return pos;
    }

    // check that node is within the bounds of the bbox
    var _bound = function (pos) {
        if (pos.x <= bbox.xl+0.5)         pos.x = bbox.xl+0.5;
        if (pos.y <= bbox.yt+0.5)         pos.y = bbox.yt+0.5;
        if (pos.x >= bbox.xr-0.5)         pos.x = bbox.xr-0.5;
        if (pos.y >= bbox.yb-0.5)         pos.y = bbox.yb-0.5;
        return pos;
    }


} // end VAST_Voronoi

// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = VAST_Voronoi;
