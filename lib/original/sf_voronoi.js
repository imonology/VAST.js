/*
 * The author of this software is Steven Fortune.
 * Copyright (c) 1994 by AT&T Bell Laboratories.
 *
 * Permission to use, copy, modify, and distribute this software for any
 * purpose without fee is hereby granted, provided that this entire notice
 * is included in all copies of any software which is or includes a copy
 * or modification of this software and in all copies of the supporting
 * documentation for such software.
 *
 * THIS SOFTWARE IS BEING PROVIDED "AS IS", WITHOUT ANY EXPRESS OR IMPLIED
 * WARRANTY.  IN PARTICULAR, NEITHER THE AUTHORS NOR AT&T MAKE ANY
 * REPRESENTATION OR WARRANTY OF ANY KIND CONCERNING THE MERCHANTABILITY
 * OF THIS SOFTWARE OR ITS FITNESS FOR ANY PARTICULAR PURPOSE.
 */

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
 
 
// converted from C version to C++, modified by Guan-Ming Liao (gm.liao@msa.hinet.net)
// converted from C++ version to javascript, modified by Shun-Yun Hu (syhu@ieee.org)
//
// history:
//      2012-02-21  replace usage of HEcreate() with new Halfedge() directly
//      2012-06-04  1st converted version working
//

/*

Usage:

  var sites = [{x:300,y:300}, {x:100,y:100}, {x:200,y:500}, {x:250,y:450}, {x:600,y:150}];
  // xl, xr means x left, x right
  // yt, yb means y top, y bottom
  var bbox = {xl:0, xr:800, yt:0, yb:600};
  var voronoi = new Voronoi();
  // pass an object which exhibits xl, xr, yt, yb properties. The bounding
  // box will be used to connect unbound edges, and to close open cells
  result = voronoi.compute(sites, bbox);
  // render, further analyze, etc.

Return value:
  An object with the following properties:

  result.edges = an array of unordered, unique Voronoi.Edge objects making up the Voronoi diagram.
  result.cells = an array of Voronoi.Cell object making up the Voronoi diagram. A Cell object
    might have an empty array of halfedges, meaning no Voronoi cell could be computed for a
    particular cell.
  result.execTime = the time it took to compute the Voronoi diagram, in milliseconds.

Voronoi.Edge object:
  lSite: the Voronoi site object at the left of this Voronoi.Edge object.
  rSite: the Voronoi site object at the right of this Voronoi.Edge object (can be null).
  va: an object with an 'x' and a 'y' property defining the start point
    (relative to the Voronoi site on the left) of this Voronoi.Edge object.
  vb: an object with an 'x' and a 'y' property defining the end point
    (relative to Voronoi site on the left) of this Voronoi.Edge object.

  For edges which are used to close open cells (using the supplied bounding box), the
  rSite property will be null.

Voronoi.Cell object:
  site: the Voronoi site object associated with the Voronoi cell.
  halfedges: an array of Voronoi.Halfedge objects, ordered counterclockwise, defining the
    polygon for this Voronoi cell.

Voronoi.Halfedge object:
  site: the Voronoi site object owning this Voronoi.Halfedge object.
  edge: a reference to the unique Voronoi.Edge object underlying this Voronoi.Halfedge object.
  getStartpoint(): a method returning an object with an 'x' and a 'y' property for
    the start point of this halfedge. Keep in mind halfedges are always countercockwise.
  getEndpoint(): a method returning an object with an 'x' and a 'y' property for
    the end point of this halfedge. Keep in mind halfedges are always countercockwise.

*/

// if already defined (as included in website) then don't define
var point2d = point2d || require( "../voronoi/point2d.js" );
var segment = segment || require( "../voronoi/segment.js" );
var line2d  = line2d  || require( "../voronoi/line2d.js" );

