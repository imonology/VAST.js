//
//  Test sample for using the generic network layer
//
//
// demo for using generic_net to connect / disconnect / send / recv socket messages
//

// Include the necessary modules.
var sys = require( "sys" );

 // Include the Generic Network layer
var net_layer = require( "./generic_net.js" ); 

// handle 'data' event
net_layer.on(    
    "data",
    function( from, data ){
        console.log( "data: " + data );
    }
);

// handle 'error' event
net_layer.on(    
    "error",
    function( errorType ){
        console.log( "connect error: " + errorType );
    }
);
    
// handle 'connected' event
net_layer.on(    
    "connected",
    function( handle ){
        console.log( handle + " has connected" );
        
        console.log( "connID: " + handle + " send result: " + net_layer.send( handle, "GET /\n" ) );
    }
);    

// handle 'disconnect' event
net_layer.on(    
    "disconnected",
    function( handle ){
        console.log( handle + " has disconnected" );
    }
);    

console.log( "before connect attempt..." );

// check command-line parameter
var port = 1037;
var IP = "127.0.0.1";

if( process.argv[2] != null )
    IP = process.argv[2];
if( process.argv[3] != null )
    port = process.argv[3];    

var connID = net_layer.connect( port, IP );



// keep doing something

//net_layer.disconnect(connID);

