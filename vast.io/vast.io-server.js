
/*
process.on('uncaughtException', function(err) {
  console.log(err);
});
*/

// include VAST
require('../common');

// show only warnings
LOG.setLevel(2);

/*
    NOTE:
        methods that should be supported remotely are: (with their parameters)
        
        addr = {host, port}
        aoi  = {center, radius}
        
        join:   {addr, aoi}
        leave:  {}
        move:   {aoi}
        list:   {}
        send:   {id, msg}

        in return, the following are sent:
        
        join_r:     {id}
        leave_r:    {id}
        neighbors:  {[node]}
        message:    {id, msg}
*/

/*
process.on('uncaughtException', function(err) {
  console.log(err);
});
*/

//
// socket.io parts
//

// default port to listen for incoming client connections
var server_port = 38800;

// default port for connecting / creating VON nodes
var VON_port = 37700;

var nodes_created = 0;

// open a server at this port
var io = require('socket.io').listen(server_port);

io.set('log level', 1);

// warpper functions around a VAST node
// NOTE: when connection establishes, it means that there's a new VAST node joined
io.sockets.on('connection', function (socket) {
    //socket.emit('news', { hello: 'world' });
    
    // store this socket by creating a VAST node
    // object recording self info
    var _self = undefined; 

    // object recording neighbor info
    var _neighbors = {};
   
    // join VON network
    socket.on('join', function (data) {
        console.log(data);
        
        // specify where to locate VON gateway
        var ip_port = new VAST.addr('127.0.0.1', VON_port); 
               
        // extract AOI for the VON node to create               
        var aoi = new VAST.area();
        aoi.parse(data.aoi);

        // create GW or a connecting client
        // NOTE: by using VAST_ID_UNASSIGNED as default, the first created node will be the gateway
        _self = new VON.peer();
        
        nodes_created++;

        // join in the network        
        _self.init(VAST_ID_UNASSIGNED, ip_port.port + nodes_created, ip_port, function () {
        
            _self.join(aoi,
        
                // done callback
                function (self_id) {
                                
                    LOG.warn('\njoined successfully! id: ' + self_id + ' self id: ' + _self.getSelf().id);
                    
                    // reply join success & ID
                    socket.emit('join_r', {id: self_id}); 
                }
            );
        });               
    });
    
    // leave VON network
    socket.on('leave', function (data) {
        console.log(data);
        
        if (_self === undefined) {
            LOG.error('not yet joined, cannot leave');
            socket.emit('leave_r', {});
            return;
        }
            
        _self.leave();
                
        // respond and return id of the leaving node
        socket.emit('leave_r', {id: _self.getSelf().id});
        
        _self = undefined;
    });
    
    // move to a new position (by providing a new AOI)
    socket.on('move', function (data) {
        console.log(data);
        
        if (_self === undefined) {
            LOG.error('not yet joined, cannot move');
            return;
        }
        
        // extract aoi
        var aoi = new VAST.area();
        aoi.parse(data.aoi);
        
        _self.move(aoi); 
    });
    
    // get a list of neighbors
    socket.on('list', function (data) {
        //console.log(data);

        if (_self === undefined) {
            LOG.error('not yet joined, cannot list');
            return;
        }
        
        // get a list of current neighbors
        var neighbors = _self.list();
        
        // convert neighbor list to array
        var neighbor_list = [];
        for (var id in neighbors) {
            var node = neighbors[id];
            neighbor_list.push({id: node.id, x: node.aoi.center.x, y: node.aoi.center.y});
        }
            
        // get edge list
        var edges = _self.getEdges();
        var edge_list = [];
        for (var i=0; i < edges.length; i++)
            edge_list.push({a: edges[i].va, b: edges[i].vb});
            
        //LOG.debug('list sends back ' + neighbor_list.length + ' neighbors and ' + edge_list.length + ' edges');
        
        // return to client
        socket.emit('neighbors', {nodes: neighbor_list, edges:edge_list});        
    });

    // send custom message to a target host
    socket.on('send', function (data) {
        console.log(data);

        if (_self === undefined) {
            LOG.error('not yet joined, cannot send');
            return;
        }
        
        // send away via VAST node
        _self.send(data.id, data.msg);        
    });        
    
    // when the remote client disconnects
    socket.on('disconnect', function () {
        //io.sockets.emit('user disconnected');
        
        if (_self !== undefined) {
            _self.leave();
            
            // will disconnect
            _self = undefined;
        }        
    });    
});