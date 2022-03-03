// Matcher for 	SPS system.

//imports
require('./common.js');

// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = matcher;

function matcher(x, y, radius, opts, onJoin) {

    let _default = {
        isGateway : false,
        GW_host : '127.0.0.1',
        GW_port : 8000,
        VON_port : 8001,
        client_port : 20000,
        useMQTT : false
    }

    // let is block-scoped, var is function scoped
    {
        // Assign GW setting, initial ID and alias
        let isGateway = opts.isGateway || _default.isGateway;
        var _id = isGateway === true ? VAST.ID_GATEWAY : VAST.ID_UNASSIGNED;
        var _alias = this.alias = opts.alias || 'Matcher';

        // Assign GW address
        let GW_host = opts.GW_host || _default.GW_host;
        let GW_port = opts.GW_port || _default.GW_port;
        var _GWaddr = { host: GW_host, port: GW_port };

        // Assign my VON and client listening ports
        var _VON_port = isGateway === true ? GW_port : opts.VON_port || _default.VON_port;
        var _client_port = opts.client_port || _default.client_port;
        
        // Set up MQTT broker
        var _useMQTT = opts.useMQTT || _default.useMQTT;
        if (_useMQTT === true && typeof(opts.broker) !== undefined){
            var _broker = this.broker = opts.broker;
        }
        
        // Define AoI and Position
        var _x = x == null || x == undefined ? Math.random()*CONF.x_lim : x;
        var _y = y == null || y == undefined ? Math.random()*CONF.y_lim : y;
        var _radius = radius == undefined ? 1 : radius;
        var _pos = new VAST.pos(_x,_y);
        var _aoi  = new VAST.area(_pos, _radius);
    }

    // Setup socket for client <--> matcher communication
	const _http = require('http').createServer();
	const _io = require('socket.io')(_http, {
		cors: {
			origin: "*"
		}
	});

    var _addr, _socketAddr;

    // set up log layers for debugging and for status updates
    let log = LOG.newLayer(_alias+'_debug', _alias+'_debug', 'logs_and_events', 4, 4);
    let results = LOG.newLayer('events', 'events', 'logs_and_events', 5, 5);

	// matches a socket to a connectionID
	var _socketID2clientID = this.socketID2clientID = {};
	var _clientID2socket =  this.clientID2socket = {}

	var _mqttID2clientID = this.mqttID2clientID = {};
	var _clientID2mqttID = this.clientID2mqttID = {};

	var _clientList = {};

	var _connectionCount = 0;
	var _clientCount = 0;

	// list of subscriptions (clientID is primary key, subID is secondary key)
	var _subscriptions = {};

	// convenient list of only subs hosted by me
	var _hostSubs = {};

	log.debug('Matcher['+_id+']: useMQTT: '+_useMQTT);

	// Reference to self
	var _that = this;

	var _onJoin = onJoin;

	var _vonPeer = new VON.peer();

    // _id must remane private
    this.id = function(){
        return _id
    }

	var _init = function(callback){

        // initialise VON peer
        _vonPeer.init(_id, _addr.host, _addr.port, _that, function(addr){
            _addr = addr;

            _vonPeer.join(_GWaddr, _aoi, function(id){
                _id = id;
                log.debug('Matcher['+_id+']: VON peer joined successfully');

                _initListeners();
				_listen();
				
				if(typeof callback === 'function'){
					callback();
				}
				if (typeof _onJoin == 'function'){
                    _recordEvent(Matcher_Event.MATCHER_JOIN);
					onJoin(_id);
				}
            })
        })
	}

	// This function is called in VON peer when a message of type VON_Message.MATCHER_FORWARD is received
	this.handlePacket = function(pack){
		var msg = pack.msg;

		switch (pack.type) {

			// Trying to find matcher id, address and client port for a client joining at msg.pos
			case Matcher_Message.FIND_MATCHER: {
				// I am the acceptor node and the client is connected to me (client made connection to the assigned matcher)
				if (_clientID2socket[msg.clientID] !== undefined) {
					var client_pack = {
                            matcherID : _id,
                            matcherAddr : _socketAddr,
                            clientID : msg.clientID,
						}

					_clientID2socket[msg.clientID].emit('confirm_matcher', client_pack);

					//Add client to my permanent list
					_clientList[msg.clientID] = {
                        id: msg.clientID,
                        pos: msg.pos,
                        matcherID: _id
                    }

					_recordEvent(Matcher_Event.CLIENT_JOIN, {client : _clientList[msg.clientID]});
				} 
                else { // client is not connected, need to send my address back to source
					log.debug('Matcher['+_id+']: FOUND MATCHER => Sending ID & address back to source');
					pack.type = Matcher_Message.FOUND_MATCHER;

					var new_msg = {
                        matcherID : _id,
                        matcherAddr : _socketAddr,
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

                    log.debug('Matcher['+_id+']: added Client['+msg.clientID+']');

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

				log.debug('Matcher['+_id+']: Received Publication from Matcher['+pack.sender+']', msg);

				var pub = msg;
				pub.recipients = pack.recipients;
				pub.chain = pack.chain;

				_sendPublication(pub, true);
            break;
            }

			// Subscription matched a publication. Pub is being forwarded to the target matcher and client
			case Matcher_Message.PUB_MATCHED: {

				log.debug('Matcher['+_id+']: Matched Publication from Matcher['+pack.sender+']', msg);

				var pub = msg;

				_sendPublication(pub, false);
            break;
            }

			// A new subscription is being added. I am an overlapping peer
			case Matcher_Message.SUB_NEW : {
            log.debug('Matcher['+_id+']: New Sub from Matcher['+pack.sender+']', msg);
            var sub = msg;

            // update recipients to the subscription
            sub.recipients = pack.recipients

            _addSubscription(sub, false);
            break;
            }
			// A subscription was deleted
			case Matcher_Message.SUB_DELETE : {
				log.debug('Matcher['+_id+']: Sub deletion from Matcher['+pack.sender+']', msg);
;
				_deleteSubscription(msg);
            break;
            }

            default: {
            log.debug('Matcher['+_id+']: received an unknown packet type from Matcher['+pack.sender+']', pack);

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
                    log.debug('Matcher['+_id+']: a new client has joined');
                }
				// client already has an ID,
				else if (info.clientID !== -1 || undefined){
					var clientID = info.clientID;
                    log.debug('Matcher['+_id+']: client['+clientID+'] has joined. Find matcher.');
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

				log.warn('Matcher['+_id+'] disconnected from Client['+clientID+']');

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
			 log.debug('Matcher['+_id+']: Received subscribe message from client['+clientID+']');
				_subscribe(clientID, msg.x, msg.y, msg.radius, msg.channel);

			});

			// unsubscribe
			socket.on('unsubscribe', function(subID){
				var clientID = _socketID2clientID[socket.id];
				log.debug('Matcher['+_id+']: Received unsubscribe message from client['+clientID+']');
				_unsubscribe(clientID, msg.x, msg.y, msg.radius, msg.channel)
			});

			//move
			socket.on('move', function(msg){
				var clientID = _socketID2clientID[socket.id];
			});

		});
	}

    // record updates to results file
    var _recordEvent = function(event, msg){
        switch (event){

            case Matcher_Event.MATCHER_JOIN :{
                var data = {
                    time : UTIL.getTimestamp(),
                    event : Matcher_Event.MATCHER_JOIN,
                    id : _id,
                    alias : _alias,
                    aoi: _aoi,
                    pos : _pos
                }

                results.printObject(data);
            }
            break;

            /*
            case Matcher_Event.MATCHER_MOVE :{
                var data = {
                    time : UTIL.getTimestamp(),
                    event : Matcher_Event.MATCHER_JOIN,
                    id : _id,
                    alias : _alias,
                    aoi: _aoi,
                    pos : _pos
                }

                results.printObject(data);
            }
            break;
            */

            case Matcher_Event.CLIENT_JOIN :{
                var data = {
                    time : UTIL.getTimestamp(),
                    event : Matcher_Event.CLIENT_JOIN,
                    id : _id,
                    alias : _alias,
                    client : msg.client
                }
                results.printObject(data);
            }
            break;

            /*
            case Matcher_Event.CLIENT_MOVE :{
                var data = {
                    time : UTIL.getTimestamp(),
                    event : Matcher_Event.CLIENT_MOVE,
                    id : _id,
                    alias : _alias,
                    client : msg.client
                }
                results.printObject(data);
            }
            break;
            */

            case Matcher_Event.CLIENT_LEAVE :{
                var data = {
                    time : UTIL.getTimestamp(),
                    event : Matcher_Event.CLIENT_LEAVE,
                    id : _id,
                    alias : _alias,
                    client : msg.client
                }
                results.printObject(data);
            }
            break;

            case Matcher_Event.SUB_NEW :{
                var data = {
                    time : UTIL.getTimestamp(),
                    event : Matcher_Event.SUB_NEW,
                    id : _id,
                    alias : _alias,
                    sub : msg.sub
                }
                results.printObject(data);
            }
            break;

            /*
            case Matcher_Event.SUB_UPDATE :{
                var data = {
                    time : UTIL.getTimestamp(),
                    event : Matcher_Event.SUB_UPDATE,
                    id : _id,
                    alias : _alias,
                    sub : msg.sub
                }
                results.printObject(data);
            }
            break;
            */

            case Matcher_Event.SUB_DELETE :{
                var data = {
                    time : UTIL.getTimestamp(),
                    event : Matcher_Event.SUB_DELETE,
                    id : _id,
                    alias : _alias,
                    sub : msg.sub
                }
                results.printObject(data);
            }
            break;

            case Matcher_Event.PUB :{
                var data = {
                    time : UTIL.getTimestamp(),
                    event : Matcher_Event.PUB,
                    id : _id,
                    alias : _alias,
                    pub : msg.pub
                }
                results.printObject(data);
            }
            break;
        }
    }

	var _listen = function () {
		 log.debug('Matcher['+_id+']: listening on '+ _socketAddr.port);

		if (_http.listening){
			return;
		}

		_http.on('error', (e) => {

			// address already in use
			if (e.code === 'EADDRINUSE') {
			    log.error('Matcher['+_id+']: Address in use, changing port...');
				_socketAddr.port++;
				_http.close();
				_listen();
			}
			});

		_http.listen(_socketAddr.port);
	}

	// Publications

	// when a new pub is sent by a client, send the pub over VON to relevant peers
	var _publish = this.publish = function(clientID, x, y, radius, payload, channel, done){

		if (_useMQTT == true) {
			var mqttID = clientID
			_setPublishCallback(done)
			clientID = this.hashcode(mqttID)
		}

		var aoi = new VAST.area(new VAST.pos(x, y), radius);
		var pub = new VAST.pub(_id, clientID, aoi, payload, channel);
		var areaPacket = new VAST.areaPacket(Matcher_Message.PUB, pub, _id, _pos, aoi);
		_vonPeer.areaMessage(areaPacket);

		//inform GS
		_recordEvent(Matcher_Event.PUB, {pub : pub});
	}

	// after receiveing publication, check subs and sned to matching clients or
	// to the sub owner position
	// forwardFurther sets wether the mathcer should foward the publication to
	// externally mathcered subscriptions.
	var _sendPublication = this.sendPublication = function(publication, allowForwarding){
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

						// TODO: build a queue for clients still connecting
						// for now, volatile emit for QoS = 0
						try {

							if (_useMQTT == true) {

								var packet = JSON.parse(pub.payload)
								packet.payload = Buffer.from(packet.payload.data)

								//log.debug('Using MQTT to send spatial message to client with clientID '+sub.clientID)
								//log.debug(clientID2mqttID)

								var mqttID = _clientID2mqttID[sub.clientID]
								var client = _that.broker.clients[mqttID]
								//log.debug('Using MQTT to send spatial message to client with mqttID '+mqttID)
								//log.debug(client)
								if (client) {
									//log.debug('Client is defined to sending message')
									client.publish(packet, client, _that.publishDone)
									//log.debug('Done sending message')
								}
							} else {
								_clientID2socket[sub.clientID].volatile.emit('publication', pub);
							}

						}
						catch {
							log.error('Matcher['+_id+']: no socket for client[' + sub.clientID+']');
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

	var _unsubscribe = this.unsubscribe = function(clientID, x, y, radius, channel) {
		var clientID = clientID
		if (_useMQTT == true) {
			clientID = this.hashcode(clientID)
		}


        // create the new sub object
        var aoi = new VAST.area(new VAST.pos(x, y), radius);
        var subID = 0
        var unsub = new VAST.sub(_id, _pos, clientID, subID, channel, aoi);
        var areaPacket = new VAST.areaPacket(Matcher_Message.SUB_DELETE, unsub, _id, _pos, unsub.aoi);

        var sub;

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
	var _subscribe = this.subscribe = function(clientID, x, y, radius, channel) {

		var clientID = clientID
		if (_useMQTT == true) {
			var mqttID = clientID
			clientID = this.hashcode(clientID)

			this.mqttID2clientID[mqttID] = clientID
			this.clientID2mqttID[clientID] = mqttID

			/*log.debug("_mqttID2clientID:")
			//log.debug(this._mqttID2clientID)
			//log.debug("_clientID2mqttID: ")
			log.debug(this._clientID2mqttID)
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
				//    log.layer("matcher::addSubscription => subscription already exists. Update instead");
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
				_recordEvent(Matcher_Event.SUB_NEW, {sub : new_sub});
			}

			//log.debug('subscriptions for matcher['+_id+'], client['+new_sub.clientID+']:');
			//log.debug(_subscriptions[new_sub.clientID]);
			return true;
		}
		}

	var _deleteSubscription = function(sub) {

		// check whether we actually have subs listed for this client
		if (_subscriptions.hasOwnProperty(sub.clientID)){

			// delete the subscription
			//log.debug(_subscriptions)
			delete _subscriptions[sub.clientID][sub.subID];
			//log.debug(_subscriptions)
			// if client list is empty, delete client reference
			if (Object.keys(_subscriptions[sub.clientID]).length == 0){
				delete _subscriptions[sub.clientID];
			}
            //log.debug(_subscriptions)

        }

		// Only convenience for global visualiser
		if (_hostSubs.hasOwnProperty(sub.clientID)){
			delete _hostSubs[sub.clientID][sub.subID];

			if (Object.keys(_hostSubs[sub.clientID]).length === 0){
				delete _hostSubs[sub.clientID];
			}
		}

		// inform GS
		_recordEvent(Matcher_Event.SUB_DELETE, {sub : sub});

		log.debug('Matcher['+_id+']: deleting subscription for matcher['+_id+'], subID: '+sub.subID);
		return true;
	}

	var _deleteClient = function(clientID){
		// delete client from my list
		
        // notify visualiser
        if (_clientList[clientID] !== undefined)
		    _recordEvent(Matcher_Event.CLIENT_LEAVE, {client : _clientList[clientID]});

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
	}

	// Helper Functions

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
		
		_addr = {host: localIP, port : _VON_port};

		_socketAddr = {host: localIP, port: _client_port};

        _init();

        /*
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
        */
	});

	var hashcode = this.hashcode = function(s) {
		return s.split("").reduce(function (a, b) {
			a = ((a << 5) - a) + b.charCodeAt(0);
			return a & a
		}, 0);
	}

    /*
	// Global Server Connection
	//---------------------------
	var _initGS = function(){
		// Connect to GS
		GS = _ioClient.connect('http://' + GSaddr.host +':' + GSaddr.port);


		// The matcher/peer is only allowed to join the p2p network if it has a connection
		// to the global server (for data collection purposes)

		GS.on('connect', function(){
			// _recordEvent(GSMessage.MATCHER_JOIN);
		});

		GS.on('confirm_join', function(){
			// first time connecting (not a reconnect), and we are not yet in VON
			if((connectedGS === false) && (typeof(_id) === 'undefined')){
				// only join VON if we are connected to GS and if we are new
				connectedGS = true;

				// wait until I am done joining the VON and setting up
				_init(function(){
					_recordEvent(Matcher_Event.MATCHER_JOIN);
				});

			} // this is a reconnect
			else{
				_recordEvent(Matcher_Event.MATCHER_JOIN);
			}
		});

		GS.on('request_update', function(){
			_recordEvent(Matcher_Event.VON_DATA);
			_recordEvent(Matcher_Event.CLIENT_UPDATE);
			_recordEvent(Matcher_Event.SUB_UPDATE);
		})

		GS.on('duplicate_id', function(){
			//log.debug('we have a duplicate id');
		});

		GS.on('connect_error', (error) => {
			//log.debug('connection error');
			//log.debug(error);
		})

		GS.on('connect_timeout', (timeout) => {
			//log.debug('timeout');
			//log.debug(timeout);
		})
	}

    */
}



