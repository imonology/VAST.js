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
	var socketAddr = {host: '127.0.0.1', port:20000}; // default address, port to listen for clients

	// matches a socket to a connectionID
	var _socketID2clientID = {};
    var _clientID2socket = {};

	// 
	var _clientList = {};

	var _connectionCount = 0;
	var _subscriptionCount = 0;

	// list of subscriptions
	var _subscriptions = {};

	//list of subIDs for each client
	var _client2subID ={};

	// VON peer ID, VON GW address and VON peer setup
	var _id;
	var _GWaddr = { host: host, port: port };
	var _vonPeer = new VON.peer();
	var _x = x==null || x == undefined ? Math.random()*1000 : x;
    var _y = y==null || y==undefined ? Math.random()*1000 : y;
	var _radius = radius==undefined ? 1 : radius;
	var _pos = new VAST.pos(_x,_y);
	var _aoi  = new VAST.area(_pos, _radius);

	// Reference to self
	var _that = this;

	var _onJoin = onJoin;

	var _init = function(){
		//initialise VON Peer
		// after init the peer will bind to a local port
		_vonPeer.init((isGateway ? VAST.ID_GATEWAY : VAST.ID_UNASSIGNED), _GWaddr.port, _that, function (local_addr) {
			_addr = local_addr;
			
			_vonPeer.join(_GWaddr, _aoi,

				// when finished joining, do callback
				function (id) {
					if (typeof _onJoin == 'function')
					onJoin();

					_id = id;

					_initialiseListener();
					_listen();

					LOG.warn('joined successfully! id: ' + id + '\n');
				

					//console.log(_id + ': neighbours: ');
					//console.log(_vonPeer.list())

					
					// send generic message to a random aoi
					/*
					if (_id === 9){
						//var sendpos = new VAST.pos(Math.random()*1000, Math.random()*1000);
						var sendpos = new VAST.pos(100,800)
						var sendAoI = new VAST.area(sendpos, 1000);
						var msg = 'ID: ' + id + 'sending message to pos: '+sendpos.x + '; '+sendpos.y; 
						var pack = new VAST.areaPacket(15, msg, _id, _pos, sendAoI);
						_vonPeer.areaMessage(pack);
					}
					*/
				}
			);
		});
	}

    // This function is called in VON peer when a message of type VON_Message.MATCHER_FORWARD is received
	var l_handlePacket = this.handlePacket = function(from_id, pack){
        var msg = pack.msg;

		switch (pack.type) {

            // Trying to find matcher id, address and client port for a client joining at msg.pos
            case Matcher_Message.FIND_MATCHER: {

				// I am the acceptor node and the client is connected to me (client made connection to the assigned matcher)
				if(_clientID2socket[msg.clientID] !== undefined){
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

					var new_pack = new VAST.pointPacket(Matcher_Message.FOUND_MATCHER, new_msg, _id, _pos, pack.sourcePos);
					_vonPeer.pointMessage(new_pack);
                }                   
            }
            break;

            // The new matcher ID, address for a client has been found
            case Matcher_Message.FOUND_MATCHER: {
                // I am connected to the client 
                if (_clientID2socket[msg.clientID] !== undefined){

                    //TODO: create a pending client list and only assign a new matcher if the client is still 
                    //awaiting connection
                    var client_pack = {
                        matcherID : msg.matcherID,
                        matcherAddr : msg.matcherAddr,
                        clientID : msg.clientID,
                    }
                    _clientID2socket[msg.clientID].emit('assign_matcher', client_pack);
                }
            }
            break;

            // Overlapping / distant publication is being received by relevant peers
            case Matcher_Message.PUB: {

				console.log(_id + ': Publication from matcher '+pack.sender);
				console.log(msg);

				var pub = msg;
				pub.recipients = pack.recipients;
				
				_sendPublication(msg);
            }
            break;

			// Subscription matched a publication. Pub is being forwarded to the target matcher and client
            case Matcher_Message.PUB_MATCHED: {

				console.log(_id + ': Publication from matcher '+pack.sender);
				console.log(msg);
				
				_sendPublication(msg);
            }
            break;

			// A new subscription is being added. I am an overlapping peer
            case Matcher_Message.SUB_NEW : {
				console.log(_id + ': New Sub from matcher: '+pack.sender);
				console.log(msg);
				var sub = msg;

				// update recipients to the subscription
				sub.recipients = pack.recipients

				_addSubscription(sub, false);
            }
			break;

            default: {
                console.log('Matcher['+_id+'] received a packet from Matcher [' + from_id+']');
                console.log(pack);
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
					//socket.disconnect();
					return;
				}
				
				// Map the client ID to its socket
                _socketID2clientID[socket.id] = clientID;
                _clientID2socket[clientID] = socket;

                // Send message to accepting matcher
                var msg = {
                    clientID : clientID,
                    pos : info.pos,
                    source : _id
                }

                var pack = new VAST.pointPacket(Matcher_Message.FIND_MATCHER, msg, _id, _pos, info.pos);
                _vonPeer.pointMessage(pack);
                
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
				_publish(clientID, data.x, data.y, data.radius, data.payload, data.channel);
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
		// console.log(_id + 'listening on '+ socketAddr.port);

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

	// when a new pub is sent by a client, send the pub over VON to relevant peers
	var _publish = function(clientID, x, y, radius, payload, channel){
		var aoi = new VAST.area(new VAST.pos(x, y), radius);
		var pub = new VAST.pub(_id, clientID, aoi, payload, channel);
		var areaPacket = new VAST.areaPacket(Matcher_Message.PUB, pub, _id, _pos, aoi);
		_vonPeer.areaMessage(areaPacket);
	}

	// after receiveing publication, check subs and sned to matching clients or 
	// to the sub owner position
	var _sendPublication = function(publication){
		var pointPacket;
		var pub = new VAST.pub();
		pub.parse(publication);

		for (var key in _subscriptions){

			var sub = _subscriptions[key];

			if(sub.clientID === pub.clientID){
			// Don't send pub back to publishing client
				continue;
			}

			if(sub.channel !== pub.channel){
				//Not on the right channel
				continue;
			}

			// the publication is covered by one of my subscriptions
			if(sub.aoi.intersectsArea(pub.aoi)){

				// I am the host to this subscription, send pub on the subbed client's socket
				if(sub.hostID === _id){
					_clientID2socket[sub.clientID].emit('publication', pub);
				}

				// I am not the host, so I must forward the publication to the owner if I am
				// the nearest recipient to the subscription
				else{
					pointPacket = new VAST.pointPacket(Matcher_Message.PUB_MATCHED, pub, _id, _pos, sub.hostPos);
					_vonPeer.pointMessageRecipients(pointPacket, pub.recipients, sub.recipients);
				
					// demonstrate multiple pub issue
					//_vonPeer.pointMessage(pointPacket);
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
		var sub = new VAST.sub(_id, _pos, clientID, subID, channel, aoi);
		var areaPacket = new VAST.areaPacket(Matcher_Message.SUB_NEW, sub, _id, _pos, aoi);
		_vonPeer.areaMessage(areaPacket);

		// add the subscription to our list, and respond to client
		_addSubscription(sub, true);
		_clientID2socket[clientID].emit('subscribe_r', sub);
	}

	var _addSubscription = function (sub) {

		var new_sub = new VAST.sub();
		new_sub.parse(sub);

        // do not add if there's an existing subscription
        if (_subscriptions.hasOwnProperty(new_sub.subID)) {
        //    LOG.layer("matcher::addSubscription => subscription already exists. Update instead");
        //    _updateSubscription(new_sub.subID,sub.aoi);
            return false;
        }

		else {
			_subscriptions[new_sub.subID] = new_sub;
			console.log('subscriptions for matcher['+_id+']:');
			console.log(_subscriptions);
			return true;
		}
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


