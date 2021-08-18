// Matcher for 	SPS system. 

//imports
require('./common');

function matcher(isGateway, host, port, x, y, radius, onJoin) {
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

	//list of subIDs for each client
	var _client2subID ={};

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

	var _onJoin = onJoin;

	var _init = function(){
		//initialise VON Peer
		// after init the peer will bind to a local port
		vonPeer.init((isGateway ? VAST.ID_GATEWAY : VAST.ID_UNASSIGNED), _GWaddr.port, _that, function (local_addr) {
			_addr = local_addr;
			
			vonPeer.join(_GWaddr, aoi,

				// when finished joining, do callback
				function (id) {
					if (typeof _onJoin == 'function')
					onJoin();

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
					}

				}
			);
		});
	}

	this.sendTo = function(targets, msg){
		var pack = new VAST.matcherPack(15, msg, _id);
		pack.targets = targets;
		vonPeer.matcherMessage(pack)
	}

	var _propagate = function(pack){
		// send message up the propagation chain
		var target = pack.propagationChain.pop();
		pack.targets = [];
		pack.targets.push(target);
		vonPeer.matcherMessage(pack);
	}


    // This function is called in VON peer when a message of type VON_Message.MATCHER_FORWARD is received
	var l_handlePacket = this.handlePacket = function(from_id, pack){
        var msg = pack.msg;

		switch (pack.type) {

            // Trying to find matcher id, address and client port for a client joining at msg.pos
            case Matcher_Message.FIND_MATCHER: {
                var closest = vonPeer.closest_to(msg.pos);

                if (closest === null) {
					LOG.warn('closest node is null, something is not right.. please check');
				}
                
				// I am not the acceptor
                if (closest !== null && vonPeer.contains(_id, msg.pos) === false &&
                    closest !== _id && closest != from_id) {

                    // Add myself to the source chain
                    pack.propagationChain.push(_id);
                    
                    // re-assign target for the request
                    pack.targets = [];
                    pack.targets.push(closest);
                    vonPeer.matcherMessage(pack);

                }
				
				// I am the acceptor node and the client is connected to me (client made connection to the assigned matcher)
				else if(_clientID2socket[msg.clientID] !== undefined){
					var client_pack = {
                        matcherID : _id,
                        matcherAddr : socketAddr,
                        clientID : msg.clientID,
                    }

					_clientID2socket[msg.clientID].emit('confirm_matcher', client_pack);
				} 

				// client is not connected, need to send my address back to source
				else{ 
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

            // The new matcher ID, address for a client has been found
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
				// I am not the source, only a link in the chain
                else{
					_propagate(pack);
                }    
            }
            break;

            // Overlapping / distant subscription received a publication. Pub is being forwarded to the target matcher and client
            case Matcher_Message.PUB_FORWARD : {

				console.log(msg);
				// Am I th owner of this subscription?
				if (msg.hostID == _id){
					var sub = _subscriptions[msg.subID];
					var aoi = new VAST.area();
					aoi.parse(msg.pub.aoi);

					// Ensure that the publication is still relevant to supposed subscription 
					if (sub.aoi.intersectsArea(aoi)){
						console.log(sub);
						console.log(msg.pub);
						_clientID2socket[sub.clientID].emit('publication', msg.pub);
					}
					// The other matcher has an inconsistent copy of the subscription
					else{
						// update subs
					}
				}else{
					// I am not the owner, send it up the chain
					_propagate(pack);
				}
            }
            break;

            // Receive a subscription from another matcher
            case Matcher_Message.SUB_NOTIFY : {
				var sub = msg;


				// Subscription is to a distant area (further than enclosing and boundary neighbours)
				// I am not the owner, I don't contain the center and the aoi doesn't overlap my region
				if (sub.hostID !== _id && !vonPeer.contains(sub.aoi.center) && !vonPeer.isOverlapping(sub.aoi)){
					sub.propagationChain.push(_id);
					pack.msg = sub;
					pack.targets = [];
                    pack.targets.push(vonPeer.closest_to(sub.aoi.center));
                    vonPeer.matcherMessage(pack);
					return;
				}

				// I am an overlapping neighbour to the subscription
				if (sub.hostID !== _id && vonPeer.isOverlapping(sub.aoi)){
					_addSubscription(sub, false);
				}
            }
            break;

            default: {
            //    console.log('Matcher['+_id+'] received a packet from Matcher [' + from_id+']');
            //    console.log(pack);
            }
		}	
	}

	// this initialises the listener for socket events between the client and matcher
	var _initialiseListener = function(){

		_io.on('connection', function(socket){

			socket.emit('request_info', _id);

            socket.on('client_info', function(info){
				//TODO: unique client IDs independant of GW (such that clients can enter at any node)

				// client is new and I am GW
                if(_id == VAST.ID_GATEWAY && (info.clientID == -1 || info.matcherID == VAST.ID_UNASSIGNED)){
                    // assign a clinetID to the new client 
                    _connectionCount++;
                    var clientID = _connectionCount;
				}
				// client already has an ID
				else if (info.clientID !== -1){
					var clientID = info.clientID;
				}
				// client is new but I am not GW. kick them
				else{
					socket.disconnect();
					return;
				}
				
				// Map the client ID to its socket
                _socketID2clientID[socket.id] = clientID;
                _clientID2socket[clientID] = socket;

                // FIND ACCEPTING MATCHER: (wont send VON message if it's me)
                var msg = {
                    clientID : clientID,
                    pos : info.pos,
                    source : _id
                }

                var pack = new VAST.matcherPack(Matcher_Message.FIND_MATCHER, msg, _id);
                l_handlePacket(_id, pack);
                
            });


			// handle a disconnect
			socket.on('disconnect', function(){
				var clientID = _socketID2clientID[socket.id];
				// delete client from my list
				delete _socketID2clientID[socket.id];
                delete _clientID2socket[clientID];

				console.log("Client["+clientID+"] disconnected from Matcher["+_id+']');
		
				return false;
			});
	  
			// publish a message
			socket.on('publish', function(data){
				var clientID = _socketID2clientID[socket.id];
				_pub(clientID, data.x, data.y, data.radius, data.payload, data.channel);
			});
	  
		 	// subscribe to an AOI
			socket.on('subscribe', function(msg){
				var clientID = _socketID2clientID[socket.id];		
				_subscribe(clientID, msg.x, msg.y, msg.radius, msg.channel);
			});
	  
			// unsubscribe
			socket.on('unsubscribe', function(subID){
  
			});
	  
			//move
			socket.on('move', function(msg){
				var clientID = _socketID2clientID[socket.id];
		
			});
	  
	  	});
	}

	var _listen = function () {

		_http.on('error', (e) => {
			
			// address already in use
			if (e.code === 'EADDRINUSE') {
			//  console.log('Address in use, changing port...');
			  socketAddr.port++;
			  _http.close();
			  _listen();
			}
		  });
	
		_http.listen(socketAddr.port);
	}

	// Publications
	var _pub = function(clientID, x, y, radius, payload, channel){
		var aoi = new VAST.area(new VAST.pos(x, y), radius);
		var pub = new VAST.pub(_id, clientID, aoi, payload, channel);

		for (var key in _subscriptions){

			var sub = _subscriptions[key];

			if(sub.clientID == clientID){
			// Don't send pub back to self
				continue;
			}

			if(sub.channel !== channel){
				//Not on the right channel
				continue;
			}

			// the publication is covered by one of my subscriptions
			if(sub.aoi.intersectsArea(aoi)){

				// I am the host to this subscription, send pub on the subbed client's socket
				if(sub.hostID == _id){
					_clientID2socket[sub.clientID].emit('publication', pub);
				}

				// I am not the host, so I must send the publication up the chain
				else{
					var msg = {
						hostID : sub.hostID,	// ID of host  matcher
						subID : sub.subID,		// matching subscription
						pub : pub				// publication to send to client
					}

					var pack = new VAST.matcherPack(Matcher_Message.PUB_FORWARD, msg, _id);
					pack.propagationChain = sub.propagationChain;
					_propagate(pack);
				}
			}	
		}
	}

	// Subscription adding and maintenance

	// Called when client requests a new subscription. Creates new sub object with unique ID
	var _subscribe = function(clientID, x, y, radius, channel){
		
		// create the new sub object
		var aoi = new VAST.area(new VAST.pos(x, y), radius);
		var subID = _generate_subID(clientID);
		var sub = new VAST.sub(_id, clientID, subID, channel, aoi);

		// add the subscription to our list, and respond to client
		_addSubscription(sub, true);
		_clientID2socket[clientID].emit('subscribe_r', sub);

	//	console.log('created a new subscription')
	//	console.log(sub);
	}

	var _addSubscription = function (sub, is_owner) {

		var new_sub = new VAST.sub();
		new_sub.parse(sub);

        // do not add if there's an existing subscription
        if (_subscriptions.hasOwnProperty(new_sub.subID)) {
        //    LOG.layer("matcher::addSubscription => subscription already exists. Update instead");
        //    _updateSubscription(new_sub.subID,sub.aoi);
            return false;
        }

		/* Only allow one subscription per client?
        if (!_client2subID.hasOwnProperty(new_sub.clientID)) {
            _client2subID[new_sub.clientID] = [];
        }
		*/

		if (_client2subID[new_sub.clientID] == undefined){
			_client2subID[new_sub.clientID] = [];
		}

        // add to client's list of subs
        _client2subID[new_sub.clientID].push(new_sub.subID);

		//add myself as a recipient
		new_sub.recipients.push(_id);

		// get list of neighbours that overlap with the subscription
		var overlapping = vonPeer.getOverlappingNeighbours(new_sub.aoi);
		if (overlapping.length > 0){
			new_sub.propagationChain.push(_id);
			var pack = new VAST.matcherPack(Matcher_Message.SUB_NOTIFY, new_sub, _id);
			pack.targets = overlapping;

			// notify overlapping neighbours
			vonPeer.matcherMessage(pack);
		}

		// record a new subscription
		_subscriptions[new_sub.subID] = new_sub;

        return true;
    }

	// Helper Functions

	var _generate_subID = function(clientID){
		//check the list of existing IDs for client to avoid duplicates
		var count = 0;
		var newID = 'C['+clientID+']-'+_randomString(9);

		/*
		while(_client2subID[clientID].hasOwnProperty(newID) && count < 100){
			newID = 'M['+_id+']-C['+clientID+']-'+_randomString(5);
			count++;
		}
		*/
		return newID;
	}

	var _randomString = function(length) {
		var result           = '';
		var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		var charactersLength = characters.length;
		for ( var i = 0; i < length; i++ ) {
			result += characters.charAt(Math.floor(Math.random() * 
			charactersLength));
		}
		return result;
	}





	_init();
}
// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = matcher;


