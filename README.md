
# vast.js

## How to use

The following example initializes vast.js to a plain Node.JS
HTTP server listening on port `3000`.

```js

var server = require('http').Server();
var vast = require('vast.js')(server);
vast.on('connection', function(socket){
  socket.on('event', function(data){});
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
