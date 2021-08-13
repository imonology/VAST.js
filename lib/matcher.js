// Matcher for 	SPS system. 

//imports
require('./common');

function matcher(isGateway, host, port, x, y, radius) {
	// Setup socket for client <--> matcher communication
	const _app = require('express')();
	const _http = require('http').createServer(_app);
	const _io = require('socket.io')(_http, { 
		cors: {
			origin: "*"
		}
	});
	// list of subscriptions
	var subscriptions = {};

	// matches a socket to a connectionID
	var socketID2clientID = {};
    var clientID2socket = {};
	var connectionInfoList = {};

	var connectionCount = 0;
	var subscriptionCount = 0;

    var socketAddr = {host: '127.0.0.1', port:10000}; // default address, port to listen for clients

	var _that = this;

	var _id;
	var _GWaddr = { host: host, port: port };

	var vonPeer = new VON.peer();

	var x = x==null || x == undefined ? Math.random()*1000 : x;
    var y = y==null || y==undefined ? Math.random()*1000 : y;
	var radius = radius==undefined ? 1 : radius;
	var aoi  = new VAST.area(new VAST.pos(x,y), radius);

    var _findMatcher = function(pos){
        
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

						_initialiseListener();
						_listen();

						LOG.warn('joined successfully! id: ' + id + '\n');
					
						// send generic message to gateway over VON when joined
						if (_id != VAST.ID_GATEWAY){
							var pack = new VAST.pack(VON_Message.MATCHER_FORWARD, 'Ive Joined, ID: ' + id, VAST.priority.HIGHEST);
							pack.targets = [];
                            for(var i = 1; i < _id; i++){
                                pack.targets.push(i);
                            }
							vonPeer.matcherMessage(pack, true);
							console.log('sent packet?')
						}
	
					}
				);
			});
		}

        // This function is called in VON peer when a message of type VON_Message.MATCHER_FORWARD is received by the peer
	var l_handlePacket = this.handlePacket = function(from_id, pack){
		var msg = pack.msg;
		switch (msg.type) {

            // Trying to find matcher id, address and client port for a client joining at msg.pos
            case Matcher_Message.FIND_MATCHER: {
                var voro = vonPeer.getVoronoi();
                var closest = voro.closest_to(msg.pos);

                if (closest === null) {
					LOG.warn('closest node is null, something is not right.. please check');
				}
                
                if (closest !== null &&
					voro.contains(_id, msg.pos) === false &&
                    closest !== _id &&
                    closest != from_id) {
                    
                    // re-assign target for the request
                    pack.targets = [];
                    pack.targets.push(closest);
                    vonPeer.matcherMessage(pack, true);

                }else{
                    // I am the acceptor
                    LOG.debug('Sending my ID, address back to the source');
                    pack.targets = [];
                    pack.targets.push(msg.source);

                    var new_msg = {
                        type : Matcher_Message.FOUND_MATCHER,
                        matcherID : _id,
                        matcherAddr : socketAddr,
                        clientID : msg.clientID,
                        pos : msg.pos
                    }

                    pack.msg = new_msg;
                    vonPeer.matcherMessage(pack, true);
                }                   
            }
            break;

            // Receive the new matcher ID, adress for one of our clients
            case Matcher_Message.FOUND_MATCHER: {
                var new_pack = {
                matcherID : msg.matcherID,
                matcherAddr : msg.matcherAddr,
                clientID : msg.clientID,
                }
                clientID2socket[msg.clientID].emit('assign_matcher', new_pack);
            }
            break;

            default: {
                console.log('received packet from' + from_id);
                console.log(pack);
            }
		}	
	}

	// this initialises the listener for socket events between the client and matcher
	// TODO: everything
	var _initialiseListener = function(){
			
			_app.get('/', function(req, res)
			{
				//res.sendFile(__dirname + '/index.html');
			});


		_io.on('connection', function(socket){

			console.log("client joined, requesting info");
			socket.emit('request_info', _id);

            socket.on('client_info', function(info){
                console.log('clinet info');
                if(_id == VAST.ID_GATEWAY && (info.clientID == -1 || info.matcherID == VAST.ID_UNASSIGNED)){
                    // client is new and we are GW
                    connectionCount++;
                    var clientID = connectionCount;
                    socketID2clientID[socket.id] = clientID;
                    clientID2socket[clientID] = socket;

                    var msg = {
                        type : Matcher_Message.FIND_MATCHER,
                        clientID : clientID,
                        pos : info.pos,
                        source : _id
                    }

                    var pack = new VAST.pack(VON_Message.MATCHER_FORWARD, msg, VAST.priority.HIGHEST);
                    l_handlePacket(_id, pack);
                }
            });


		  //handle a disconnect
		  socket.on('disconnect', function(id){
			  var id = socketID2clientID[socket.id];
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
			  id = socketID2clientID[socket.id];
	  
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
			  var id = socketID2clientID[socket.id];
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
			  socketAddr.port++;
			  _http.close();
			  _listen();
			}
		  });
	
		_http.listen(socketAddr.port);
	}

	_init();
}
// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = matcher;


