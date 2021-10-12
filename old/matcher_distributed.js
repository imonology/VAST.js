// Matcher for 	SPS system. 

//To Do: 	
//	robust neighbour discovery and keeping a list thereof.	
//	implement matcher-matcher (neighbour) connections and event forwarding.
//	implement data validation and error handling.	  		


const http = require('http').createServer();

const io = require('socket.io')(http, { 
	cors: {
		origin: "*"
	}
});

const voronoi = require("./lib/voronoi/vast_voro.js");

var voro = new voronoi();

 // socket to ES
var io_ES = require('socket.io-client')("http://localhost:3000");

var myInfo = new MatcherInfo(-1, 'localhost', 9000, new Position(0, 0));

// list of subscriptions
var subscriptions = {};

// matches a socket to a connectionID
var connectionsMap = {};
var connectionInfoList = {};

var connectionCount = -1;
var subscriptionCount = -1;

// Connecting to Entry Server
io_ES.on('connect', function(){
	console.log("connected to ES");

	io_ES.on('join_type', function(tempID){
		console.log('ES is asking for info');
		if (myInfo.id === -1){
			myInfo.id = tempID;

			// Only splitting region along x axis. Basic voronooi test
			var x = 10 + tempID*10;
			myInfo.position = new Position(x, 0);
			_insertMatcher(myInfo);


			io_ES.emit('matcher_join', myInfo);
		}else {

		}
	});

	io_ES.on('existing_matcher', function(info){
		if (info.id == myInfo.id){
			myInfo = info;
		}
	});

	io_ES.on('en_neighbours', function(msg){
		if(msg.matcher.id === myInfo.id){
			var neighbours = msg.neighbours;
			for(var id in neighbours){
				var neighbour = neighbours[id];
				voro.insert()
			}
		}

	});

});

//handle a client connection
io.on('connection', function(socket){
  	connectionCount++;
  	connectionID = connectionCount;
 	connectionsMap[socket.id] = connectionID;

	socket.emit('you joined', connectionID); //client does not register this event

	console.log("client joined");
	info = {
		id: connectionID,                                   // id
		socketID: socket.id,                                     // socket
		x: 0,                                               // x coordinate of client
		y: 0,                                               // y coordinate of client
		AoIRadius: 10                                       // radius of AoI (currently make it large enough that they will always send to each other)
	};

	connectionInfoList[connectionID] = info;

	//handle a disconnect
	socket.on('disconnect', function(id){
		var id = connectionsMap[socket.id];
		delete connectionInfoList[id];
		console.log("connection <"+id+"> disconnected");

		return false;
	});

	//publish a message
	socket.on('publish', function(msg){

		for (var key in subscriptions){
			if(!subscriptions.hasOwnProperty(key)) continue;
			var sub = subscriptions[key];
			console.log(sub);
			if (_contains(sub, msg.x, msg.y, msg.radius)){
				console.log('sending message to' + sub.connectionID)

				io.to(sub.socketID).emit('publication', msg); 
			}
		}
	});

	//subscribe to an AOI
	socket.on('subscribe', function(msg){
		id = connectionsMap[socket.id];

		console.log("Client " + id + " subbed to" + msg.x + " , " + msg.y + ", AOI: " + msg.AoI);

		_subscribe(id, socket.id, msg.x, msg.y, msg.AoI);
	});

	//unsubscribe
	socket.on('unsubscribe', function(x, y, AoI){
		// need a robust way of unsubbing.
		// perhaps unsubbing from the sub centred nearest to [x,y] in request? Or unsubbing from all subs that contain [x,y]?
		// OR unsubbing using a subID (requires a list of subs to be kept by client and matcher, and it needs to be validated)   
	});

	//move
	socket.on('move', function(msg){
		var id = connectionsMap[socket.id];
		var info =
		{
			id: id,                                   				// id
			socketID: socket.id,                                    // socket
			x: msg.x,                                               // x coordinate of client
			y: msg.y,                                               // y coordinate of client
			AoIRadius: msg.AoI                                      // radius of AoI (currently make it large enough that they will always send to each other)
		};
		connectionInfoList[id] = info;

		console.log("Moving client " + id + " to " + info.x + " , " + info.y);
		socket.emit('moved', info);

	});

});

//helper functions

var _insertMatcher = function(matcher){
	if (!voro.insert(matcher.id, matcher.position)){
		return false;
	}
}


var _subscribe = function(id, socketID, x, y, AoI){
	//receive a subscription request from connectionID 

	//TODO:	1:	connection type = matcher/client
	//		2:	if AoI outside matcher region, send subscription to other matcher

	//for now, all connections are to clients
	subscriptionCount++;
	subID = subscriptionCount
	var subscription = 
	{
		subscriptionID : subID,
		connectionID : id,
		socketID : socketID,
		x : x,
		y : y,
		AoI : AoI
	};

	subscriptions[subID] = subscription;
	console.log(subscriptions[subID]);
}

var _contains = function (sub, pubX, pubY, pubAoI) {
    var dx = sub.x - pubX;
    var dy = sub.y - pubY;
    var dist = Math.sqrt(Math.pow(dx,2) + Math.pow(dy,2));

    var difference = sub.AoI - dist;
    
    if (difference >= 0) {
        return true;
    }
    return false;
}

var _listen = function () {

	http.on('error', (e) => {
		
		// address already in use
		if (e.code === 'EADDRINUSE') {
		  console.log('Address in use, changing port...');
		  myInfo.port--;
		  _listen();
		}
	  });

	http.listen(myInfo.port, myInfo.address);
}

_listen();

// Object Constructors
function MatcherInfo(id, address, port, position){
	this.id = id;
	this.address = address;
	this.port = port;
	this.position = position;
}

function Position(x, y){
	this.x = x;
	this.y = y;
}
