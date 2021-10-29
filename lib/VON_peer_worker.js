// Created by CF Marais 2021
// a bit of a hack / experiment to see if the VON peer could be run in a different 
// thread to improve performance.

// The von peer is created inside a worker that runs under the matcher main process
require('./common.js');
const {parentPort, workerData} = require('worker_threads');

console.log('worker thread created');


var _id = workerData.id;
var _localIP = workerData.localIP;
var _port = workerData.port;
var _GWaddr = workerData.GWaddr;
var _pos = new VAST.pos(workerData.x, workerData.y)
var _aoi = new VAST.area(_pos, workerData.radius);
var _that = this;

var _handlePacket = this.handlePacket = function(pack){
    var message = {
        type : Worker_Message.MATCHER_MESSAGE,
        packet : pack
    };
    parentPort.postMessage(message);
}

var _onParentMessage = function(message){

    //console.log('worker received message ', message);

    switch (message.type) {
        case Worker_Message.POINT_MESSAGE : {
            //console.log('VON worker given point message');
            peer.pointMessage(JSON.parse(message.packet));
        }
        break;
        
        case Worker_Message.AREA_MESSAGE : {
            //console.log('VON worker given area message');
            peer.areaMessage(JSON.parse(message.packet));
        }
        break;
    }
}

// initialise peer
var peer = new VON.peer();

parentPort.on('message', function(message){
    _onParentMessage(message);
});

parentPort.on('error', function(e){
    console.log('error on parent port ', e);
})


peer.init(_id, _localIP, _port, _that, function(local_addr){
    _addr = local_addr;
			
			peer.join(_GWaddr, _aoi,

				// when finished joining, do callback
				function (id) {					
					_id = id;
                    var message = {
                        type : Worker_Message.INIT,
                        id : _id,
                        addr : _addr
                    };
                    parentPort.postMessage(message);

					console.log('joined successfully! id: ' + id + '\n');			
				}
			);
});