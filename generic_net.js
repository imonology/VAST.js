//
// generic_net:     A generic network layer that supports net basics
//                      connect/disconnect/send/recv/stat
//

// parameters
var port = 1037;        // local server listen port


// Include the event emitter class - the generic network is a specialized
// instance of the event emitter and will emit the events:
//
// - data / response
// - error / errorType (HTTP Status code)

var EventEmitter = require( "events" ).EventEmitter;
var net = require( 'net' );
var Hash = require( "./hash.js" ); 

// map from socket id to socket object
var sockets = new Hash();

// Create an instance of our event emitter.
var net_layer = new EventEmitter();

// connect to a particular host and obtain a socket ID
net_layer.connect = function(port, host){

    var sock = net.createConnection( port, host );
    var sock_id = null;
    
    // handles callback
    sock.addListener( 'connect', function() {
        console.log( "generic_net: connection established to: " + host + ":" + port);
        
        // generate a sock_id
        while( true ) {
            sock_id = Math.floor( Math.random()*1000 )
                                   
            // test for existence
            if( sockets.has( sock_id ) == true )
                continue;
            
            // insert socket object
            sockets.set( sock_id, sock );
            
            break;
        }
                       
        // notify the socket's ID
        net_layer.emit( "connected", sock_id );
    });
    
    sock.addListener( 'close', function() {
        console.log("generic_net: disconnected from " + host + ":" + port);
        
        net_layer.emit( "disconnected", sock_id );
    });
    
    sock.addListener( 'error', function (e) {
        console.log( "generic_net: error connecting to: " + host + ":" + port + "\nerror: " + e);
    });

    sock.addListener( 'data', function( data ){

        try {
            // forward the received data to event handler
            console.log ( "incoming data from " + sock_id );
            net_layer.emit( "data", sock_id, data );
        } catch( e ){
            console.log("exception (" + e.name + "): " + e.message);
            
            // notify error
            net_layer.emit( "error", "socket data receive error" );
        }
    }); 
};

// disconnect a socket
net_layer.disconnect = function( target ){
    if( sockets.has( target ) == false )
        return false;
        
    var socket = sockets.get( target );
    socket.end();
    
    // remove from sockets mapping
    sockets.remove( target );
    return true;
};

// send a message to a given socket
// returns whether write to kernel buffer is successful
net_layer.send = function( target, message ){
    
    console.log( "sending to: " + target + " msg: " + message );
        
    // check if socket connection exists
    if( sockets.has( target ) == false )
        return false;
                
    var socket = sockets.get( target );
    
    return socket.write( message );        
};
  
// create simple socket server
var server = net.createServer( function( socket ) {
    console.log( "server gets connection, remote is: " + socket.remoteAddress );
    
    //socket.write("Echo server\r\n");
    //socket.pipe(socket);
    
    //socket.addListener( "data", ... );
    
    socket.addListener( "connection", function() {
        console.log( "server incoming socket established, remote is: " + socket.remoteAddress );
    });
    
    // generate socket id & store it
});

// try to bind listen port
var bind_success = false;

while( bind_success != true) {

    try {
        // adjust port
        server.listen(port+1, "127.0.0.1");
        console.log( "server now listens at port: " + port);
    } catch( e ) {
        console.log("exception (" + e.name + "): " + e.message);
        
        // notify error
        //net_layer.emit( "error", "socket bind error, adjusting bind port number" );
        port++;
        continue;
    }
    break;
}
    
// expose the generic network layer
module.exports = net_layer;