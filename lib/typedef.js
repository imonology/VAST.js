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

 // sugars (from Crockford's Javascript tutorial)
 // http://www.crockford.com/javascript/inheritance.html
 
  
 /* 
    Basic Data Types
    
*/

//
//  Following are used by Voronoi class
//

var point2d = require( "./typedef/point2d.js" ); 
var segment = require( "./typedef/segment.js" ); 
var line2d = require( "./typedef/line2d.js" ); 


/*
class rect
{
public:
	point2d vertex[4];
	line2d  lines[4];

	rect (point2d& c, uint32_t w, uint32_t h)
		:center (c), width (w), height(h)
	{
		calculateVertex();
	}

	bool is_inside (point2d& p)
	{
	    return vertex[1].x >= p.x && vertex[3].x <= p.x &&
               vertex[1].y >= p.y && vertex[3].y <= p.y;
	}

	void setCenter (point2d& np)
	{
		center.x = np.x;
		center.y = np.y;
		calculateVertex();
	}
	
	point2d getCenter ()
	{
		return center;
	}

	uint32_t getWidth()
	{
		return width;
	}
	
	uint32_t getHeight()
	{
		return height;
	}

	void setWidth (uint32_t nw)
	{
		width = nw;
		calculateVertex();
	}

	void setHeight (uint32_t nh)
	{
		height = nh;
		calculateVertex();
	}

protected:

    point2d center;
    int     width, height;

	void calculateVertex()
	{
		vertex[0].x = center.x - width/2;
		vertex[0].y = center.y + height/2;
		vertex[1].x = center.x + width/2;
		vertex[1].y = center.y + height/2;
		vertex[2].x = center.x + width/2;
		vertex[2].y = center.y - height/2;
		vertex[3].x = center.x - width/2;
		vertex[3].y = center.y - height/2;
		
		lines[0].a = 0 ; lines[0].b = 1 ; lines[0].c = vertex[1].y;
		lines[1].a = 1 ; lines[1].b = 0 ; lines[1].c = vertex[1].x;	
		lines[2].a = 0 ; lines[2].b = 1 ; lines[2].c = vertex[3].y;
		lines[3].a = 1 ; lines[3].b = 0 ; lines[3].c = vertex[3].x;
	}

private:

};
*/

/* 
    sugar to provide inheritance
    http://javascript.crockford.com/inheritance.html
*/    


Function.prototype.method = function (name, func) {
    this.prototype[name] = func;
    return this;                            
};

Function.method('inherits', function (parent) {

    var d = {}, p = (this.prototype = new parent());
    this.method('uber', function uber(name) {
        if (!(name in d)) {
            d[name] = 0;
        }        
        var f, r, t = d[name], v = parent.prototype;
        if (t) {
            while (t) {
                v = v.constructor.prototype;
                t -= 1;
            }
            f = v[name];
        } else {
            f = p[name];
            if (f == this[name]) {
                f = v[name];
            }
        }
        d[name] += 1;
        r = f.apply(this, Array.prototype.slice.apply(arguments, [1]));
        d[name] -= 1;
        return r;
    });
    return this;
});

Function.method('swiss', function (parent) {
    for (var i = 1; i < arguments.length; i += 1) {
        var name = arguments[i];
        this.prototype[name] = parent.prototype[name];
    }
    return this;
});
 
// prototypical inhertance
// http://javascript.crockford.com/prototypal.html
if (typeof Object.create !== 'function') {
    Object.create = function (o) {
        function F() {}
        F.prototype = o;
        return new F();
    };
}
//newObject = Object.create(oldObject);



