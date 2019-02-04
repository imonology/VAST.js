/*
*
*           Movement point generator for scalability test
*
*/
var model = require('../lib/original/move_cluster.js');
var fs = require('fs');
var common = require('../lib/common.js');
var point2d = point2d || require( "../lib/voronoi/point2d.js" );

var NUM_NODES = process.argv[2];

var topleft = new point2d(0,0);
var bottomright = new point2d(1000,1000);

// initialise movement model
var movement = new model(topleft, bottomright, NUM_NODES, 1);

//  map of movement of each client
var _movement;

LOG.debug("Initialise movement model");
movement.init();

// movement counter
var count = 0;

LOG.debug("Start movement");
// run for 10 seconds
while (count < 1200) {
    movement.move();
    count++;
}
LOG.debug("Movement complete");

// get movement points
_movement = movement.getMove();

// set up write stream to write to file
var stream = fs.createWriteStream('MovementPoints200.txt');

LOG.debug("write to text file started");
// write to the text file
for (var i = 0; i < Object.keys(_movement).length; i++) {
    LOG.debug("Line number " + i + " written to text file");
    stream.write(i + ':' + _movement[i]+' \n');
}

LOG.debug("write to text file complete");

// end stream
stream.end();

LOG.debug("done");
