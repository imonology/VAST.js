// A server that all matchers connect to, used to show the voronoi 
// diagram and other things

const client = require('../client');
const matcher = require('../matcher');
const VONPeer = require('../VON_peer');

//
require('../common');

function globalServer() {

  // set up socket for matcher connections
    const _express = require('express')();
    const _http = require('http').createServer(_express);
    const _io = require('socket.io')(_http, {
        cors: {
			origin: "*"
		},
        pingTimeout: 5000
    });

    var start, now;
    var step = 1000; //ms between sending updates to visualiser

    var address = {host:'127.0.0.1', port:7777};

    var VAST_Voronoi = require('../voronoi/vast_voro.js');
    
    var matchers = {};      // keeps VON data (id, aoi, pos, neighbours)
    var clients = {};       // keys: hostID, clientID 
    var subscriptions = {}; // keys: hostID, clientID
    var publications = {};
    var pubLife = 1000;    //ms before pub is removed

    var socketID2matcherID = {};
    var matcherID2socket = {};

    var visualSocket;

    var voronoi;

    // used to keep track of matchers that require updating
    var updated;
    
    var _init = function(){
        voronoi = new VAST_Voronoi();

      _initialiseListeners();

      _listen();
    }
    
    
    var _initialiseListeners = function(){

        _io.on('connection', function(socket){
            //console.log('new connection');
            socket.emit('confirm_join');

            socket.on('matcher_join', function(data){
                console.log('joining matcher');

                // TODO - handle duplicates, add a disconnection timer
                if(matchers.hasOwnProperty(data.id)){
                    console.log('duplicate matcher')
                    socket.emit('duplicate_id');
                    socket.disconnect();
                    return;
                }

                if (data.id !== undefined && data.id != VAST.ID_UNASSIGNED &&
                    data.hasOwnProperty('aoi')){
                    
                    // store connection data for the matcher
                    matcherID2socket[data.id] = socket;
                    socketID2matcherID[socket.id] = data.id;

                    var aoi = new VAST.area();
                    aoi.parse(data.aoi);
                    //insert into voronoi
                    voronoi.insert(data.id, aoi.center);

                    // add to list of connected matchers               
                    matchers[data.id] = {
                        id : data.id,
                        aoi : aoi,
                        pos : aoi.center,
                        //neighbours : data.neighbours
                    }

                    console.log(matchers[data.id]);
                }
                
            });

            // updating VON peer
            socket.on('von_data', function(data){
                // dont accept a new node here
                if(matchers.hasOwnProperty(data.id) === false){
                    socket.disconnect();
                    return;
                }
                
                // ensure that the node is in the VON network 
                // and has required fields
                if (data.id !== undefined && data.id != VAST.ID_UNASSIGNED &&
                    data.hasOwnProperty('aoi') && data.hasOwnProperty('neighbours')){
                    
                    var aoi = new VAST.area();
                    aoi.parse(data.aoi);
                    
                    voronoi.update(data.id, aoi.center);


                    // add a localised voro for the new peer
                    /*
                    var voro = new VAST_Voronoi();
                    console.log(voro.get_bounding_box());
                    for (var key in data.neighbours){
                        console.log(data.neighbours[key]);
                        console.log(data.neighbours);
                        voro.insert(key, data.neighbours[key]);
                    }
                    */
                    
                    // update matcher info
                    matchers[data.id] = {
                        id : data.id,
                        aoi : aoi,
                        pos : aoi.center,
                    //    voro : voro,
                    //    neighbours : data.neighbours
                    }
                    //console.log('receiving voro data for matcher: ' + data.id);
                    //console.log(data);
                }
                else{
                   // socket.disconnect();
                }
            });

            socket.on('client_update', function(data){
                clients[data.id] = data.clients;
            });

            socket.on('sub_update', function(data){
                subscriptions[data.id] = data.subscriptions;
                console.log('sub update');
                console.log(subscriptions);
            });

            socket.on('pub_new', function(pub){
                var pubTime = UTIL.getTimestamp();
                publications[pubTime] = pub;
            });

            socket.on('matcher_update', function(data){

            }); 

            socket.on('disconnect', function(){

                //TODO: disconnection timer. Matcher might still be part of VON

                // if the connection was to a matcher
                if (typeof(socketID2matcherID[socket.id]) !== undefined){
                    deleteMatcher(socketID2matcherID[socket.id]);
                    delete socketID2matcherID[socket.id];                    
                }
            })

            socket.on('visualiser_connected', function(){
                visualSocket = socket;
                _sendUpdate();
            })

            // requests a full update from the matchers
            socket.on('request_update', function(id){
                console.log('received update request for: '+id);
                if(matcherID2socket[id] !== undefined){
                    matcherID2socket[id].emit('request_update');
                }
            });

        });
    }

    var deleteMatcher = function(id){
        delete matchers[id];
        delete subscriptions[id];
        delete clients[id];
        delete matcherID2socket[id];
        voronoi.remove(id);
        _sendUpdate();
    }

    
    var _updatePubs = function(){
        for (var pubTime in publications){
            if (UTIL.getTimestamp() - pubTime >= pubLife){
                delete publications[pubTime];
            }
        }
    }


    // sends an update to the visualiser client every timestep
    var _sendUpdate = function(){
        if(typeof(visualSocket) !== 'undefined'){
            var data = {
                matchers : matchers,
                clients : clients,
                subscriptions : subscriptions,
                publications : publications
            }
            //console.log('sending update');
            //console.log(data);
    
            visualSocket.emit('update', data);
        }

        _updatePubs();

        setTimeout(_sendUpdate, step);
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

globalServer()

// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = globalServer;







