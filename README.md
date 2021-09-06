
# vast.js

## How to use

The following example initializes vast.js to a plain Node.JS
HTTP server listening on port `3000`.

```js
var server = require('http').Server();
var vast = require('vast.js')(server);

vast.on('connection', function (socket) {

	// to perform a spatial publication
	socket.publish({name: John}, {center: [35, 45], radius: 100});
	
	// to subscribe a radius
	socket.subscribe({center: [50, 33], radius: 100}, function (node) {
		// move subscribed area to another center point
		node.move({center: [55, 33]});
	});
  
	// receive subscribed messages
	socket.on('message', function (data){});
	
	// receive enter / leave messages
	socket.on('enter', function (node){});
	socket.on('leave', function (node){});

	// process disconnection from network
	socket.on('disconnect', function(){});
});
server.listen(3000);
```

### Standalone

```js
var vast = require('vast.js')();
vast.on('connection', function(socket){});
vast.listen(3000);
```

### In conjunction with ImonCloud



## License

GPLv3
