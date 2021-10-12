//Client
const matcher = require('./matcher');

require('./common');

function client(host, port, x, y, radius, onMatcherAssigned){
    const io = require('socket.io-client');
    var _io, _io_control;

    var _id = -1;
	var _GWaddr = { host: host, port: port };
    var _matcherID = VAST.ID_UNASSIGNED;
    var _matcherAddr;

    var _subscriptions = {};

    var _x = x==null || x == undefined ? Math.random()*1000 : x;
    var _y = y==null || y==undefined ? Math.random()*1000 : y;
    var _radius = radius == null || radius == undefined ? 16 : radius;
	var _pos = new VAST.pos(_x,_y);

    // performance measurement
    var numPINGs = 0;
    var numPONGs = 0;
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

            _io.on('disconnect', function(pub){
                console.log('client['+_id+'] disconnected from matcher['+_matcherID+']')
                console.log(pub);
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
        var payload = {
            type : Client_Message.PING,
            sourcePos : _pos,
            pinger : _id,
            sendTime : UTIL.getTimestamp()
        }
        _publish(x, y, radius, payload, channel);
        numPINGs += 1;
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
                    var radius = 0.1; // ~point publication for PONG's
                    var payload = {
                        type : Client_Message.PONG,
                        sourcePos : _pos,
                        pinger : pub.clientID,
                        sendTime : pub.payload.sendTime
                    }

                    _publish(x, y, radius, payload, pub.channel);
                }

            }
            break;

            // received a response for our PING
            case Client_Message.PONG:{
                var now = UTIL.getTimestamp();

                if (pub.payload.hasOwnProperty('sendTime')){
                    var lat =  (now - pub.payload.sendTime)/2;

                    minLatency = lat < minLatency || minLatency < 0 ? lat : minLatency;
                    maxLatency = lat > maxLatency ? lat : maxLatency;

                    numPONGs += 1;

                    console.log('received PONG from client: ' + pub.clientID);
                    console.log('Total PINGs: ' + numPINGs +'; Total PONGs: '+ numPONGs);
                    console.log('Min Latency: '+ minLatency +'; Max Latency: ' + maxLatency);

                }

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