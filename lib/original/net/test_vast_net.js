

/*
    unit test for vast_net

    2012.07.05
*/


var vast_net = require('./vast_net');  

var net = undefined; 

// set default IP/port
var ip_port = {host: VAST.Settings.IP_gateway, port: 37};

// get input IP / port
// check port input, if any
var port = process.argv[2];    
if (port !== undefined) {
    console.log('custom port: ' + port);
    ip_port.port = port;
}

var host = process.argv[3];
if (host !== undefined) {
    console.log('custom host: ' + host);
    ip_port.host = host;
}
    
// check whether to run server or not
// server
if (process.argv.length <= 3) {

    net = new vast_net(
        function (id, msg) {
            console.log('[' + id + '] in: ' + msg);
        
            // respond
            net.send(id, 'BACK: ' + msg);
        },

        // connect callback
        function (id) {
            console.log('[' + id + '] connected');
        },
        
        // disconnect callback
        function (id) {
            console.log('[' + id + '] disconnected');
        }        
    );
    
    net.listen(ip_port.port, function (port) {
        console.log('listen success, port binded: ' + port);
    });
}
// client
else {

    console.log('client host: ' + ip_port.host + ' port: ' + ip_port.port);
    
    net = new vast_net(
        function (id, msg) {
            console.log('[' + id + '] in: ' + msg);        
        },
        
        // connect callback
        function (id) {
            console.log('[' + id + '] connected');
        },
        
        // disconnect callback
        function (id) {
            console.log('[' + id + '] disconnected');
        }           
    );
    
    for (var i=1; i <= 10; i++) {
        
        // 50-50 chance of providing target address 
        if (Math.random() * 100 > 50)
            net.storeMapping(i, ip_port);    
        net.send(i, 'Hello ' + i + 'th world!');    
    }    

    /*
    // optional: test disconnect
    for (var i=1; i <= 10; i++) {        
        net.disconnect(i);
    } 
    */
}