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

    var _controlAddr = {host: '127.0.0.1', port: 100};

    var _x = x==null || x == undefined ? Math.random()*1000 : x;
    var _y = y==null || y==undefined ? Math.random()*1000 : y;
    var _radius = radius == null || radius == undefined ? 16 : radius;
	var _pos = new VAST.pos(_x,_y);

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
                    onMatcherAssigned();
                }
            });

            // Matcher confirming / updating subscription
            _io.on('subscribe_r', function(sub){
                var sub = sub;
                console.log('client['+_id+'] added sub')
                console.log(sub);
                _subscriptions[sub.subID] = sub;

            //    _publish(_x, _y, _radius, "HELLO FROM CLIENT: " + _id, 1);
            });

            _io.on('publication', function(pub){
                console.log('received publication')
                console.log(pub);
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

_connect(_GWaddr.host, _GWaddr.port);
}

if (typeof module !== "undefined"){
    module.exports = client;
}