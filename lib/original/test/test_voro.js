
// Include the necessary modules.
//var Hash = require( "./hash.js" );

/*
var point2d = require( "./typedef/point2d.js" );
var segment = require( "./typedef/segment.js" );
var line2d = require( "./typedef/line2d.js" );
*/

var point2d = point2d || require( "./typedef/point2d.js" );
var segment = segment || require( "./typedef/segment.js" );
var line2d  = line2d  || require( "./typedef/line2d.js" );

var Voronoi = require( "../../voronoi/vast_voro.js" );
var voro = new Voronoi();

var points = [];
var n = process.argv[2];
var x_dim = 1000;
var y_dim = 1000;
var _radius = process.argv[3];

// build site list & print
for (var i=0; i < n; i++)
{
    points[i] = new point2d(Math.floor(Math.random() * x_dim), Math.floor(Math.random() * y_dim));
    voro.insert(i+1, points[i]);

    //console.log ((i+1) + "({x: " + points[i].x + ", y: " + points[i].y + "});");
}

// test generic Voronoi functions

/*
// print edges
var edges = voro.getedges();
for (var i=0; i < edges.length; i++) {
    var p1 = edges[i].va;
	var p2 = edges[i].vb;

	console.log("p1 = (" + p1.x + "," + p1.y + ") p2 = (" + p2.x + "," + p2.y + ")");
}
*/

//
// unit tests
//

var test_contains = function () {

    console.log('\ntest is_contains()');

    // test contain()
    var testpt = new point2d((x_dim/2), (y_dim/2));
    for (var i = 1; i <= n; i++) {

        var contains = voro.contains(i, testpt);
        if (contains)
            console.log( i + ' contains (' + testpt.x + ', ' + testpt.y + '): ' + contains);
    }
}

var test_is_boundary = function() {

    console.log('\ntest is_boundary()');

    var testpt = new point2d((x_dim/2), (y_dim/2));

    // test is_boundary()
    // check whether is given node is boundary neighbor for a given point & radius
    for (var i=1; i <= n; i++) {

        var radius = x_dim/10*8;
        //console.log('check if node ' + i + ' is within ' + radius + ' of (' + testpt.x + ', ' + testpt.y + ')');

        if (voro.is_boundary(i, testpt, radius))
            console.log('site ' + i + ' is boundary of ' + testpt.to_string() + ' within ' + radius);
    }
}

var test_is_enclosing = function () {

    console.log('\ntest is_enclosing()');

    // test is_enclosing()
    // check all nodes and find enclosing neighbors of node 1
    for (var i=1; i <=n; i++) {

        var center_node = 1;

        if (voro.is_enclosing(i, center_node) == true)
            console.log('site ' + i + ' is enclosing to: ' + center_node);
    }
}

var test_get_en = function () {

    console.log('\ntest get_en()');

    // test get_en()
    var test_en_id = 1;
    var test_lvl = 1;

    for (var level = 1; level <= test_lvl; level++) {
        var en_list = voro.get_en(test_en_id, level);
        for (var i=0; i < en_list.length; i++)
            console.log('site ' + test_en_id + ' has level ' + level + ' en[' + i + ']: ' + en_list[i]);
    }
}

var test_get_AoI = function () {
    console.log("\ntest get_AoI()");

    var test_neighbour_id = 1;

    var neighbour_list = voro.get_AoI(test_neighbour_id, _radius);
    for (var i=0; i < neighbour_list.length; i++)
        console.log('site ' + test_neighbour_id + ' neighbour[' + i + ']: ' + neighbour_list[i]);
}

var test_get_neighbours = function () {
    console.log("\ntest get_neighbour()");

    var test_neighbour_id = 1;

    var neighbour_list = voro.get_neighbour(test_neighbour_id, 100);
    for (var i=0; i < neighbour_list.length; i++)
        console.log('site ' + test_neighbour_id + ' neighbour[' + i + ']: ' + neighbour_list[i]);

}

var test_neighbour_density = function () {
    console.log("\ntest neighbour_density()");

    var neighbour_total = 0;

    for (var i = 1; i <= n; i++) {
        var neigh_list = voro.get_neighbour(i,_radius);
        var count = neigh_list.length;
        neighbour_total += count;
    }

    var neighbour_average = neighbour_total/n;
    console.log("Client density is " + neighbour_average);
}


// test overlaps()
// go over all regions to find ones overlapped with a circle
var test_overlaps = function () {

    var pos = new point2d(100, 100);
    var radius = 500;

    console.log('\ntest overlaps() (non-accurate)');
    // go over each site
    for (var id = 1; id <= n; id++) {
        if (voro.overlaps(id, pos, radius))
            console.log('region ' + id + ' overlaps with ' + pos.to_string() + ' with radius: ' + radius);
    }

    console.log('\ntest overlaps() (accurate)');
    // go over each site
    for (var id = 1; id <= n; id++) {
        if (voro.overlaps(id, pos, radius, true))
            console.log('region ' + id + ' overlaps with ' + pos.to_string() + ' with radius: ' + radius);
    }
}

// test closest_to()
var test_closest_to = function () {

    console.log('\ntest closest_to()');

    // set test point to be the center
    var testpt = new point2d(x_dim/2, y_dim/2);

    var id = voro.closest_to(testpt);
    console.log('closest site to center ' + testpt.to_string() + ' is: ' + id);

    return id;
}

// test various accessors for internal data
var test_accessors = function () {

    console.log('\ntest various accessors');

    // print size
    console.log('total size: ' + voro.size());

    // get_bounding_box()
    var bbox = voro.get_bounding_box();
    console.log('(bbox) left: ' + bbox.xl + ' right: ' + bbox.xr + ' top: ' + bbox.yt + ' bottom: ' + bbox.yb);

    // print stat
    var result = voro.get_result();
    console.log('cells: ' + result.cells.length + ' edges: ' + result.edges.length + ' exec time: ' + result.execTime);


}

// run unit tests
//test_contains();
//test_is_boundary();
//test_is_enclosing();
//test_get_en();
//test_get_AoI();
//test_get_neighbours();
test_neighbour_density();
//test_overlaps();
//test_closest_to();
//test_accessors();