//
// Data Structures
//
function Site(x, y)
{     
    // NOTE that coordinates should be accessed via the 'coord' public variable
    this.coord = new point2d(x, y);
    this.site_num = 0;            // sitenbr   (NOTE: this is dual-use, one for storing ID of input sites, another for labeling vertex number when calculating edges)
    this.ref_count = 0;

    this.edge_idxlist = [];       //std::set<int> edge_idxlist;

    // calculate distance between two sites
    this.distance = function (another) {
        var dist = this.coord.distance(another.coord);
        return dist;
    }
    
    // increase reference count for this site
    this.ref = function () {
        this.ref_count++;
    }
    
    // increase reference count for this site
    this.deref = function () {
        this.ref_count--;
    }
    
    this.print = function () {
        console.log ("site num: " + this.site_num + " ref_count: " + this.ref_count + " x: " + this.coord.x + " y: " + this.coord.y);
    }
}

function Edge () {

    this.a = 0; // double
    this.b = 0; // double
    this.c = 0; // double
    this.ep    = [];
    this.ep[0] = new Site(0,0);
    this.ep[1] = new Site(0,0);
    this.reg = [];
    this.reg[0] = new Site(0,0);
    this.reg[1] = new Site(0,0);
    this.edge_num = 0;
}

// constructor passes in pointer to Edge and an integer value 'pm'
// NOTE: adopted from original HEcreate()
function Halfedge(e, pm)
{
    this.ELleft = undefined;
    this.ELright = undefined;            

    this.ELedge = e;
    this.ELpm = pm;    

    this.vertex = null;     // he->vertex = (Site *)NULL;    
    this.PQnext = null;     // he->PQnext = (Halfedge *)NULL;    
    this.ystar = 0;         // double
    this.ELref_count = 0;
            
    // for debug: print info for this halfedge
    this.print = function () {
    
        console.log("vertex is: " + typeof this.vertex + " content: " + this.vertex);
    
        console.log("ELleft: " + this.ELleft + 
                    " ELright: " + this.ELright + 
                    " ELref_count: " + this.ELref_count);
                    
        if (this.vertex != null)
            console.log(" vertex: (" + this.vertex.coord.x + ", " + this.vertex.coord.y + ")");
    }
}

