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
        //console.log("p3:")
        //console.log(p3);
        //console.log("Radius: " + radius);
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

        //console.log("x1:");
        //console.log(x1);
        //console.log("x2:");
        //console.log(x2);
        //console.log("y1:");
        //console.log(y1);
        //console.log("y2:");
        //console.log(y2);
        //console.log("p1:");
        //console.log(this.p1);
        //console.log("p2:");
        //console.log(this.p2);

        // formula from http://astronomy.swin.edu.au/~pbourke/geometry/sphereline/
        u = ((p3.x - x1) * (x2 - x1) + (p3.y - y1) * (y2 - y1)) /
            ((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));

        //console.log(u);

        if (u >= 0 && u <= 1) {
            x = x1 + (x2 - x1) * u;
            y = y1 + (y2 - y1) * u;

            var pt = new point2d(x, y);
            return (pt.distance(p3) <= radius);
        }
        else {
            return (_distance(p3,this.p1) <= radius || _distance(p3,this.p2) <= radius);
        }
    }

    var _distance = function (pt1,pt2){
        var dx = pt1.x - pt2.x;
        var dy = pt1.y - pt2.y;
        //console.log ("point2d distance called, dx: " + dx + " dy: " + dy + " this.x: " + this.x + " this.y: " + this.y + " p.x: " + p.x + " p.y: " + p.y);

        return Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
    }
};

if (typeof module !== 'undefined')
    module.exports = segment;
