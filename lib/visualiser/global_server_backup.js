// A server that all matchers connect to, used to show the voronoi 
// diagram and other things

const { info, Console } = require('console');
const client = require('../client');
const matcher = require('../matcher');

//
require('../common');


function globalServer(){

    // set up socket for matcher connections
    const _express = require('express')();
    const _http = require('http').createServer(_express);
    const _io = require('socket.io')(_http, {
        cors: {
			origin: "*"
		},
        pingTimeout: 5000
    });

    var address = {host:'127.0.0.1', port:7777};

    var VAST_Voronoi = require('../voronoi/vast_voro.js');
    
    var matchers = {};
    var clients = {};
    var subscriptions = {};

    var socketID2matcherID = {};
    var matcherID2socket = {};

    var visualSocket;

    // used to keep track of matchers that require updating
    var updated;
    
    var _init = function(){
        voro = new VAST_Voronoi();
        
        _initialiseListeners();
        _listen();
    }
    
    
    var _initialiseListeners = function(){

        _io.on('connection', function(socket){
            console.log('new connection');
            
            socket.on('matcher_join', function(info){
                //console.log(info);

                if((info.id !== -1 && typeof(info.id) !== 'undefined')
                    && (info.aoi !== 'undefined')) {
                    var aoi = new VAST.area();
                    aoi.parse(info.aoi);
                    
                    // matcher is new
                    if(typeof(matchers[info.id]) == 'undefined'){
                        voro.insert(info.id, aoi.center);
                    }else{
                        voro.update(info.id, aoi.center);
                    }
        
                    matchers[info.id] = info;
                    //console.log(matchers);

                    // save the connected matcher's socket
                    matcherID2socket[info.id] = socket;
                    socketID2matcherID[socket.id] = info.id;

                    socket.emit('confirm_join');
                    _sendUpdate();
                }
            });

            socket.on('disconnect', function(){
                // if the connection was to a matcher
                if (typeof(socketID2matcherID[socket.id]) !== 'undefined'){
                    var id = socketID2matcherID[socket.id];
                    delete matchers[id];
                    delete matcherID2socket[id];
                    delete socketID2matcherID[socket.id];
                    voro.remove(id);
                }

                _sendUpdate();
            })

            socket.on('visualiser_connected', function(){
                visualSocket = socket;
                _sendUpdate();
            })

            socket.on('request_update', function(){

                console.log(matchers);


                for (var key in matchers){
                    setTimeout(function(){
                        matcherID2socket[key].emit('request_update');
                    }, 100);
                }
            });

            socket.on('matcher_update', function(data){

                var aoi = new VAST.area();
                var sub = new VAST.sub();
                var tempSubs = {};

                if(data.id !== -1 && typeof(data.id) !== 'undefined'){
                    aoi.parse(data.aoi);
                    data.aoi = aoi;
                    data.pos = aoi.center;

                    // for each client
                    for (var c in data.subscriptions){
                        // for each sub
                        for (var k in data.subscriptions[c]){                           
                            sub.parse(data.subscriptions[c][k])
                            tempSubs[k] = sub;
                        }
                        data.subscriptions[c] = tempSubs;
                        tempSubs={};
                    }
                   
                    // update matcher data
                    matchers[data.id] = data;

                    _sendUpdate();
                }
            });  
        });
    }

    var _sendUpdate = function(){
        if(typeof(visualSocket) !== 'undefined'){
            var data = {
                matchers : matchers
            }
            //console.log('sending update');
            //console.log(data);
    
            visualSocket.emit('update', data);
        }
    }

    var _listen = function () {

		_http.on('error', (e) => {
			
			// address already in use
			if (e.code === 'EADDRINUSE') {
			  console.log('Address in use, changing port...');
			  address.port++;
			  _http.close();
			  _listen();
			}
		  });
	
		_http.listen(address.port);
	}

    _init();
}

// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = globalServer;