// Construction of SFVoronoi
function Voronoi() {

    //
    // public methods & variables
    //
	
    this.mSites = [];
    this.mEdges = [];
    this.mVertices = [];

    /*
    // convert site id to an index in mSites, or returns (-1) if id is not found
    this.get_idx = function (id) {
        return ((id2idx.hasOwnProperty(id) === false) ? (-1) : id2idx[id]);
    }
    */

    
    //
    // private
    //
    
    //////////////////////////////////////////////////////////////////////////
    //defs.h
    
    // command line flags
    var triangulate, sorted, plot, debug;           // int
    var xmin, xmax, ymin, ymax, deltax, deltay;     // double
    var nsites;         // int
    var siteidx;        // int
    var sqrt_nsites;    // int
    var nvertices;        // int
    var bottomsite;     //Site    *bottomsite;

    var nedges;                     // number of edges (int)
    var PQhash = [];                // Halfedge *PQhash;
    var PQhashsize;                 // int
    var PQcount;                    // int
    var PQmin;                      // int
    
    var ELleftend, ELrightend;        //Halfedge *ELleftend, *ELrightend;
    var ELhashsize;                 //int
    var ELhash = [];                //Halfedge **ELhash;

    // special marker to indicate a deleted edge
    var DELETED = new Edge();       //Edge*    DELETED;
    DELETED.a = DELETED.b = DELETED.c = (-2);
    
    // initialization originally done in sfVoronoi constructor
    var le = 0;                 // int
    var re = 1;                 // int
	                
    // a map from id to index in mSites (sorted)
    //var id2idx = new Hash();
    //var id2idx = {};

    // enclosing neighbor list
    var en_list = [];      //vector<id_t> _en_list;
    
    //
    // private methods & variables (originally from VoronoiSFAlgorithm's public methods)
    //

    // obtain the bounding box for this Voronoi object
    // returns true if the box exists, false if one of the dimensions is empty
    //bool getBoundingBox (point2d& min, point2d& max)
    function getBoundingBox(min, max) {
        min.x = xmin;
        min.y = ymin;
        max.x = xmax;
        max.y = ymax;

        return !(xmin == xmax || ymin == ymax);
    }

    //
    // private methods & variables (originally from VoronoiSFAlgorithm)
    //

    this.recompute = function (sites) {
    	
        // clear data
        mSites = [];       // a list of sites (sorted by ascending order)
        mEdges = [];       // a list of computed edges
        mVertices = [];    // a list of all vertices
	
        if (sites.length === 0)
            return false;
    
        // init variables, originally in calsvf()
        sorted = false; triangulate = false; plot = true; debug = true;

        readsites(sites);
        siteidx = 0;

        geominit();

        if (plot)
            plotinit();

        //console.log('calling Voronoi');
        Voronoi(triangulate);

        return true;
    }


    //
    // original protected functions, now into private
    //

    //Site* nextone()
    function nextone() {
        
        //console.log("nextone() siteidx: " + siteidx + " nsites: " + nsites);
        
        // check if next is available
        if (siteidx >= nsites)
            return null;
        
        var coord = mSites[siteidx++].coord;
        //console.log("site found idx: " + (siteidx-1) + " id: " + mSites[(siteidx-1)].site_num + " (" + coord.x + "," + coord.y + ")");
       
        return new Site(coord.x, coord.y);        
    }

    //void readsites();
    // converting sites to mSites
    // NOTE: this is an important step as mSites needs to be sorted (from ascending order) for Voronoi construction
    function readsites(sites) {

        // get number of sites first
        nsites = sites.length;
        
        // store initial min-max values
        xmin = xmax = sites[0].x;
        ymin = ymax = sites[0].y;
		//console.log('xmin: ' + xmin + ' xmax: ' + xmax + ' ymin: ' + ymin + ' ymax: ' + ymax);
        
        var pt;
        var site;
            
        for (var i=0; i < nsites; i++) {

            pt = sites[i];
            site = new Site(pt.x, pt.y);
            
            // store id directly to site
            site.id = pt.id;
            //site.site_num = pt.id;
            //site.site_num = keys[i];            // use the key (i.e., site ID) as the site numbers

			//console.log('site [' + site.site_num + '] (' + pt.x + ', ' + pt.y + ')'); 
			
            // store onto a new array (to be sorted)
            mSites.push(site);

            // check & store min/max values
            if (pt.x < xmin)
                xmin = pt.x;
            else if (pt.x > xmax)
                xmax = pt.x;
            if (pt.y < ymin)
                ymin = pt.y;
            else if (pt.y > ymax)
                ymax = pt.y;
        }

        // order all sites according to coordinate comparisons
        mSites.sort(function (a, b) {
            return a.coord.compareTo(b.coord);
        });

        /*
        // record a map from site id to index in mSites (after sorting)
        // this is used to perform other overlap, contain checks
        id2idx = {};
                
        for (var idx = 0; idx < mSites.length; idx++) {
            id2idx[mSites[idx].site_num] = idx;            
        }
        */
    }

    //////////////////////////////////////////////////////////////////////////
    //Geometry.h

    //void sfVoronoi::geominit ()
    
    var geominit = function () {

        nvertices = 0;
        nedges = 0;               
        sqrt_nsites = Math.floor(Math.sqrt(nsites+4));    // NOTE: sqart_nsites is of type integer in C++
        deltay = ymax - ymin;
        deltax = xmax - xmin;
        //console.log("nsites: " + nsites + " sqrt_nsites: " + sqrt_nsites + " ymax: " + ymax + " ymin: " + ymin + " xmax: " + xmax + " xmin: " + xmin);
    }

    var bisect = function (s1, s2) {
    
        //console.log ("bisecting (%d, %d) (%d, %d)\n", s1.coord.x, s1.coord.y, s2.coord.x, s2.coord.y);
        
        var dx, dy, adx, ady;  // double        
        var newedge = new Edge();

        newedge.reg[0] = s1;
        newedge.reg[1] = s2;
        s1.ref();   
        s2.ref();   
        newedge.ep[0] = null;
        newedge.ep[1] = null;

        dx = s2.coord.x - s1.coord.x;
        dy = s2.coord.y - s1.coord.y;
        adx = (dx > 0 ? dx : -dx);
        ady = (dy > 0 ? dy : -dy);
        
        newedge.c = s1.coord.x * dx + s1.coord.y * dy + (dx*dx + dy*dy) * 0.5;  // double
    
        if (adx > ady) {
            newedge.a = 1.0;
            newedge.b = dy/dx;
            newedge.c /= dx;
        }
        else {
            newedge.b = 1.0;
            newedge.a = dx/dy;
            newedge.c /= dy;
        }

        newedge.edge_num = nedges++;
        out_bisector(newedge);

        return newedge;
    }

    var intersect = function (el1, el2)
    {
        var e1 = el1.ELedge;
        var e2 = el2.ELedge;

        if (e1 == null || e2 == null || (e1.reg[1] == e2.reg[1]))
            return null;

        var d = e1.a * e2.b - e1.b * e2.a;
        
        // if difference is close to 0, we assume it's 0 and return it
        if (-1.0e-10 < d && d < 1.0e-10) {
			//console.log('d is in range, returning null');
            return null;
        }

        var e;  // Edge *e;
        var el; // Halfedge *el;

        var xint = (e1.c*e2.b - e2.c*e1.b)/d;
        var yint = (e2.c*e1.a - e1.c*e2.a)/d;

        if (e1.reg[1].coord.compareTo(e2.reg[1].coord) < 0)
        {
            el = el1;
            e = e1;
        }
        else 
        {
            el = el2;
            e = e2;
        }

        var right_of_site = (xint >= e.reg[1].coord.x);

        if ((right_of_site && el.ELpm == le) ||(!right_of_site && el.ELpm == re))
           return null;

        var v = new Site(xint, yint);     //Site *v;
        return v;
    }

    function right_of(el, p)
    {
        // el.ELedge is expected to be valid pointer
        var e = el.ELedge;      // Edge *e;
        var topsite = e.reg[1]; //Site *topsite;

        var right_of_site = (p.x > topsite.coord.x);

        if (right_of_site && el.ELpm == le)
            return true;

        if (!right_of_site && el.ELpm == re)
            return false;

        var above, fast;     // int
        var dxp, dyp, dxs, t1, t2, t3, yl;  // double

        if (e.a == 1.0) {
		
            dyp = p.y - topsite.coord.y;
            dxp = p.x - topsite.coord.x;
            fast = false;

            if ((!right_of_site & (e.b < 0.0)) | (right_of_site & (e.b >= 0.0)))
                fast = above = (dyp >= e.b*dxp);
            else {
                above = p.x + p.y * e.b > e.c;
                if (e.b < 0.0)
                    above = !above;
                if (!above)
                    fast = true;
            }
            if (!fast) {

                dxs = topsite.coord.x - (e.reg[0]).coord.x;

                // joker: update, skip divide by zero 05.05.27
                // TODO: need to further check what cases could cause divide by 0
                if (dxs != 0)
                    above = e.b * (dxp*dxp - dyp*dyp) < dxs*dyp*(1.0+2.0*dxp/dxs + e.b*e.b);
                else
                    above = false;

                if (e.b < 0.0)
                    above = !above;
            }
        }
        //e.b==1.0
        else {
            yl = e.c - e.a*p.x;
            t1 = p.y - yl;
            t2 = p.x - topsite.coord.x;
            t3 = yl - topsite.coord.y;
            above = t1*t1 > (t2*t2 + t3*t3);
        }

        return (el.ELpm == le ? above : !above);
    }

    function endpoint(e, lr, s)
    {
        e.ep[lr] = s;
        s.ref();    
		
        if (e.ep[re-lr] == null)
            return;

        out_ep(e);
        e.reg[le].deref();  // deref(e.reg[le]);
        e.reg[re].deref();  // deref(e.reg[re]);
    }

    //void  sfVoronoi::makevertex( Site *v )
    function makevertex(v)
    {
        v.site_num = nvertices++;
        //out_vertex(v);
        mVertices.push(new point2d(v.coord.x, v.coord.y));        
    }

    /*
    //void out_vertex ( Site *v );
    function out_vertex(v) {
        mVertices.push(new point2d(v.coord.x, v.coord.y));
    }
    */
    
    
    //////////////////////////////////////////////////////////////////////////
    //output.c
    var pxmin, pxmax, pymin, pymax, cradius;    // double

    function out_bisector(e)
    {
        //printf ("out_bisector [%f, %f, %f]\n", e.a, e.b, e.c);
		//console.log('out_bisector [' + e.a + ', ' + e.b + ', ' + e.c + ']');
		console.log('out_bisector le: ' + le + ' re: ' + re + ' site1: ' + e.reg[le].site_num + ' site2: ' + e.reg[re].site_num);
        
        var line = new line2d(e.a, e.b, e.c);
		
        line.bisectingID[0] = e.reg[le].site_num;
        line.bisectingID[1] = e.reg[re].site_num;

        // To-do: check if accessing using line.bisectingID[0] is okay (it may be a string instead of a number)
        mSites[line.bisectingID[0]].edge_idxlist.push(e.edge_num);
        mSites[line.bisectingID[1]].edge_idxlist.push(e.edge_num);

        mEdges.push(line);
    }

    function out_ep(e) {

        mEdges[e.edge_num].vertexIndex[0] = (e.ep[le] != null) ? (e.ep[le].site_num) : (-1);
        mEdges[e.edge_num].vertexIndex[1] = (e.ep[re] != null) ? (e.ep[re].site_num) : (-1);

        if (!triangulate & plot) {
            clip_line(e);
        }

        if (!triangulate & !plot) {
          //printf("e %d", e.edge_num);
          //printf(" %d ", e.ep[le] != ( Site *)NULL ? e.ep[le].site_num : -1);
          //printf("%d\n", e.ep[re] != ( Site *)NULL ? e.ep[re].site_num : -1);
        }
    }

    function plotinit() {

        var dx = xmax - xmin;
        var dy = ymax - ymin;
        var d = (dx > dy ? dx : dy) * 1.1;

        pxmin = xmin - (d-dx)/2.0;
        pxmax = xmax + (d-dx)/2.0;
        pymin = ymin - (d-dy)/2.0;
        pymax = ymax + (d-dy)/2.0;

        cradius = (pxmax - pxmin)/350.0;
    }

    function clip_line(e) {

        var s1, s2;         // Site *s1, *s2;
        var x1,x2,y1,y2;    // double

        if (e.a == 1.0 && e.b >= 0.0) {
            s1 = e.ep[1];
            s2 = e.ep[0];
        }
        else {
            s1 = e.ep[0];
            s2 = e.ep[1];
        }

        if (e.a == 1.0) {

            y1 = pymin;
            if (s1 != null && s1.coord.y > pymin)
                 y1 = s1.coord.y;

            if (y1 > pymax)
                return;

            x1 = e.c - e.b * y1;
            y2 = pymax;

            if (s2 != null && s2.coord.y < pymax)
                y2 = s2.coord.y;

            if (y2 < pymin)
                return;

            x2 = e.c - e.b * y2;

            if (((x1> pxmax) & (x2>pxmax)) | ((x1 < pxmin) & (x2 < pxmin)))
                return;

            if (x1 > pxmax) {
                x1 = pxmax;
                y1 = (e.c - x1) / e.b;
            }

            if (x1 < pxmin) {
                x1 = pxmin;
                y1 = (e.c - x1) / e.b;
            }

            if (x2 > pxmax) {
                x2 = pxmax;
                y2 = (e.c - x2) / e.b;
            }

            if (x2 < pxmin) {
                x2 = pxmin;
                y2 = (e.c - x2) / e.b;
            }
        }
        else {
			
            x1 = pxmin;
            if (s1 != null && s1.coord.x > pxmin)
                x1 = s1.coord.x;

            if (x1 > pxmax)
                return;

            y1 = e.c - e.a * x1;
            x2 = pxmax;

            if (s2 != null && s2.coord.x < pxmax)
                x2 = s2.coord.x;

            if (x2 < pxmin)
                return;

            y2 = e.c - e.a * x2;

            if (((y1 > pymax) & (y2 > pymax)) | ((y1 < pymin) & (y2 < pymin)))
                return;

            if (y1> pymax) {
                y1 = pymax;
                x1 = (e.c - y1) / e.a;
            }

            if (y1 < pymin) {
                y1 = pymin;
                x1 = (e.c - y1) / e.a;
            }

            if (y2 > pymax) {
                y2 = pymax;
                x2 = (e.c - y2) / e.a;
            }

            if (y2 < pymin) {
                y2 = pymin;
                x2 = (e.c - y2) / e.a;
            }
        }

        mEdges[e.edge_num].seg.p1 = new point2d(x1,y1);
        mEdges[e.edge_num].seg.p2 = new point2d(x2,y2);
    }


    //////////////////////////////////////////////////////////////////////////
    //heap.c

    function PQinsert(he, v, offset) {
        var last, next;     // Halfedge *last, *next;
 
        he.vertex = v;
        
        v.ref();    
        he.ystar = v.coord.y + offset;
        
        var buc = PQbucket(he);
        last = PQhash[buc];

        while ((next = last.PQnext) != null &&
              (he.ystar  > next.ystar  || (he.ystar == next.ystar && v.coord.x > next.vertex.coord.x)))
            last = next;

        he.PQnext = last.PQnext;
        last.PQnext = he;
        PQcount++;
    }

    //    void PQdelete(Halfedge *he);
    function PQdelete(he) {

        var last;   //Halfedge *last;

        if (he.vertex != null)
        {
            last = PQhash[PQbucket(he)];

            while (last.PQnext != he)
                last = last.PQnext;

            last.PQnext = he.PQnext;
            PQcount--;

            he.vertex.deref();             
            he.vertex = null;
        }
    }

    // return the bucket (an integer number) for the halfedge
    // int PQbucket(Halfedge *he);
    function PQbucket(he) {

        // int
        var bucket = Math.floor((he.ystar - ymin) / deltay * PQhashsize);
        
        // 2012-02-21 syhu added: to check for NaN for bucket
        if (bucket < 0 || isNaN(bucket))
            bucket = 0;

        // get last one
        if (bucket >= PQhashsize)
            bucket = PQhashsize-1;

        // record min
        if (bucket < PQmin)
            PQmin = bucket;

        //console.log ("*** bucket: " + bucket + " deltay: " + deltay + " ystar: " + he.ystar);
        return bucket;
    }

    function PQempty() {
        return (PQcount == 0);
    }

    function PQ_min() {
        var answer = new point2d(); // Point

        while (PQhash[PQmin].PQnext == null)
            PQmin++;

        answer.x = PQhash[PQmin].PQnext.vertex.coord.x;
        answer.y = PQhash[PQmin].PQnext.ystar;

        return answer;
    }

    function PQextractmin() {
   
        //Halfedge *curr;
        var curr = PQhash[PQmin].PQnext;
        
        PQhash[PQmin].PQnext = curr.PQnext;
        PQcount--;

        return curr;
    }

    function PQinitialize() {

        PQcount = 0;
        PQmin = 0;
        PQhashsize = 4 * sqrt_nsites;       
        PQhash = [];   //PQhash = new Halfedge[PQhashsize];

        for (var i=0; i < PQhashsize; i++) {
            PQhash[i] = new Halfedge();
        }
    }

    //////////////////////////////////////////////////////////////////////////
    //edgelist.c
    var ntry = 0, totalsearch = 0;

    function ELinitialize() {

        // need to force "ELhashsize" to be integer
        ELhashsize = Math.floor(2 * sqrt_nsites);
        
        ELhash = [];

        // NOTE: it's important to initialize ELhash with 'null'        
        for (var i=0; i < ELhashsize; i++) 
            ELhash.push(null);
        
        // TODO: init with null, 0 will cause crash 
        ELleftend = new Halfedge(null, 0);
        ELrightend = new Halfedge(null, 0);

        ELleftend.ELleft = null;
        ELleftend.ELright = ELrightend;

        ELrightend.ELleft = ELleftend;
        ELrightend.ELright = null;

        // set ELleftend and ELrightend to array 
        ELhash[0] = ELleftend;
        ELhash[ELhashsize-1] = ELrightend;
    }
    
    //change arg2 to newH
    // void ELinsert (Halfedge *lb, Halfedge* newH);
    function ELinsert(lb, newH) {
        newH.ELleft         = lb;
        newH.ELright        = lb.ELright;
        lb.ELright.ELleft   = newH;
        lb.ELright          = newH;
    }

    // get the halfedge in a given bucket
    function ELgethash(b) {
        
        //console.log("ELgethash: b=" + b + " ELhashsize: " + ELhashsize);
        if (b < 0 || b >= ELhashsize) {
            //console.log("err: ELgethash: b out of range, returning null");
            return null;
        }

        var he = ELhash[b];
			       
        // NOTE: it's important the check is done against DELETED instead of 'null'
        // as DELETED is a special marker object
        if (he == null || he.ELedge != DELETED)
            return he;

        // removing the halfedge node
        // Hash table points to deleted half edge.  Patch as necessary.
        ELhash[b] = null;

        return null;
    }

    // find the left boundary of a point p (?)
    function ELleftbnd(p) {
      
        //ntry = 0;

        // Use hash table to get close to desired halfedge            
        var bucket = Math.floor((p.x - xmin) / deltax * ELhashsize); // int

		//console.log('bucket: ' + bucket + ' ELhashzie: ' + ELhashsize + ' deltax: ' + deltax);
		
		// syhu: 2012-06-11 add check for NaN
        //if (bucket < 0 || isNaN(bucket))
		if (bucket < 0)
            bucket = 0;
        
        if (bucket >= ELhashsize)
            bucket = ELhashsize - 1;

        var he = ELgethash(bucket);

        if (he == null) {

            /*
            var i=1;    // int
            while ((he = ELgethash (bucket-i)) == null &&
                   (he = ELgethash (bucket+i)) == null)
                i++;
            */
            for (var i=1; true; i++) {
                if ((he = ELgethash(bucket-i)) != null)
                    break;
                if ((he = ELgethash(bucket+i)) != null)
                    break;
            }
            
            totalsearch += i;
        }

        ntry++;
        
        // Now search linear list of halfedges for the corect one
        // NOTE: he.ELedge must be valid for right_of to process correctly                
        if (he == ELleftend || (he != ELrightend && right_of(he, p))) {
       
            do {
                // NOTE: ELright is assumed to be a valid object (not possible to be null)
                he = he.ELright;
            }
            while (he != ELrightend && right_of(he, p));

            he = he.ELleft;
        }
        else {

            do {
                he = he.ELleft;
            }
            while (he !== ELleftend && !right_of(he,p));
        }

        // Update hash table and reference counts
        if (bucket > 0 && bucket < ELhashsize-1) {
            if (ELhash[bucket] != null)
                ELhash[bucket].ELref_count--;

            ELhash[bucket] = he;
            ELhash[bucket].ELref_count++;
        }

        //printf ("ELleftbnd: elpm: %d ref_count: %d ystar: %f\n", he.ELpm, he.ELref_count, he.ystar);
        return he;
    }

    function ELdelete(he) {
        he.ELleft.ELright   = he.ELright;
        he.ELright.ELleft   = he.ELleft;
        he.ELedge           = DELETED;
    }

    function ELright(he) {
        return he.ELright;
    }

    function ELleft(he) {
        return he.ELleft;
    }

    function leftreg (he) {

        if (he.ELedge == null)
            return bottomsite;

        return (he.ELpm == le ? he.ELedge.reg[le] : he.ELedge.reg[re]);
    }

    function rightreg (he) {

        if (he.ELedge == null) {
            return bottomsite;
        }

        return (he.ELpm == le ? he.ELedge.reg[re] : he.ELedge.reg[le]);
    }

    //////////////////////////////////////////////////////////////////////////
    //Voronoi.c
    //void Voronoi (int triangulate);

    function Voronoi(to_triangulate) {
    
        //console.log("my function name: " + arguments.callee.name);
     
        // unused
        triangulate = to_triangulate;

        var newsite, bot, top, temp, p; // Site *
        var v;                          //Site *v;
        var newintstar = new point2d(0, 0);                 // Point

        var pm;                                     // int
        var lbnd, rbnd, llbnd, rrbnd, bisector;     // Halfedge *
        var e;                                      // Edge *e;

        PQinitialize();
        bottomsite = nextone();
        ELinitialize();

        //console.log('get first site...');
        newsite = nextone();

        while (true) {
        
            //console.log('still true...');
            if (!PQempty ())
                newintstar = PQ_min();

            if (newsite != null &&
                (PQempty () || newsite.coord.compareTo(newintstar) < 0)) {

				//console.log ("new site is smallest\n");
                // new site is smallest
                lbnd = ELleftbnd(newsite.coord);	                				
                rbnd = ELright(lbnd);												
                bot  = rightreg(lbnd);
            
                e = bisect(bot, newsite);
                bisector = new Halfedge(e, le);     // HEcreate(e, le);
				
                ELinsert(lbnd, bisector);

				//console.log ("find left intersect\n");
                if ((p = intersect(lbnd, bisector)) != null) {
                    PQdelete(lbnd);                    
                    PQinsert(lbnd, p, p.distance(newsite));
                }

                lbnd = bisector;
                bisector = new Halfedge(e, re); // HEcreate(e, re);
                ELinsert(lbnd, bisector);

				//console.log ("find right intersect\n");
                if ((p = intersect(bisector, rbnd)) != null) 
                    PQinsert(bisector, p, p.distance(newsite));
                
                newsite = nextone();
            }
            // intersection is smallest
            else if (!PQempty())
            {
                //console.log ("intersection is smallest\n");
                lbnd  = PQextractmin();
                llbnd = ELleft(lbnd);
                rbnd  = ELright(lbnd);
                rrbnd = ELright(rbnd);
                bot   = leftreg(lbnd);
                top   = rightreg(rbnd);
                v     = lbnd.vertex;

                makevertex (v);

                endpoint(lbnd.ELedge, lbnd.ELpm, v);
                endpoint(rbnd.ELedge, rbnd.ELpm, v);

                ELdelete(lbnd);
                PQdelete(rbnd);
                ELdelete(rbnd);

                pm = le;

                if (bot.coord.y > top.coord.y) {
                    temp = bot;
                    bot = top;
                    top = temp;
                    pm = re;
                }

                e = bisect(bot, top);
                bisector = new Halfedge(e, pm);
                ELinsert(llbnd, bisector);
                endpoint(e, re-pm, v);
                v.deref();  

                if ((p = intersect(llbnd, bisector)) != null) {
                    PQdelete(llbnd);
                    PQinsert(llbnd, p, p.distance(bot));
                }
				
                if ((p = intersect(bisector, rrbnd)) != null) 
                    PQinsert(bisector, p, p.distance(bot)); 
            }
            else
                break;
        }

        for (lbnd = ELright(ELleftend); lbnd != ELrightend; lbnd = ELright(lbnd)) {
            e = lbnd.ELedge;
            out_ep(e);
        }
    } // end Voronoi
} // end SFVoronoi

