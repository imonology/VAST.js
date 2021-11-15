const { connect } = require('http2');

require('./common');

Client_Message = {
    PING :  0,
    PONG :  1,
    MSG:    2
}

function client(host, port, x, y, radius, onMatcherAssigned){
    const io = require('socket.io-client');
    const crypto = require('crypto');
    var _io, _io_control;

    var _id = -1;
    var _hostname = UTIL.getHostname();
	var _GWaddr = { host: host, port: port };
    var _matcherID = VAST.ID_UNASSIGNED;
    var _matcherAddr;

    var _subscriptions = {};

    var _x = x==null || x == undefined ? Math.random()*1000 : x;
    var _y = y==null || y==undefined ? Math.random()*1000 : y;
    var _radius = radius == null || radius == undefined ? 16 : radius;
	var _pos = new VAST.pos(_x,_y);

    // performance measurement
    const record = require('./record.js');
    const recBandwidth = new record();
    const recPongs = new record();
    const recDuplicates = new record();

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

    _onMatcherAssigned = onMatcherAssigned;

    // Create socket connection with given host, port
    _connect = this.connect = function(host, port){
        if(_io !== undefined){
            _io.close();
        }
        _io = io.connect('http://'+host+':'+port);
        
        // initialise event listeners
        _io.on('connect', function(){
            console.log('socket connected')
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

        // Matcher assigning an ID and matcher
        _io.on('assign_matcher', function(pack){

            var newMatcher = (_matcherAddr !== pack.matcherAddr);
            _matcherID = pack.matcherID
            _matcherAddr = pack.matcherAddr;
            _id = pack.clientID;

            if (newMatcher)
            _connect(_matcherAddr.host, _matcherAddr.port);
        });

        // We are connected to our assigned matcher, so we are "properly" initialised
        _io.on('confirm_matcher', function(pack){
            _matcherID = pack.matcherID
            _matcherAddr = pack.matcherAddr;
            _id = pack.clientID;

            console.log('client['+_id+'] assigned to matcher['+_matcherID+']');

            if(typeof _onMatcherAssigned == 'function'){
                _onMatcherAssigned(_id);
            }
        });

        // Matcher confirming / updating subscription
        _io.on('subscribe_r', function(sub){
            var sub = sub;
            console.log('client['+_id+'] added sub')
            console.log(sub);
            _subscriptions[sub.subID] = sub;
        });

        // Matcher confirming subscription deletion
        _io.on('unsubscribe_r', function(sub){
            var sub = sub;
            console.log('client['+_id+'] removed subID: ' + sub.subID);
            delete _subscriptions[sub.subID];
        });

        _io.on('publication', function(pub){
            _handlePublication(pub);
        }) 

        _io.on('disconnect', function(){
            console.log('client['+_id+'] disconnected from matcher['+_matcherID+']');
            _disconnect();
        })
    }

    var _subscribe = this.subscribe = function(x, y, radius, channel){
        var msg = {
            x : x,
            y : y,
            radius : radius,
            channel : channel
        };
        _io.emit('subscribe', msg);
    } 

    var _publish = this.publish = function(x, y, radius, payload, channel){
        var pack = {
            x : x,
            y : y,
            radius : radius,
            payload : payload,
            channel : channel
        };
        _io.volatile.emit('publish', pack);

        msgsSent += 1;
        bytesSent += UTIL.sizeof(pack);
    }

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

        bytesReceived += UTIL.sizeof(pub);
        msgsReceived += 1;

        switch (type) {
            // received a PING, respond with PONG targeted at source
            case Client_Message.PING:{
                //console.log('received PING from client: ' + pub.payload.pinger);

                var pingID = pub.payload.pingID;
                if (PINGS.includes(pingID)){
                    var dup = {
                        type : 'PING',
                        sendTime : pub.payload.sendTime,
                        pingID : pub.payload.pingID,
                        fromID : pub.payload.pinger
                    }
                    recDuplicates.write(dup, 'client-' + _id + '-duplicates');
                    console.log('Duplicate PING from: ' + pub.payload.pinger);
                    break;
                }

                PINGS.push(pingID);

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

                //console.log('received PONG from client: ' + pub.clientID);
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
                    console.log('received a duplicate PONG from: ' + fromID);
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

            default :{
                //console.log('received publication');
                //console.log(pub);
            }
        }
    }

    // tell client to start performance measurements
    this.startRecordingPONGs = function(){
        recPongs.init('client-' + _id + '-pongs','/results');
        recDuplicates.init('client-' + _id + '-duplicates','/results');
        var now;

        // Update PONG record every 5 seconds
        setInterval(function(){
            now = UTIL.getTimestamp();
            for (var pingID in PONGS){
                var pong = PONGS[pingID];
                
                // still waiting for possible responses for each pong after this one
                if (now - PONGS[pingID].sendTime < PING_TIMEOUT){
                    break;
                }

                recPongs.write(pong,'client-' + _id + '-pongs');
                delete PONGS[pingID];
            }      
        }, 5000);
    }

    this.startRecordingBandwidth = function(){
        recBandwidth.init('client-' + _id + '-bandwidth', '/results');

        // first clear results before starting measurements
        bytesSent = 0;
        bytesReceived = 0;
        msgsSent = 0;
        msgsReceived = 0;
        var time = process.hrtime();

        // Update bandwidth measurements periodically
        setInterval(function(){
            var dt = process.hrtime(time)[0] + process.hrtime(time)[1]/1000000000;  // seconds + nanoseconds
            var bpsSent = bytesSent / dt || 0;
            bytesSent = 0;

            var bpsReceived = bytesReceived / dt || 0;
            bytesReceived = 0;

            var mpsSent = msgsSent / dt || 0;
            msgsSent = 0;

            var mpsReceived = msgsReceived / dt || 0;
            msgsReceived = 0;

            time = process.hrtime();

            _recordBandwidth(UTIL.getTimestamp(), bpsSent, bpsReceived, mpsSent, mpsReceived);

        }, 5000); 
    }

    var _recordBandwidth = function(time, bpsSent, bpsReceived, mpsSent, mpsReceived){
        var state = {
            time : time,
            matcher : _matcherID,
            bpsReceived : bpsReceived,
            bpsSent : bpsSent,
            mpsReceived : mpsReceived,
            mpsSent : mpsSent,
        }
        recBandwidth.write(state, 'client-' + _id + '-bandwidth');
    }

    _connect(_GWaddr.host, _GWaddr.port);
}

if (typeof module !== "undefined"){
    module.exports = client;
}