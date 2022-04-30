
require('./common');

var Client_Message = {
    PING :  0,
    PONG :  1,
    MSG:    2
}

function client(host, port, id, x, y, radius, onMatcherAssigned){
    
    var log = LOG.newLayer('Clients_logs', 'Client_logs', 'logs_and_events', 5, 5);
    
    const io = require('socket.io-client');
    const crypto = require('crypto');
    var _io;

    var _id = id || 0;
    var _hostname = UTIL.getHostname();
	var _GWaddr = { host: host, port: port };
    var _matcherID = VAST.ID_UNASSIGNED;
    var _matcherAddr;
    var _onMatcherAssigned = onMatcherAssigned;
    var _subscriptions = {};

    var _x = x==null || x == undefined ? Math.random()*1000 : x;
    var _y = y==null || y==undefined ? Math.random()*1000 : y;
    var _radius = radius == null || radius == undefined ? 16 : radius;
	var _pos = new VAST.pos(_x,_y);

    var _pubCount = 0;


    // Performance Measurement - unused
    /*
    const PING_TIMEOUT = 10000; // 10s
    var PONGS = {};     // record of responses
    var PINGS = [];     // array of pings we have received

    var numPINGs = 0;
    var numPONGs = 0;

    // Only record PINGS and PONGS (messages between clients)
    var bytesSent = 0;      // bytes
    var bytesReceived = 0;  // bytess
    var msgsSent = 0;       // messages sent  
    var msgsReceived = 0;   // messages received
    */

    // stuff used by simulator/visualiser 2022/02/14
    var _alias = 'unnamed_client';
    this.getMatcherID = function(){
        return _matcherID;
    }

    this.setAlias = function(alias){
        _alias = alias; 
    }

    this.getAlias = function(){
        return _alias;
    }

    // Create socket connection with given host, port
    var _connect = this.connect = function(host, port){
        if(_io !== undefined){
            _io.close();
        }
        _io = io.connect('http://'+host+':'+port);
        
        // initialise event listeners
        _io.on('connect', function(){
            log.debug('Client['+_id+']: socket connected')
        });

        // Matcher requesting our info
        _io.on('request_info', function(info){
            var myInfo = {
                matcherID : _matcherID,
                matcherAddr : _matcherAddr,
                hostname : _hostname,
                clientID : _id,
                pos : _pos
            }
            _io.emit('client_info', myInfo);
        });

        // GW Matcher assigning an ID and host matcher
        _io.on('assign_matcher', function(pack){

            var newMatcher = (_matcherAddr !== pack.matcherAddr);
            _matcherID = pack.matcherID;
            _matcherAddr = pack.matcherAddr;
            _matcherPos = pack.matcherPos;
            _id = pack.clientID;

            log.debug('Client['+_id+']: being migrated to Matcher['+pack.matcherID+']');

            if (newMatcher)
            _connect(_matcherAddr.host, _matcherAddr.port);
        });

        // We are connected to our assigned matcher, so we are "properly" initialised
        _io.on('confirm_matcher', function(pack){
            _matcherID = pack.matcherID
            _matcherAddr = pack.matcherAddr;
            _matcherPos = pack.matcherPos;
            _id = pack.clientID;

            log.debug('Client['+_id+']: assigned to matcher['+_matcherID+']');

            if(typeof _onMatcherAssigned == 'function'){
                _onMatcherAssigned(_id);
            }
        });

        // Matcher confirming / updating subscription
        _io.on('subscribe_r', function(sub){
            var sub = sub;
            log.debug('Client['+_id+']: added a subscription:');
            log.debug(sub);
            _subscriptions[sub.subID] = sub;
        });

        // Matcher confirming subscription deletion
        _io.on('unsubscribe_r', function(sub){
            var sub = sub;
            log.debug('Client['+_id+']: removed subID: ' + sub.subID);
            delete _subscriptions[sub.subID];
        });

        _io.on('publication', function(pub){
            _handlePublication(pub);
        }) 

        _io.on('disconnect', function(){
            log.debug('Client['+_id+']: disconnected from matcher['+_matcherID+']');
            _disconnect();
        })
    }

    var _move = this.move = function(x, y){
        _pos.parse({x : x, y : y});
        _io.emit('move', _pos);
    }

    // A static subscription (does not move with client)
    var _subscribe = this.subscribe = function(x, y, radius, channel){
        log.debug('Client['+_id+']: subscribing to channel['+channel+'] at AoI['+x+'; '+y+'; '+radius+']');
        var msg = {
            x : x,
            y : y,
            followClient : 0,
            radius : radius,
            channel : channel
        };
        _io.emit('subscribe', msg);
    }

    // A mobile subscription (AoI around client on channel)
    var _subscribeMobile = this.subscribeMobile = function(radius, channel){
        var msg = {
            x : _pos.x,
            y : _pos.y,
            followClient : 1,
            radius : radius,
            channel : channel
        };
        _io.emit('subscribe', msg);
    }

    var _publish = this.publish = function(x, y, radius, payload, channel){
        log.debug('Client['+_id+']: publishing to channel['+channel+'] with payload: '+ payload);
        _pubCount++;

        var pack = {
            pubID : _id + '-' + _pubCount,
            x : x,
            y : y,
            radius : radius,
            payload : payload,
            channel : channel
        };
        _io.volatile.emit('publish', pack);

        //msgsSent += 1;
        //bytesSent += UTIL.sizeof(pack);
    }

    /*
    var _sendPING = this.sendPING = function(x, y, radius, bytes, channel){
        
        numPINGs += 1;
        bytes = parseInt(bytes) || 64;

        var time = UTIL.getTimestamp();

        var payload = {
            type : Client_Message.PING,
            sourcePos : _pos,
            radius : radius,
            pinger : _id,
            pingID : _id + '-' + numPINGs,
            sendTime : time,
            bytes : crypto.randomBytes(bytes)
        }

        // preallocate the response storage
        PONGS[payload.pingID] = {
            sendTime : payload.sendTime,
            ids : [],
            totLat : 0,
            minLat : 0,
            maxLat : 0,
            avgLat : 0
        }

        _publish(x, y, radius, payload, channel);

    }
    */

    var _unsubscribe = this.unsubscribe = function(subID){
        _io.emit('unsubscribe', subID);
    }

    var _clearSubscriptions = this.clearSubscriptions = function(){
        for (var key in _subscriptions){
            _unsubscribe(key);
        }
    }

    var _disconnect = this.disconnect = function(){
        _subscriptions = {};

    }

    var _handlePublication = function(pub){
        var type = pub.payload.type;

        /*
        bytesReceived += UTIL.sizeof(pub);
        msgsReceived += 1;
        */

        switch (type) {
        
            default :{
                log.debug('Client['+_id+']: received publication from Client['+pub.clientID+'] with payload: '+pub.payload);
            }

            /*
            // received a PING, respond with PONG targeted at source
            case Client_Message.PING:{
                //log.debug('received PING from client: ' + pub.payload.pinger);

                var pingID = pub.payload.pingID;
                if (PINGS.includes(pingID)){
                    var dup = {
                        type : 'PING',
                        sendTime : pub.payload.sendTime,
                        pingID : pub.payload.pingID,
                        fromID : pub.payload.pinger
                    }
                    recDuplicates.write(dup, 'client-' + _id + '-duplicates');
                    log.debug('Client['+_id+']: Duplicate PING from: ' + pub.payload.pinger);
                    break;
                }

                //PINGS.push(pingID);

                var x = pub.payload.sourcePos.x;
                var y = pub.payload.sourcePos.y;
                var radius = 0.1; // ~ point publication for PONG's
                var payload = {
                    type : Client_Message.PONG,
                    sourcePos : _pos,
                    radius : pub.payload.radius,
                    pinger : pub.payload.pinger,
                    sendTime : pub.payload.sendTime,
                    pingID : pingID,
                    bytes : pub.payload.bytes
                }

                _publish(x, y, radius, payload, payload.pinger);
            }
            break;

            // received a response for our PING
            case Client_Message.PONG:{

                //log.debug('received PONG from client: ' + pub.clientID);
                var now = UTIL.getTimestamp();
                var sendTime = pub.payload.sendTime;
                var lat =  (now - sendTime)/2;

                // discard if this is not a response to our PING (spatial messages might overlap with our subs)
                // also discard if it is too late
                if (pub.payload.pinger !== _id || now - sendTime > PING_TIMEOUT){
                    break;
                }

                var pingID = pub.payload.pingID;
                var fromID = pub.clientID;

                var pong = PONGS[pingID];

                if(pong.ids.includes(fromID)){
                    var dup = {
                        type : 'PONG',
                        sendTime : sendTime,
                        pingID : pingID,
                        fromID : fromID
                    }
                    recDuplicates.write(dup, 'client-' + _id + '-duplicates');
                    log.debug('Client['+_id+']: received a duplicate PONG from: ' + fromID);
                } else {
                    log.debug('Client['+_id+']: PONG from ' + fromID);
                }

                pong.ids.push(fromID);

                // first response
                if(pong.ids.length === 1){
                    pong.minLat = lat;
                    pong.maxLat = lat;
                }else{
                    pong.minLat = lat < pong.minLat ? lat : pong.minLat;
                    pong.maxLat = lat > pong.maxLat ? lat : pong.maxLat;
                }

                pong.totLat += lat;
                pong.avgLat = pong.totLat / pong.ids.length;

                // add this pong to the list
                PONGS[pingID] = pong; 

                numPONGs += 1;
            }
            break;
            */
        }
    }
    _connect(_GWaddr.host, _GWaddr.port);
}

if (typeof module !== "undefined"){
    module.exports = client;
}