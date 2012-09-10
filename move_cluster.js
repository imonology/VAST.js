

//
//  cluster movement (originally written by Jiun-Shiang Chiou, adopted by Shun-Yun Hu)
//
//  2012-08-28 modified to javacript
//
//  methods:
//      clusterMovement(topleft, bottomright, num_nodes, speed)   
//      init()              initialize positions & attractors
//      move()              move all nodes
//      getpos(index)       get a current position for a node of a given index
//

var point2d = point2d || require( "./typedef/point2d.js" );

// % of chance of going to a random attractor
var PROB_RANDOM_ATTRACTOR = 20;
var ATTRACTOR_SPACE_MULTIPLIER = 3;

// how likely a teleport will occur in every 10,000 moves
var TELEPORT_CHANCE = 5;

// create a random position
var rand_pos = function (top_left, bottom_right) {
    var pos = new point2d(top_left.x + Math.floor(Math.random() * (bottom_right.x - top_left.x)),
                          top_left.y + Math.floor(Math.random() * (bottom_right.y - top_left.y)));
    return pos;
}

// topleft / bottomright are of objects {x,y}
var clusterMovement = function (topleft, bottomright, l_num_nodes, l_speed) {

    //
    // constructor
    //
         
    // dimensions of the world nodes move in
    var _dim = {x: bottomright.x - topleft.x, y: bottomright.y - topleft.y};
    
    // current destination coordinates of all nodes        
    var _dest = [];
    
    // current positions for each node
    var _pos = [];
    
    // number of attractors in the world
    var _num_attractors = Math.floor((1.5 * Math.log(l_num_nodes)) > 1 ? (1.5 * Math.log(l_num_nodes)) : 1);
    
    // attractor positions (of size _num_attractors)
    var _attractors = [];

    // setup attractor ranges
    // sphere in which the attractor is effective
    var _range = Math.sqrt ((_dim.x * _dim.y) / _num_attractors) / ATTRACTOR_SPACE_MULTIPLIER;


    //
    // public methods
    //
    
    this.init = function () {
    
        // create new positions & destination waypoint targets
        for (var i = 0; i < l_num_nodes; ++i) {
            _pos[i]  = rand_pos(topleft, bottomright);
            _dest[i] = rand_pos(topleft, bottomright);
        }

        reset_attractors();
    }

    // make each node move towards desintations
    this.move = function () {
    
        var dist, ratio;
        for (var i=0; i < l_num_nodes; ++i) {            
        
            dist = _dest[i].distance(_pos[i]);

            // move towards the destination one step
            var delta = new point2d(_dest[i].x - _pos[i].x, _dest[i].y - _pos[i].y);
            
            // adjust deltas for constant velocity            
            if ((ratio = dist / l_speed) > 1.0) {
                delta.x /= ratio;
                delta.y /= ratio;
            }

            // make changes to position            
            _pos[i].x += delta.x;
            _pos[i].y += delta.y;

            // set new destinations if already reached
            if (dist < 0.1)
            {
                // random waypoint
                var nearest;

                // 10% chance to go to a random attractor, otherwise go to nearest
                if (Math.random() * 100 < PROB_RANDOM_ATTRACTOR)
                    nearest = Math.floor(Math.random() * _num_attractors);
                else
                    nearest = find_nearest(_pos[i]);

                var tl = _attractors[nearest];
                tl.x -= _range;
                tl.y -= _range;                               
                tl = bound(tl);
                
                var br = _attractors[nearest];
                br.x += _range;
                br.y += _range;
                br = bound(br);

                // setup next destination
                _dest[i] = rand_pos(tl, br);			
            }

            if (TELEPORT_CHANCE > 0) {
                // a slight chance to simply teleport to a new location
                if (Math.random() * 10000 < TELEPORT_CHANCE) {
                    _pos[i] = rand_pos(topleft, bottomright);
                    _dest[i] = rand_pos(topleft, bottomright);
                }
            }            
        }
        
        return true;
    }

    // get current position for a particular node
    this.getpos = function (index) {
        if (index < 0 || index >= l_num_nodes)
            return undefined;
        return _pos[index]; 
    }
    
    
    //
    // internal methods
    //
    
    var reset_attractors = function () {
    
        // setup attractor locations
	    var i,j;
        for (i = 0; i < _num_attractors; ++i) {
            do
            {
                _attractors[i] = rand_pos(topleft, bottomright);

                // check if the new attractor is far apart enough from existing ones
                for (j=0; j<i; ++j)
                {
                    if (_attractors[i].distance (_attractors[j]) < (_range * ATTRACTOR_SPACE_MULTIPLIER))
                        break;
                }
            }                            
            while (i != j);
        }
    }
    
    // put adjust a coordinate to be within boundary
    var bound = function (c) {
        if (c.x < topleft.x)       c.x = topleft.x;
        if (c.y < topleft.y)       c.y = topleft.y;
        if (c.x > bottomright.x)   c.x = bottomright.x;
        if (c.y > bottomright.y)   c.y = bottomright.y;
        return c;
    }

    // find nearest attractors
    var find_nearest = function (c) {
		
        // set up new destination around the nearest attractors
        var min_dist = _dim.x + _dim.y;
        var curr_dist;
		var index = 0;
		
		// find the nearest attractor
		for (var j=0; j < _num_attractors; j++) {
            curr_dist = c.distance (_attractors[j]);
			if (curr_dist < min_dist) {
				min_dist = curr_dist;
				index = j;
			}
		}
        return index;
    }
} // end clusterMovement

// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = clusterMovement;




