
// unit test for net_nodejs.js

var net_nodejs = net_nodejs || require( "./net_nodejs" );

var net = new net_nodejs(

    // receive callback
    function (socket, msg) {
        console.log('incoming: ' + msg);
        
        // if I'm server, then return message
        if (net.isServer()) {
            var return_msg = 'RETURN: ' + msg;
            console.log('responding: ' + return_msg);
        
            net.send(return_msg, socket);
        }
    },
    
    // connect callback
    function (socket) {
    
        console.log(socket.host + ':' + socket.port + ' connected...');
        //console.log(socket.remoteAddress + ':' + socket.remotePort + ' connected...');
    
        // test send
        var msg = "GET /";
        net.send(msg);    
        
        // test disconnect
        net.disconnect();        
    },
    
    // disconnect callback
    function (socket) {        
        console.log(socket.host + ':' + socket.port + ' disconnected...');
        //console.log(socket.remoteAddress + ':' + socket.remotePort + ' disconnected...');
    } 
); 

for (var i=0; i < process.argv.length; i++)
    console.log(i + ': ' + process.argv[i]);

var ip_port = {host: "127.0.0.1", port: 37};

// check port input, if any
var port = process.argv[2];    
if (port !== undefined)
    ip_port.port = port;

var host = process.argv[3];
if (host !== undefined)
    ip_port.host = host;
    
// check whether to run server or not
// if parameter is not given, then it's a server
if (process.argv.length <= 3) {
    // test listen
    net.listen(ip_port.port);
}

else {

    // test making a connection to given ip_port
    net.connect(ip_port);
}
