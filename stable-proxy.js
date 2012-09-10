
var port_proxy = 30;
var port_lobby = 66; 
var port_table = 55; 
var IP_server = "192.168.2.102";

var net = require('net');
var tls = require('tls');  // for using TLS encryption
var fs = require('fs');    // for file system access


// build a re-direction socket connection
function buildConnection(incoming, port, type) {

  var sock = net.createConnection(port, IP_server);

  sock.addListener('connect', function() {
    console.log("'" + type + "' server (" + IP_server + ":" + port + ") connected"); 
  });
 
  sock.addListener('close', function() {
    console.log("connection to "+ type +" server (" + IP_server + ") closed");
  });
 
  sock.addListener('error', function () {
    console.log("error connecting to "+type+" server (" + IP_server + ")");
  });

  sock.addListener('data', function(data){
    //console.log(data);
    try {
      incoming.write(data);
    } catch (e) {
      console.log("exception (" + e.name + "): " + e.message);
    }

  });

  return sock;
}
/*
// non-secure proxy
var server = net.createServer(function (socket) {
  console.log("incoming connection");
  //socket.write("Proxy server\r\n");
 
  // port: 5555 (table test), 6666 (lobby test) 
  // create redirection
  var sock = buildConnection(socket, 6666);
  socket.pipe(sock);
})
*/

var options = {
  key: fs.readFileSync('bc-key.pem'),
  cert: fs.readFileSync('bc-cert.pem')
};

var server_check = function(data) {
  console.log('data=' + data);
};

var server = tls.createServer(options, function (socket) {
  console.log("incoming TLS connection");

  // one-time listener for checking which server to connect
  var server_check = function(data) {
    console.log('server type=' + data);
    socket.removeListener('data', server_check);

    // connecting to lobby server
    if (data == "lobby") {
      var sock = buildConnection(socket, port_lobby, "lobby");
      socket.pipe(sock);
    }
    else if (data == "table") {
      var sock = buildConnection(socket, port_table, "table");
      socket.pipe(sock); 
    }
    // disconnect incoming connection if server is unrecongnized
    else {
      console.log('uncognized server type, disconnect stream');
      socket.destroy();
    } 
  };

  socket.addListener('data', server_check);
 
  socket.addListener('error', function(){
    console.log("socket disconnected");
  });

  socket.addListener('uncaughtException', function(err) {
    console.log("uncaught exception: " + err);
  });
  
})

server.addListener('secureConnection', function(cleartextStream) {
  console.log("secure stream authorized: " + cleartextStream.authorized);
  if (cleartextStream.authorized == false)
    console.log('error is:' + cleartextStream.authorizationError);
});

server.addListener('error', function(err) {
  console.log("proxy server error: " + err);
});

server.listen(port_proxy);
console.log("Proxy server started at port: " + port_proxy);

