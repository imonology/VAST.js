// Matcher for 	SPS system.

//imports
require('./common.js');
const path = require('path')

// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = matcher

function matcher(isGateway, host, port, x, y, radius, onJoin, broker) {

	//console.log("broker: "+broker)
	// Setup socket for client <--> matcher communication
	const _http = require('http').createServer();
	const _io = require('socket.io')(_http, {
		cors: {
			origin: "*"
		}
	});

	var _addr;

	// adress used for client sockets
	var socketAddr;

	// socket connection to global server used for data capture and visualisation
	const _ioClient = require('socket.io-client');
	var GS;
	var connectedGS = false;

	// either set property "host : STATIC_IP_ADDRESS" or hostname depending on setup
	var GSaddr = {hostname : "127.0.0.1", port : 7776};

	var requireGS = false; // set whether to use the GS

	// matches a socket to a connectionID
	var _socketID2clientID = this.socketID2clientID = {};
	var _clientID2socket =  this.clientID2socket = {}

	var mqttID2clientID = this._mqttID2clientID = {};
	var clientID2mqttID = this._clientID2mqttID = {};

	var _clientList = {};

	var _connectionCount = 0;
	var _clientCount = 0;

	// list of subscriptions (clientID is primary key, subID is secondary key)
	var _subscriptions = {};

	// convenient list of only subs hosted by me
	var _hostSubs = {};


	// VON peer ID, VON GW address and VON peer setup
	var _id = isGateway === true ? VAST.ID_GATEWAY : VAST.ID_UNASSIGNED;
	var _GWaddr = { host: host, port: port };
	var _x = x==null || x == undefined ? Math.random()*CONF.x_lim : x;
	var _y = y==null || y==undefined ? Math.random()*CONF.y_lim : y;
	var _radius = radius==undefined ? 1 : radius;
	var _pos = new VAST.pos(_x,_y);
	var _aoi  = new VAST.area(_pos, _radius);


	var _broker = this.broker = broker;
	var _useMQTT = false;
	if (this.broker != null)
		_useMQTT = true;

	console.log("VAST::matcher => useMQTT: "+_useMQTT);

	// Reference to self
	var _that = this;

	var _onJoin = onJoin;

	var _vonPeer = new VON.peer();

	var _init = function(callback){

        // initialise VON peer
        _vonPeer.init(_id, _addr.host, _addr.port, _that, function(addr){
            _addr = addr;

            _vonPeer.join(_GWaddr, _aoi, function(id){
                _id = id;
                console.log('VON peer joined successfully with id: ' + _id);

                _initListeners();
				_listen();
				
				if(typeof callback === 'function'){
					callback();
				}
				if (typeof _onJoin == 'function'){
					onJoin(_id);
				}
            })
        })
	}

	// This function is called in VON peer when a message of type VON_Message.MATCHER_FORWARD is received
	var l_handlePacket = this.handlePacket = function(pack){
		var msg = pack.msg;

		switch (pack.type) {

			// Trying to find matcher id, address and client port for a client joining at msg.pos
			case Matcher_Message.FIND_MATCHER: {
				// I am the acceptor node and the client is connected to me (client made connection to the assigned matcher)
				if (_clientID2socket[msg.clientID] !== undefined) {
					var client_pack = {
                            matcherID : _id,
                            matcherAddr : socketAddr,
                            clientID : msg.clientID,
						}

					_clientID2socket[msg.clientID].emit('confirm_matcher', client_pack);

					//Add client to my permanent list
					_clientList[msg.clientID] = {
                        id: msg.clientID,
                        pos: msg.pos,
                        matcherID: _id
                    }

					_sendGSMessage(GS_Message.CLIENT_UPDATE);
				} 
                else { // client is not connected, need to send my address back to source
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
            break;

            }

            // The new matcher ID, address for a client has been found
            case Matcher_Message.FOUND_MATCHER: {
                // I am connected to the client
                if (_clientID2socket[msg.clientID] !== undefined) {

                    //TODO: create a pending client list and only assign a new matcher if the client is still
                    //awaiting connection
                    var client_pack = {
                        matcherID : msg.matcherID,
                        matcherAddr : msg.matcherAddr,
                        clientID : msg.clientID,
                    }
                    _clientID2socket[msg.clientID].emit('assign_matcher', client_pack);

                }
            break;
            }

             // Overlapping / distant publication is being received by relevant peers
			case Matcher_Message.PUB: {

				//console.log(_id + ': Publication from matcher '+pack.sender);
				//console.log(pack);

				var pub = msg;
				pub.recipients = pack.recipients;
				pub.chain = pack.chain;

				_sendPublication(pub, true);
            break;
            }

			// Subscription matched a publication. Pub is being forwarded to the target matcher and client
			case Matcher_Message.PUB_MATCHED: {

				//console.log(_id + ': Matched Publication from matcher '+pack.sender);
				//console.log(msg);

				var pub = msg;
				//pub.chain = Object.values(pub.chain).concat(Object.values(pack.chain));

				_sendPublication(pub, false);
            break;
            }

			// A new subscription is being added. I am an overlapping peer
			case Matcher_Message.SUB_NEW : {
            //console.log(_id + ': New Sub from matcher: '+pack.sender);
            //console.log(msg);
            var sub = msg;

            // update recipients to the subscription
            sub.recipients = pack.recipients

            _addSubscription(sub, false);
            break;
            }
			// A subscription was deleted
			case Matcher_Message.SUB_DELETE : {
				//console.log(_id + ': Sub deletion from matcher: '+pack.sender);
				//console.log(msg);
				_deleteSubscription(msg);
            break;
            }

            default: {
            //console.log('Matcher['+_id+'] received a packet from Matcher [' + from_id+']');
                    //console.log(pack);
                }
        }
	}

	// this initialises the listener for socket events between the client and matcher
	var _initListeners = function(){

		// Client connections
		//--------------------
		_io.on('connection', function(socket){

			_connectionCount++;

			socket.emit('request_info', _id);

			socket.on('client_info', function(info){

				//TODO: unique client IDs independant of GW (such that clients can enter at any node

				// client is new and I am GW
				if(_id == VAST.ID_GATEWAY && (info.clientID == -1 || info.matcherID == VAST.ID_UNASSIGNED)){
					// assign a clinetID to the new client
					_clientCount++;
					var clientID = info.hostname + '-' + _clientCount; // multiple clients on same host
				}
				// client already has an ID,
				else if (info.clientID !== -1 || undefined){
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

				// todo: moving client gets assigned to new matcher

				_deleteClient(clientID);

				// notify visualiser
				_sendGSMessage(GS_Message.CLIENT_UPDATE);

				//console.log("Client["+clientID+"] disconnected from Matcher["+_id+']');

				return false;
			});

			// publish a message
			socket.on('publish', function(data) {
				var clientID = _socketID2clientID[socket.id];
				_publish(clientID, data.x, data.y, data.radius, data.payload, data.channel);

			});

			// subscribe to an AOI
			 socket.on('subscribe', function(msg){
			 var clientID = _socketID2clientID[socket.id];
			 console.log("subscribe message from client <"+clientID+">")
				_subscribe(clientID, msg.x, msg.y, msg.radius, msg.channel);

			});

			// unsubscribe
			socket.on('unsubscribe', function(subID){
				var clientID = _socketID2clientID[socket.id];
				console.log("unsubscribe message from client <"+clientID+">")
				_unsubscribe(clientID, msg.x, msg.y, msg.radius, msg.channel)
			});

			//move
			socket.on('move', function(msg){
				var clientID = _socketID2clientID[socket.id];
			});

		});
	}

	var _listen = function () {
		// console.log(_id + 'listening on '+ socketAddr.port);

		if (_http.listening){
			return;
		}

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
	var _publish = this._publish = function(clientID, x, y, radius, payload, channel, done){

		var clientID = clientID
		if (_useMQTT == true) {
			var mqttID = clientID
			this._setPublishCallback(done)
			clientID = this.hashcode(mqttID)
		}

		var aoi = new VAST.area(new VAST.pos(x, y), radius);
		var pub = new VAST.pub(_id, clientID, aoi, payload, channel);
		var areaPacket = new VAST.areaPacket(Matcher_Message.PUB, pub, _id, _pos, aoi);
		_vonPeer.areaMessage(areaPacket);

		//inform GS
		_sendGSMessage(GS_Message.PUB_NEW, pub);
	}

	// after receiveing publication, check subs and sned to matching clients or
	// to the sub owner position
	// forwardFurther sets wether the mathcer should foward the publication to
	// externally mathcered subscriptions.
	var _sendPublication = this._sendPublication = function(publication, allowForwarding){
		var pointPacket;
		var pub = new VAST.pub();
		pub.parse(publication);

		var clientSubs, sub;
		var matcherTargets = [];

		for (var i in _subscriptions) {
			clientSubs = _subscriptions[i]

			/* Allow clients to receive messages from themself?
			if(i == pub.clientID){
					continue;
			}
			*/

			for (var j in clientSubs){
				sub = clientSubs[j];

				if(sub.channel !== pub.channel){
					//Not on the right channel
					continue;
				}

				// the publication is covered by one of my subscriptions
				if(sub.aoi.intersectsArea(pub.aoi)){

					// I am the host to this subscription, send pub on the subbed client's socket
					if(sub.hostID === _id){
						//console.log('sending pub to client: ' + i )
						//console.log(pub);
						//console.log(_clientList);

						// TODO: build a queue for clients still connecting
						// for now, volatile emit for QoS = 0
						try {

							if (_useMQTT == true) {

								var packet = JSON.parse(pub.payload)
								packet.payload = Buffer.from(packet.payload.data)

								//console.log('Using MQTT to send spatial message to client with clientID '+sub.clientID)
								//console.log(clientID2mqttID)

								var mqttID = clientID2mqttID[sub.clientID]
								var client = _that.broker.clients[mqttID]
								//console.log('Using MQTT to send spatial message to client with mqttID '+mqttID)
								//console.log(client)
								if (client) {
									//console.log('Client is defined to sending message')
									client.publish(packet, client, _that.publishDone)
									//console.log('Done sending message')
								}
							} else {
								_clientID2socket[sub.clientID].volatile.emit('publication', pub);
							}

						}
						catch {
							console.log('ID: '+_id+'; no socket for client: ' + sub.clientID);
						}
					}

					// I am not the host, so I must forward the publication to the owner if I am
					// the nearest recipient to the subscription
					else {

						// only forward if the host to the matched sub has not yet received the publication
						if (allowForwarding === true && pub.recipients.includes(sub.hostID) === false
						&& matcherTargets.includes(sub.hostID) === false){

							matcherTargets.push(sub.hostID);
							pointPacket = new VAST.pointPacket(Matcher_Message.PUB_MATCHED, pub, _id, _pos, sub.hostPos);

							// All the nodes that have received the publication AND are recipints to the current sub;
							// ie, everybody on this list will want to send a pub_matched event to the host matcher.
							var checklist = pub.recipients.filter(function(elem){
								return sub.recipients.includes(elem);
							});

							// set the checklist of the pointPacket
							pointPacket.checklist = checklist;

							// will only forward if I am closest to the host between all nodes in checklist
							_vonPeer.pointMessage(pointPacket, pub.recipients);
						}
					}
				}
			}
		}
	}


	// Called when client requests removing a subscription. Remove sub object with unique ID

	var _unsubscribe = this._unsubscribe = function(clientID, x, y, radius, channel) {
		var clientID = clientID
		if (_useMQTT == true) {
			clientID = this.hashcode(clientID)
		}


    // create the new sub object
    var aoi = new VAST.area(new VAST.pos(x, y), radius);
		var subID = 0
    var unsub = new VAST.sub(_id, _pos, clientID, subID, channel, aoi);

    var areaPacket = new VAST.areaPacket(Matcher_Message.SUB_DELETE, unsub, _id, _pos, unsub.aoi);


    // Check whether subscription really exists
		if (_subscriptions.hasOwnProperty(clientID)) {
      var clientSubs = clientSubs = _subscriptions[clientID]
      for (var j in clientSubs) {
        sub = clientSubs[j];

        if (sub.channel !== unsub.channel) {
          // Not on the right channel
          continue;
        }

        // the publication is covered by one of my subscriptions
        if (sub.aoi.equals(unsub.aoi)) {

          // I am the host to this subscription, send pub on the subbed client's socket
          if (sub.hostID === _id) {

            //if (_subscriptions[clientID].hasOwnProperty(subID)){
            //var sub = _subscriptions[clientID][subID]

            // Send a sub_delete message to all relevant neighbours (me included)

            var areaPacket = new VAST.areaPacket(Matcher_Message.SUB_DELETE, sub, _id, _pos, sub.aoi);
            _vonPeer.areaMessage(areaPacket);
          }
        }
      }
    }


		if (_useMQTT == false) {
			_clientID2socket[clientID].emit('unsubscribe_r', sub);
			//socket.emit('unsubscribe_r', sub);
		}
	}

	// Subscription adding and maintenance

	// Called when client requests a new subscription. Creates new sub object with unique ID
	var _subscribe = this._subscribe = function(clientID, x, y, radius, channel) {

		var clientID = clientID
		if (_useMQTT == true) {
			var mqttID = clientID
			clientID = this.hashcode(clientID)

			this._mqttID2clientID[mqttID] = clientID
			this._clientID2mqttID[clientID] = mqttID

			/*console.log("_mqttID2clientID:")
			//console.log(this._mqttID2clientID)
			//console.log("_clientID2mqttID: ")
			console.log(this._clientID2mqttID)
			*/
		}

		// create the new sub object
		var aoi = new VAST.area(new VAST.pos(x, y), radius);
		var subID = _generate_subID(clientID);
		var sub = new VAST.sub(_id, _pos, clientID, subID, channel, aoi);
		var areaPacket = new VAST.areaPacket(Matcher_Message.SUB_NEW, sub, _id, _pos, aoi);
		_vonPeer.areaMessage(areaPacket);

		// add the subscription to our list, and respond to client
		_addSubscription(sub, true);

		if (_useMQTT == false) {
			_clientID2socket[clientID].emit('subscribe_r', sub);
		}

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
			// add sub to list
			var temp = _subscriptions[new_sub.clientID] || {};
			temp[new_sub.subID] = new_sub;
			_subscriptions[new_sub.clientID] = temp;

			// add to convenient list (used only for global visualiser,
			// each matcher only sends the subs that it hosts)
			if (new_sub.hostID === _id){
				_hostSubs[new_sub.clientID] = temp;
				_sendGSMessage(GS_Message.SUB_UPDATE);
			}

			//console.log('subscriptions for matcher['+_id+'], client['+new_sub.clientID+']:');
			//console.log(_subscriptions[new_sub.clientID]);
			return true;
		}
		}

	var _deleteSubscription = function(sub) {

		// check whether we actually have subs listed for this client
		if (_subscriptions.hasOwnProperty(sub.clientID)){

			// delete the subscription
			//console.log(_subscriptions)
			delete _subscriptions[sub.clientID][sub.subID];
			//console.log(_subscriptions)
			// if client list is empty, delete client reference
			if (Object.keys(_subscriptions[sub.clientID]).length == 0){
				delete _subscriptions[sub.clientID];
			}
      //console.log(_subscriptions)

    }

		// Only convenience for global visualiser
		if (_hostSubs.hasOwnProperty(sub.clientID)){
			delete _hostSubs[sub.clientID][sub.subID];

			if (Object.keys(_hostSubs[sub.clientID]).length === 0){
				delete _hostSubs[sub.clientID];
			}
		}

		// inform GS
		_sendGSMessage(GS_Message.SUB_UPDATE);

		console.log('deleting subscription for matcher['+_id+'], subID: '+sub.subID);
		//console.log(_subscriptions[sub.clientID]);
		return true;
	}

	var _deleteClient = function(clientID){
		// delete client from my list
		try{
			delete _socketID2clientID[_clientID2socket[clientID].id];
		}
		catch{

		}
		delete _clientID2socket[clientID];
		delete _clientList[clientID];


	    /*
		var aoi = new VAST.area();
		var msg, sub;

		// Delete client's subscriptions. (Relevant neighbours will be notified)
		for (var key in _subscriptions[clientID]){
			sub = _subscriptions[clientID][key];

			// Send a sub_delete message to all relevant neighbours (me included)
			var areaPacket = new VAST.areaPacket(Matcher_Message.SUB_DELETE, sub, _id, _pos, sub.aoi);
			_vonPeer.areaMessage(areaPacket);
		}
		*/

		_connectionCount--;

		_sendGSMessage(GS_Message.CLIENT_UPDATE);
	}

	// Global Server Connection
	//---------------------------
	var _initGS = function(){
		// Connect to GS
		GS = _ioClient.connect('http://' + GSaddr.host +':' + GSaddr.port);


		// The matcher/peer is only allowed to join the p2p network if it has a connection
		// to the global server (for data collection purposes)

		GS.on('connect', function(){
			// _sendGSMessage(GSMessage.MATCHER_JOIN);
		});

		GS.on('confirm_join', function(){
			// first time connecting (not a reconnect), and we are not yet in VON
			if((connectedGS === false) && (typeof(_id) === 'undefined')){
				// only join VON if we are connected to GS and if we are new
				connectedGS = true;

				// wait until I am done joining the VON and setting up
				_init(function(){
					_sendGSMessage(GS_Message.MATCHER_JOIN);
				});

			} // this is a reconnect
			else{
				_sendGSMessage(GS_Message.MATCHER_JOIN);
			}
		});

		GS.on('request_update', function(){
			_sendGSMessage(GS_Message.VON_DATA);
			_sendGSMessage(GS_Message.CLIENT_UPDATE);
			_sendGSMessage(GS_Message.SUB_UPDATE);
		})

		GS.on('duplicate_id', function(){
			console.log('we have a duplicate id');
		});

		GS.on('connect_error', (error) => {
			//console.log('connection error');
			//console.log(error);
		})

		GS.on('connect_timeout', (timeout) => {
			//console.log('timeout');
			//console.log(timeout);
		})
	}

	// Messages sent to the GS
	var _sendGSMessage = function(type, msg){
		if (requireGS === true && GS.connected === true){

			switch (type){

				case GS_Message.MATCHER_JOIN :{
					// send VON data when joining
					var data = {
						id : _id,
						aoi: _aoi,
						//neighbours : _vonPeer.list()
					}
					//console.log(_vonPeer.list());
					GS.emit('matcher_join', data);
				}
				break;

				case GS_Message.VON_DATA :{
					var data = {
						id : _id,
						aoi: _aoi,
						//neighbours : _vonPeer.list()
						//neighbours : JSON.parse(_vonPeer.getVoronoi().get_sites())
					}
					//console.log(_vonPeer.list());
					//console.log(data.neighbours);
					GS.emit('von_data', data);
				}
				break;

				case GS_Message.CLIENT_UPDATE :{
					var data = {
						id : _id,
						clients : _clientList
					}
					GS.emit('client_update', data);
				}
				break;

				case GS_Message.SUB_UPDATE :{
					var data = {
						id : _id,
						subscriptions : _hostSubs
					}
					GS.emit('sub_update', data);
				}
				break;

				case GS_Message.PUB_NEW :{
					GS.emit('pub_new', msg);
				}
				break;
			}
		}
	}

	// Helper Functions

	var _setPublishCallback = this._setPublishCallback = function (publishDone) {
		this.publishDone = publishDone
	}


	var _generate_subID = function(clientID){
		//check the list of existing IDs for client to avoid duplicates
		var count = 0;
		var newID = clientID+'-'+_randomString(5);

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

	//INIT
	// get local IP
	// set address and port for VON and client sockets
	// only call init when this is set
	UTIL.getIPAddress(function(localIP){
		
		_addr = {host: localIP, port : 8000};

		socketAddr = {host: localIP, port:20000};

		// get ip address for GS
		if (requireGS === true){
			if (GSaddr.hasOwnProperty('hostname')){
				UTIL.lookupIP(GSaddr.hostname, function(addr){
					GSaddr.host = addr;
					_initGS();
				});
			} else if (GSaddr.hasOwnProperty('host')){
				_initGS();

			// insufficient adrress details. Abort connection to GS and init
			}else{
				requireGS = false;
				_init();
			}

		}
		else{
			_init();
		}
	});

	var hashcode = this.hashcode = function(s) {
		return s.split("").reduce(function (a, b) {
			a = ((a << 5) - a) + b.charCodeAt(0);
			return a & a
		}, 0);
	}
}