/*
// get sorted site list
Voronoi.prototype.get_sites = function () {
    return mSites;
}
*/

// produce voronoi given sites & bounding box
Voronoi.prototype.compute = function (sites, bbox) {
	    
    // to measure execution time
	var startTime = new Date();
    
    // calculate Voronoi
    this.recompute(sites);
   
	// to measure execution time
	var stopTime = new Date();

    // convert cells
    var cells = [];
	//console.log('mSites.length: ' + mSites.length);
    
    // store site to cells' site attribute    
	for (var i=0; i < mSites.length; i++) {
        //cells.push(mSites[i].coord);
        var cell = {
            site: mSites[i].coord,
            halfedges: mSites[i].edge_idxlist
        }
        //console.log('edge_idxlist length: ' + mSites[i].edge_idxlist.length);
        cell.site.id = mSites[i].id;
        cells.push(cell);
    }

    // convert edges
    var edges = [];
    for (var i=0; i < mEdges.length; i++) {
        //if (mEdges[i].seg.is_empty() === false) {
            var edge = {
                va: mEdges[i].seg.p1,
                vb: mEdges[i].seg.p2,
                a:  mEdges[i].a,
                b:  mEdges[i].b,
                c:  mEdges[i].c
            }
            edges.push(edge);
        //}
    }
   
	// prepare return values
	var result = {
		cells: cells,
		edges: edges,
		execTime: stopTime.getTime()-startTime.getTime()
    }

	return result;
}

if (typeof module !== "undefined")
	module.exports = Voronoi;
