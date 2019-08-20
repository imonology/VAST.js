// Include the necessary modules.
//var sys = require( "util" );

var point2d = point2d || require( "./point2d.js" );

function segment(a, b)
{
	this.p1 = (a == undefined ? new point2d(0, 0) : a);        // point2d type
	this.p2 = (b == undefined ? new point2d(0, 0) : b);        // point2d type

	var x, y;

    this.is_empty = function ()
    {
        return (this.p1.x === 0 && this.p1.y === 0 && this.p2.x === 0 && this.p2.y === 0);
    }

	this.is_inside = function (p)
	{
		var xmax, xmin, ymax, ymin;

		if (p1.x > p2.x)
	    {
            xmax = p1.x; 	xmin =  p2.x;
        }
		else
		{
            xmax = p2.x;	xmin =  p1.x;
        }
		if (p1.y > p2.y)
		{
            ymax = p1.y; 	ymin =  p2.y;
        }
		else
		{
            ymax = p2.y; 	ymin =  p1.y;
        }

		return (xmin <= p.x && p.x <= xmax && ymin <= p.y && p.y <= ymax);
	}

	this.intersectionPoint = function (p3, radius) {
		return new point2d(x,y);
	}

    this.intersects = function (p3, radius)
    {
        var u;  // double

        // we should re-order p1 and p2's position such that p2 > p1
        var x1, x2, y1, y2;

        if (this.p2.x > this.p1.x) {
            x1 = this.p1.x;  y1 = this.p1.y;
            x2 = this.p2.x;  y2 = this.p2.y;
        }
        else {
            x1 = this.p2.x;  y1 = this.p2.y;
            x2 = this.p1.x;  y2 = this.p1.y;
        }

        // formula from http://astronomy.swin.edu.au/~pbourke/geometry/sphereline/
        u = ((p3.x - x1) * (x2 - x1) + (p3.y - y1) * (y2 - y1)) /
            ((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));

        if (u >= 0 && u <= 1) {
            x = x1 + (x2 - x1) * u;
            y = y1 + (y2 - y1) * u;

            var pt = new point2d(x, y);
            return (pt.distance (p3) <= radius);
        }
        else
            return (p3.distance(this.p1) <= radius || p3.distance(this.p2) <= radius);
    }
};

if (typeof module !== 'undefined')
    module.exports = segment;
