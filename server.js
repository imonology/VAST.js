
var net = require('net');

var server = net.createServer(function (socket) {

  socket.addListener('error', function(e){
      console.log("error occur: " + e);
  });
  
  socket.write("Echo server\r\n");
  socket.pipe(socket);
});



server.listen(1037, "127.0.0.1");
console.log( "server now listens at port 1037" );

