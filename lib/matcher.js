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

	// address and port for client socket connections
	var socketAddr = {host: '127.0.0.1', port:10000}; // default address, port to listen for clients

	// matches a socket to a connectionID
	var _socketID2clientID = {};
    var _clientID2socket = {};

	// 

	var _connectionCount = 0;
	var _subscriptionCount = 0;

	// list of subscriptions
	var _subscriptions = {};
	var _client2subID;



	
	// VON peer ID, VON GW address and VON peer setup
	var _id;
	var _GWaddr = { host: host, port: port };
	var vonPeer = new VON.peer();
	var x = x==null || x == undefined ? Math.random()*1000 : x;
    var y = y==null || y==undefined ? Math.random()*1000 : y;
	var radius = radius==undefined ? 1 : radius;
	var aoi  = new VAST.area(new VAST.pos(x,y), radius);

	// Reference to self
	var _that = this;

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
							var pack = new VAST.matcherPack(15, 'Ive Joined, ID: ' + id, _id);
							pack.targets = [];
                            for(var i = 1; i < _id; i++){
                                pack.targets.push(i);
                            }
							vonPeer.matcherMessage(pack);
							console.log('sent packet?')
						}
	
					}
				);
			});
		}

	var _propagate = function(pack){
		// send message up the propagation chain
		var target = pack.propagationChain.pop();
		pack.targets = [];
		pack.targets.push(target);
		vonPeer.matcherMessage(pack);
		console.log('propagating message to' + target);
	}

        // This function is called in VON peer when a message of type VON_Message.MATCHER_FORWARD is received by the peer
	var l_handlePacket = this.handlePacket = function(from_id, pack){
        var msg = pack.msg;
		console.log(msg);

		switch (pack.type) {

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

                    // Add myself to the source chain
                    pack.propagationChain.push(_id);
                    
                    // re-assign target for the request
                    pack.targets = [];
                    pack.targets.push(closest);
                    vonPeer.matcherMessage(pack);

                }else{
                    // I am the acceptor
                    LOG.debug('Sending my ID, address back to the source');

                    pack.type = Matcher_Message.FOUND_MATCHER;

					var new_msg = {
                        matcherID : _id,
                        matcherAddr : socketAddr,
                        clientID : msg.clientID,
                        pos : msg.pos
                    }

					pack.msg = new_msg;

                    // send message back up the source chain
					_propagate(pack);
                }                   
            }
            break;

            // Receive the new matcher ID, adress for one of our clients
            case Matcher_Message.FOUND_MATCHER: {
                // I am the original source (I have the client) 
                if (pack.src == _id){

                    //TODO: create a pending client list and only assign a new matcher if the client is still 
                    //awaiting connection
                    var client_pack = {
                        matcherID : msg.matcherID,
                        matcherAddr : msg.matcherAddr,
                        clientID : msg.clientID,
                    }
                    _clientID2socket[msg.clientID].emit('assign_matcher', client_pack);
                }
                else{
					_propagate(pack);
                }    
            }
            break;

            // Receive a publication from another matcher
            case Matcher_Message.PUBLICATION : {
                    
            }
            break;

            // Receive a subscription from another matcher
            case Matcher_Message.SUB_NOTIFY : {
                    
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

		_io.on('connection', function(socket){

			console.log("client joined, requesting info");

			socket.emit('request_info', _id);

            socket.on('client_info', function(info){
                console.log('clinet info');
                if(_id == VAST.ID_GATEWAY && (info.clientID == -1 || info.matcherID == VAST.ID_UNASSIGNED)){
                    // client is new and we are GW
                    _connectionCount++;
                    var clientID = _connectionCount;
                    _socketID2clientID[socket.id] = clientID;
                    _clientID2socket[clientID] = socket;

                    // FIND MATCHER
                    var msg = {
                        clientID : clientID,
                        pos : info.pos,
                        source : _id
                    }

                    var pack = new VAST.matcherPack(Matcher_Message.FIND_MATCHER, msg, _id);
                    l_handlePacket(_id, pack);
                }
            });


			//handle a disconnect
			socket.on('disconnect', function(id){
				var id = _socketID2clientID[socket.id];
				//delete _connectionInfoList[id];
				console.log("connection <"+id+"> disconnected");
		
				return false;
			});
	  
			//publish a message
			socket.on('publish', function(data){
				
				var aoi = new VAST.area(new VAST.pos(data.x, data.y), data.radius);

				if(!_clients.hasOwnProperty(data.clientID)){
					// client is not yet connected, dont publish
				}
				else{
					_pub(data.clientID, aoi, data.payload, data.channel);
				}
			});
	  
		  //subscribe to an AOI
		  socket.on('subscribe', function(msg){
			  id = _socketID2clientID[socket.id];
	  
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
			  var id = _socketID2clientID[socket.id];
			  var info =
			  {
				  id: id,                                   				// id
				  socketID: socket.id,                                    // socket
				  x: msg.x,                                               // x coordinate of client
				  y: msg.y,                                               // y coordinate of client
				  AoIRadius: msg.AoI                                      // radius of AoI (currently make it large enough that they will always send to each other)
			  };
			  _connectionInfoList[id] = info;
	  
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

	// HELPER FUNCTIONS

	// Publications
	var _pub = function(clientID, aoi, payload, channel){
		var msg = {
			matcherID : _id,
			clientID : clientID,
			aoi: aoi,
			payload : payload,
			channel : channel
		};

		for(var key in _subscriptions){
			var sub = _subscriptions[key];

			if(sub.clientID == clientID){
				// Don't send pub back to self
				// continue;
			}

			if(sub.channel !== channel){
				//Not on the right channel
				continue;
			}

			if(sub.aoi.covers(aoi)){
				if(sub.hostID == _id){
					// I am the host to this subscription, send pub on the client's socket
					_clientID2socket[clientID].emit('publication', msg);
				}
				else{
					var pack = VAST.matcherPack(Matcher_Message.PUBLICATION, msg, _id);
					pack.sourceChain = sub.propagation_chain
					l_handlePacket(_id, pack);
				
					var target = pack.sourceChain.pop();
					pack.targets = [];
					pack.targates.push(target);
					vonPeer.matcherMessage(pack);				
				}
			}
		}
	}





	// Subscription adding and maintenance

	var _addSubscription = function (sub, is_owner) {
        LOG.layer("matcher::addSubscription => adding subscription to matcher.", _self.id);

        // do not add if there's an existing subscription
        if (_subscriptions.hasOwnProperty(sub.subID)) {
            LOG.layer("matcher::addSubscription => subscription already exists. Update instead");
            _updateSubscription(sub.subID,sub.aoi,is_owner);
            return false;
        }

        if (!_client2subID.hasOwnProperty(sub.id)) {
            _client2subID[sub.id] = [];
        }

        // add to client's list of subs
        _client2subID[sub.id].push(sub.subID);

        // recreate sub so that internal functions that were lost in transfer over socket can be reestablished
        var new_sub = new VAST.sub();
        new_sub.parse(sub);

        // record a new subscription
        _subscriptions[new_sub.subID] = new_sub;

        // add type to connections for publication checking
        connections[new_sub.id] = new_sub.type;

        LOG.layer("matcher::addSubscription => connections:", _self.id);
        LOG.layer(connections, _self.id);

        LOG.layer("matcher::addSubscription => subscription successfully added. New subscription list:", _self.id);
        LOG.layer(_subscriptions);

        // check to see if the sub needs to be propogated to other matchers
        _checkOverlap(new_sub);

        return true;
    }





	_init();
}
// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = matcher;


