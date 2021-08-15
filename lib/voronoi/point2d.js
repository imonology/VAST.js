

function point2d(x, y) {

	this.x = (typeof x == 'undefined' ? 0 : x);
    this.y = (typeof y == 'undefined' ? 0 : y);

    // public variables & methods
    this.set = function (x, y) {
    	this.x = (typeof x == 'undefined' ? 0 : x);
        this.y = (typeof y == 'undefined' ? 0 : y);
    }

    // check if this point is smaller than another point
    this.lessThan = function (a) {
        return (this.y < a.y ? true : (this.x < a.x));
    }

    // compare this point with another point, and return (-1, 0, 1) for less than, equal, or greater than
    this.compareTo = function (a) {
        if (this.y < a.y)
            return (-1);
        if (this.y > a.y)
            return (1);
        if (this.x < a.x)
            return (-1);
        if (this.x > a.x)
            return (1);
        return (0);
    }

    // check distance of this point to another
    this.distance = function (p) {

        var dx = p.x - this.x;
        var dy = p.y - this.y;
        //console.log ("point2d distance called, dx: " + dx + " dy: " + dy + " this.x: " + this.x + " this.y: " + this.y + " p.x: " + p.x + " p.y: " + p.y);

        return Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
    }

    this.dist_sqr = function (p) {
        var dx = p.x - this.x;
        var dy = p.y - this.y;
        return Math.pow(dx, 2) + Math.pow(dy, 2);
    }

    this.to_string = function () {
        return '(' + this.x + ', ' + this.y + ')';
    }
};

/*
point2d.prototype.distance = function (p) {

    var dx = p.x - this.x;
    var dy = p.y - this.y;
    //console.log ("point2d distance called, dx: " + dx + " dy: " + dy + " this.x: " + this.x);

    return Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
}
*/

if (typeof module !== 'undefined')
	module.exports = point2d;
