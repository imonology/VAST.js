// Entry server for the SPS system
// currently, the ES does all the voronoi calculations and assigns the relevant matcher to clients. 

// still need to implement matcher moving, disconnections, etc.

//imports
const express = require('express');
const http = require('http');
const io = require('socket.io');
const voronoi = require("./lib/voronoi/vast_voro.js");


function entryServer (startport) {
	var startPort = startPort || 3000;
	var _app = express();
	var _http = http.createServer(_app);
	var _io = io(_http, {
		cors: {
			origin: "*",
			methods: ["GET", "POST"]
		}
	});
	var globalVoro = new voronoi();

	var matchersList = {}; // Data structure to store ID, address, port, position of mathchers
	var matcherMap = {}; // Map to link socket IDs and Matcher IDs
	var matcherID = -1;
	var matcherCount = 0; // Matcher ID is not the same as Matcher Count (don't reassign IDs when matchers leave)
	var connectionsMap =  {};
	
	var _init = this.init = function(){
		console.log("ES initialise")
		initialiseListeners();
		_listen();
		
	}

	var _listen = this.listen = function() {
		_http.listen(startPort);
		//TODO: Error handling (address in use)
	}

	var _findMatcher = function (position){
		var matcherID = voro.closest_to(position);
		if (matcherID !== null){
			return matchersList[matcherID];
		}
		return null;
	}

	var _insertMatcher = function (socket, newMatcher){		
		matcherID++;

		var closeMatcher = _findMatcher(newMatcher.position);
	
		var matcher = {
			socket : socket,
			address : newMatcher.address,
			port : newMatcher.port,
			position : newMatcher.position,
			clients : 0
		}
		
		console.log('inserting matcher: ');
		console.log(matcher);
	
		var succ = globalVoro.insert(matcher.id, matcher.position);
	
		if (succ){
			matchersList[matcherID] = matcher;
			matcherMap[socket.id] = matcherID;
			console.log("Matcher joined: " + matcher);

			if (closeMatcher !== null){
				// matcher is not the first to join, notify closest matcher to update
				closeMatcher.socket.emit('Insert_Matcher', newMatcher);
			}

			return true;
		}else{
			console.log("matcher join unsuccessful");
			socket.disconnect(true);
			matcherID--;
			return false;
		}
	}
	var initialiseListeners = function(){

		//serve html file. clients join via browser
		_app.get('/', function(req, res)
		{
			res.sendFile(__dirname + '/index.html');
		});

		_io.on('connection', function(socket){
			var tempID = matcherID + 1; // if connecting party is matcher, give them an ID
			console.log("somebody joined, asking for info");
		
			// request info from connecting party.
			socket.emit('join_type', tempID);
					
			// A matcher is joining
			socket.on('matcher_join', function(info){
				console.log("matcher is attempting to join");
				var socketID = socket.id;
				
				// does socket correspond to an existing matcher?
				if (matcherMap.hasOwnProperty(socketID)){
					var matchID = matcherMap[socketID];
					var matcherInfo = matchersList[matchID];
					socket.emit("existing_matcher", matcherInfo);
		
					console.log("matcher already exists: " + matcherInfo);
		
				} else {
					console.log("attempting to add matcher");
		
					//When a matcher joins the site that gets split, as well as its neighbours, need to update their neighbour lists
					var closest = globalVoro.closest_to(info.position);
					if (closest !== null){
						
					}
		
					if (!_insertMatcher(socket, info)){
						console.log("failed to add new matcher");
						socket.disconnect();
					} else {
						// matcher successfully joined, need to update neighbours for affected matchers
					}
				}
			});
	
			//A client is joining
			socket.on('client_join', function(info){
				console.log('a client is attempting to join');
		
				if (typeof info.matcher === 'undefined'){
					var matchID = globalVoro.closest_to(info.position);
					var matcher = matchersList[matchID]; // get info of closest matcher
					console.log('found matcher: ');
					console.log(matcher);
					socket.emit('assign_matcher', matcher); // send matcher info to client
				}else{
					console.log('failed to add client');
					socket.disconnect();
				}
			});
		
			//handle a disconnect
			socket.on('disconnect', function(id){
				//var id = connectionsMap[socket.id];
				//delete connectionInfoList[id];
				//console.log("connection <"+id+"> disconnected");
		
				return false;
			});
		
			// move matcher
			socket.on('move_matcher', function(msg){
		
				
			});
	
		});
	}
	var _updateNeighbours = function (){
		for (var i in matchersList){
			var matcher = matchersList[i];
			var neighbours = {};
			var en_list = globalVoro.get_en[matcher.id];
	
			for (var j in en_list){
				neighbours[j] = matchersList[j];
			}
	
			var msg = {
				matcher : matcher,
				neighbours : neighbours
			}
			_io.to(matcher.socketID).emit('en_neighbours', msg);
		}
	}
	
	
	var _redistributeMatchers = function(){
	
	}

	// Object Constructors
	function MatcherInfo(id, address, port, position){
		this.id = id;
		this.address = this.address;
		this.port = port;
		this.position = this.position;

	//	this.toString = function(){
	//		return ('ID: '+this.id+' position: ['+this.position.x+','+this.position.y+']')
	//	}
	};

	function Position(x, y){
		this.x = x;
		this.y = y;
	}

}

if (typeof module !== 'undefined')
	module.exports = entryServer;