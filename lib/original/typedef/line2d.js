// Include the necessary modules if not defined

var point2d = point2d || require( "./point2d.js" );
var segment = segment || require( "./segment.js" ); 

//function line2d (x1, y1, x2, y2)
function line2d(a, b, c)
{
    // public
    this.a = (typeof a == 'undefined' ? 0 : a);                 // double
    this.b = (typeof b == 'undefined' ? 0 : b);
    this.c = (typeof c == 'undefined' ? 0 : c);                 
    this.seg = new segment();   // segment
    
    //var  bisecting = new Array();         // int
    this.bisectingID = [];          // int[2]
    this.vertexIndex = [];          // int[2]
    
	this.vertexIndex[0] = -1;
	this.vertexIndex[1] = -1;
    
    // method to set the two endpoints for a line
    this.set = function (x1, y1, x2, y2) {
    
        // store coordinates
        seg.p1 = new point2d(x1, y1);
        seg.p2 = new point2d(x2, y2);
    
		if (y1 == y2) {	
			a = 0; b = 1; c = y1;
		}
		else if (x1 == x2) {
			a = 1; b = 0; c = x1;
		}
		else {
			var dx = x1 - x2;       // double
			var dy = y1 - y2;       // double
			var m = dx / dy;        // double
            
			a = -1 * m;
			b = 1;
			c = a*x1 + b*y1;
		}    
    }
        
    // line2d l, point2d p
    // The polynomial judgement!
	this.intersection = function (l , p) {
		
		var D = (a * l.b) - (b * l.a);
        
		if (D == 0) {
			p.x = 0;
			p.y = 0;
			return false;
		}
		else {
			p.x=(c*l.b - b*l.c) / D / 1.0;
			p.y=(a*l.c - c*l.a) / D / 1.0;
            return true;
		}	
	}

    this.distance = function (p) {        
        return Math.abs (a * p.x + b * p.y + c) / Math.sqrt (Math.pow (a, 2) + Math.pow (b, 2));
    }
};

if (typeof module !== 'undefined')
	module.exports = line2d;
