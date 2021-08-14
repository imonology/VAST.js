//Client

const matcher = require('./matcher');

require('./common');

function client(host, port, x, y){
    const io = require('socket.io-client');
    var _io;

    var _id = -1;
	var _GWaddr = { host: host, port: port };
    var _matcherID = VAST.ID_UNASSIGNED;
    var _matcherAddr;

    var _x = x==null || x == undefined ? Math.random()*1000 : x;
    var _y = y==null || y==undefined ? Math.random()*1000 : y;
	var _pos = new VAST.pos(_x,_y);

    //var myInfo = VAST.clientInfo(VAST.ID_UNASSIGNED, _id, _pos);

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
                console.log('matcher asking for info');
                console.log(info);
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


        });

    }

_connect(_GWaddr.host, _GWaddr.port);
}

if (typeof module !== "undefined"){
    module.exports = client;
}