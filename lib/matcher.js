// Matcher for 	SPS system. 

//imports
require('./common');


function matcher(isGateway, host, port, x, y, radius) {
	// Setup socket for client <--> matcher communication
	const _http = require('http').createServer();
	const _io = require('socket.io')(_http, { 
		cors: {
			origin: "*"
		}
	});
	// list of subscriptions
	var subscriptions = {};

	// matches a socket to a connectionID
	var connectionsMap = {};
	var connectionInfoList = {};

	var connectionCount = 0;
	var subscriptionCount = 0;

	var ClientPort = 10000; // default port to listen for clients


	var _that = this;

	var _msg_handler;
	var _id;
	var _GWaddr = { host: host, port: port };

	var vonPeer = new VON.peer();

	x = x==null || x == undefined ? Math.random()*1000 : x;
    y = y==null || y==undefined ? Math.random()*1000 : y;
	radius = radius==undefined ? 16 : radius;
	var aoi  = new VAST.area(new VAST.pos(x,y), radius);

	// This function is called in VON peer when a message of type VON_Message.MATCHER_FORWARD is received by the peer
	this.handlePacket = function(pack){
		console.log('packet received from VON peer');
		console.log(pack);

		// msg in packet will have it's own Matcher_Message type (pub, sub, move, etc) and will be handled here

		/*
		var msg = pack.msg;
		switch (msg.type) {
		
		
		}
		*/
	}

	var _init = function(){
		//initialise VON Peer
		// after init the peer will bind to a local port
			vonPeer.init((isGateway ? VAST.ID_GATEWAY : VAST.ID_UNASSIGNED), _GWaddr.port, _that, function (local_addr) {
				_addr = local_addr;
				
				vonPeer.join(_GWaddr, aoi,

					// when finished joining, do callback
					function (id) {
						_id = id;
						LOG.warn('joined successfully! id: ' + id + '\n');
					
						// send generic message to gateway over VON when joined
						if (_id != VAST.ID_GATEWAY){
							var pack = new VAST.pack(VON_Message.MATCHER_FORWARD, 'Ive Joined, ID: ' + id, VAST.priority.HIGHEST);
							pack.targets = [];
							pack.targets.push(VAST.ID_GATEWAY);
							vonPeer.matcherMessage(pack, true);
							console.log('sent packet?')
						}
	
					}
				);
			});
		}

		// this initialises the listener for socket events between the client and matcher
		// TODO: everything
		var _initialiseListener = function(){
		_io.on('connection', function(socket){
			connectionCount++;
			connectionID = 'M['+_id+']-C['+connectionCount+']';
		   	connectionsMap[socket.id] = connectionID;
	  
			console.log("client joined, requesting info");
			socket.emit('request_info', connectionID);
	  
		  //handle a disconnect
		  socket.on('disconnect', function(id){
			  var id = connectionsMap[socket.id];
			  delete connectionInfoList[id];
			  console.log("connection <"+id+"> disconnected");
	  
			  return false;
		  });
	  
		  //publish a message
		  socket.on('publish', function(msg){
	  
			  for (var key in subscriptions){
				  if(!subscriptions.hasOwnProperty(key)) continue;
				  var sub = subscriptions[key];
				  console.log(sub);
				  if (_contains(sub, msg.x, msg.y, msg.radius)){
					  console.log('sending message to' + sub.connectionID)
					  io.to(sub.socketID).emit('publication', msg); 
				  }
			  }
		  });
	  
		  //subscribe to an AOI
		  socket.on('subscribe', function(msg){
			  id = connectionsMap[socket.id];
	  
			  console.log("Client " + id + " subbed to" + msg.x + " , " + msg.y + ", AOI: " + msg.AoI);
	  
			  _subscribe(id, socket.id, msg.x, msg.y, msg.AoI);
		  });
	  
		  //unsubscribe
		  socket.on('unsubscribe', function(x, y, AoI){
			  // need a robust way of unsubbing.
			  // perhaps unsubbing from the sub centred nearest to [x,y] in request? Or unsubbing from all subs that contain [x,y]?
			  // OR unsubbing using a subID (requires a list of subs to be kept by client and matcher, and it needs to be validated)   
		  });
	  
		  //move
		  socket.on('move', function(msg){
			  var id = connectionsMap[socket.id];
			  var info =
			  {
				  id: id,                                   				// id
				  socketID: socket.id,                                    // socket
				  x: msg.x,                                               // x coordinate of client
				  y: msg.y,                                               // y coordinate of client
				  AoIRadius: msg.AoI                                      // radius of AoI (currently make it large enough that they will always send to each other)
			  };
			  connectionInfoList[id] = info;
	  
			  console.log("Moving client " + id + " to " + info.x + " , " + info.y);
			  socket.emit('moved', info);
	  
		  });
	  
	  });
	}

	var _listen = function () {

		_http.on('error', (e) => {
			
			// address already in use
			if (e.code === 'EADDRINUSE') {
			  console.log('Address in use, changing port...');
			  ClientPort++;
			  _listen();
			}
		  });
	
		_http.listen(ClientPort);
	}

	_init();
	_initialiseListener();
	_listen();
}
// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = matcher;


