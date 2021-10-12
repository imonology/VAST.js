//
//  Test sample for using the generic network layer
//
//
// demo for using generic_net to connect / disconnect / send / recv socket messages
//

// Include the necessary modules.
var sys = require( "sys" );

var Hash = require( "./hash.js" );
var point2d = require( "./typedef/point2d.js" ); 
var segment = require( "./typedef/segment.js" ); 
var line2d = require( "./typedef/line2d.js" ); 

/*
var point2d = VASTTypes.point2d;                // check if necessary
var line2d = VASTTypes.line2d;                

var SFVoronoi = require( "./sf_voronoi.js" );

var pt1 = new point2d(100, 200);
var pt2 = new point2d(200, 200);
*/ 
console.log( "before connect attempt..." );