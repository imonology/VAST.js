//Client
const matcher = require('./matcher');

require('./common');

function client(host, port, x, y, radius, onMatcherAssigned){
    const io = require('socket.io-client');
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
    var PONGS = {};     // record who we get responses from for each PING
    var duplicatePONGS = {}; // record each time we get a duplicate response
    var duplicatePINGS; // record each PING we receive twice
    var numPINGs = 0;
    var numPONGs = 0;

    var bytesSent = 0;      //bytes
    var bytesReceived = 0;  //bytes
    var bandwidth = 0;      //bytes/s


    var minLatency = -1; // will be positive if inited
    var maxLatency = 0; // will be > 1
    var totLatency, avgLatency;

    _onMatcherAssigned = onMatcherAssigned;

    // Create socket connection with given host, port
    _connect = this.connect = function(host, port){
        if(_io !== undefined){
            _io.close();
        }
        _io = io('http://'+host+':'+port);
        
        // initialise event listeners
        _io.on('connect', function(){

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

                bytesSent += myInfo.length;
            });

            // Matcher assigning an ID and matcher
            _io.on('assign_matcher', function(pack){

                var newMatcher = (_matcherAddr !== pack.matcherAddr);
                _matcherID = pack.matcherID
                _matcherAddr = pack.matcherAddr;
                _id = pack.clientID;

                bytesReceived += pack.length;

                if (newMatcher)
                _connect(_matcherAddr.host, _matcherAddr.port);
            });

            _io.on('confirm_matcher', function(pack){
                _matcherID = pack.matcherID
                _matcherAddr = pack.matcherAddr;
                _id = pack.clientID;

                bytesReceived += pack.length;

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

                bytesReceived += sub.length;
            });

            // Matcher confirming subscription deletion
            _io.on('unsubscribe_r', function(sub){
                var sub = sub;
                console.log('client['+_id+'] removed subID: ' + sub.subID);
                delete _subscriptions[sub.subID];

                bytesReceived += sub.length;
            });

            _io.on('publication', function(pub){

                bytesReceived += pub.length;
                _handlePublication(pub);
            }) 

            _io.on('disconnect', function(){
                console.log('client['+_id+'] disconnected from matcher['+_matcherID+']')
            })
        });
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
        _io.emit('publish', pack);
    }

    var _sendPING = this.sendPING = function(x, y, radius, channel){
        
        numPINGs += 1;
        var payload = {
            type : Client_Message.PING,
            sourcePos : _pos,
            radius : radius,
            pinger : _id,
            pingID : _id + '-' + numPINGs,
            sendTime : UTIL.getTimestamp()
        }

        _publish(x, y, radius, payload, channel);

        // preallocate the response storage
        PONG[payload.pingID] = {
            sendTime : payload.sendTime,
            ids : [],
            totLat : 0,
            minLat : 0,
            maxLat : 0,
            avgLat : 0
        }

    }

    var _unsubscribe = this.unsubscribe = function(subID){
        _io.emit('unsubscribe', subID);
    }

    var _clearSubscriptions = this.clearSubscriptions = function(){
        for (var key in _subscriptions){
            _unsubscribe(key);
        }
    }

    var _handlePublication = function(pub){
        var type = pub.payload.type;

        switch (type) {
            // received a PING, respond with PONG targeted at source
            case Client_Message.PING:{
                console.log('received PING from client: ' + pub.clientID);

                if (pub.payload.hasOwnProperty('sourcePos') &&
                pub.payload.hasOwnProperty('sendTime')){
                    var x = pub.payload.sourcePos.x;
                    var y = pub.payload.sourcePos.y;
                    var radius = 0.1; // ~ point publication for PONG's
                    var payload = {
                        type : Client_Message.PONG,
                        sourcePos : _pos,
                        radis : pub.payload.radius,
                        pinger : pub.payload.pinger,
                        sendTime : pub.payload.sendTime,
                        pingID : pub.payload.pingID
                    }

                    _publish(x, y, radius, payload, pub.channel);
                }

            }
            break;

            // received a response for our PING
            case Client_Message.PONG:{

                var now = UTIL.getTimestamp();
                var sendTime = pub.payload.sendTime;
                var lat =  (now - sendTime)/2;

                // discard if this is not a response to our PING (spatial messages might overlap with our subs)
                if (pub.payload.pinger !== _id){
                    return;
                }

                var pingID = pub.payload.pingID;
                var fromID = pub.clientID;

                var pong = PONGS[pingID];

                if(pong.ids.includes(fromID)){
                    var dup = duplicatePONGS[pingID] || [];
                    dup.push(fromID);
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
                pong.avgLat = totLat / pong.ids.length;

                // add this pong to the list
                PONGS[pingID] = pong; 

                numPONGs += 1;

                console.log('received PONG from client: ' + pub.clientID);
                console.log(pong);
            }
            break;

            default :{
                console.log('received publication');
                console.log(pub);
            }
        }
    }

_connect(_GWaddr.host, _GWaddr.port);
}

if (typeof module !== "undefined"){
    module.exports = client;
}