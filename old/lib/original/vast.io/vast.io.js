/* 
    VAST javascript-binding (based on socket.io)
          
    basic callback / structures:
    
    addr = {host, port};
    center = {x, y};
    aoi = {center, radius};
    endpt = {id, addr, last_accessed};
    node = {id, endpt, aoi, time};
    
    main functions:
    
    join(addr, aoi, done_callback)      join a VON network with a given gateway (entry) 
    leave()                             leave the VON network
    move(aoi)                           move the AOI to a new position (or change radius)
    list();                             get a list of AOI neighbors
    send(id, msg);                      send a message to a given node
          
    history: 
    2012-08-15      init
        
*/

var vast = (typeof module === 'undefined' ? {} : module.exports);

(function() {

/**
 * vast.io
 * Copyright(c) 2012 Imonology <dev@imonology.com>
 */

(function (exports, global) {

    /**
     * IO namespace.
     *
     * @namespace
     */
  
    var vast = exports;
  
    /**
     * VAST.IO version
     *
     * @api public
     */
  
    vast.version = '0.0.1';
  
    /**
     * Protocol implemented.
     *
     * @api public
     */
  
    vast.protocol = 1;
  
    /**
     * AOI neighbors, will be kept updated only after calling list()
     *
     * @api public
     */
  
    vast.neighbors = {};

    // ID for myself, 0 indicates ready to be assigned
    vast.id = 0;    


    /**
     * Joining a VON network to create a VON node
     *
     * @param {String} uri
     * @Param {Boolean} force creation of new socket (defaults to false)
     * @api public
     */
     
    // create a websocket to connect to VON warpper server
    var socket = undefined; 
    var _list_callback = undefined;
    var times = 0;
    
    // join a VON network with a given gateway (entry) 
    vast.join = function (addr, aoi, done_callback) {
        
        console.log('times: ' + times);
                
        // TODO: validate parameters (addr has 'host' 'port'?)

        // create socket
        var socketio_url = 'http://' + addr.host + ':' + addr.port;
        console.log('url: ' + socketio_url);
        socket = io.connect(socketio_url);
        
        // first connect to socket.io server (to join VON)
        // NOTE: addr specify the socket.io server and not VON gateway (is setup at the socket.io server)
        //       so there's no need to send here
        socket.emit('join', {aoi: aoi});
                 
        // process response to 'join'
        socket.on('join_r', function (data) {
            console.log(data);
            
            //console.log('join successful, id: ' + data.id);
            
            if (done_callback !== undefined)
                done_callback(data.id);
        });        
            
        /**
         * Manages messages to/from hosts.
         *
         */
                        
        // process response to 'leave'
        socket.on('leave_r', function (data) {
            console.log(data);
            
            console.log('leave successful');
        });
            
        // process neighbor list
        socket.on('neighbors', function (data) {
            //console.log(data);
        
            // notify client
            if (_list_callback != undefined)
                _list_callback(data);            
        });
        
        // process a custom message
        socket.on('message', function (data) {
            console.log(data);
        });        
         
    }
    
    // leave the VON network
    vast.leave = function () {
        
        // check if we can send
        if (socket === undefined) {
            LOG.error('not yet joined, cannot leave');
            return;
        }
    
        // send leave request
        socket.emit('leave', {});        
    }

    // move the AOI to a new position (or change radius)
    vast.move = function (aoi) {
        // check if aoi info is sufficient
        if (aoi.hasOwnProperty('center') === false ||
            aoi.center.hasOwnProperty('x') === false ||
            aoi.center.hasOwnProperty('y') === false) {

            LOG.error('new move position not supplied, ignore move request');
            return; 
        }

        // check if we can send
        if (socket === undefined) {
            LOG.error('not yet joined, cannot move');
            return;
        }
        
        // send move request
        socket.emit('move', {aoi: aoi}); 
    }
    
    // get a list of AOI neighbors
    vast.list = function (list_callback) {
    
        // check if we can send
        if (socket === undefined) {
            LOG.error('not yet joined, cannot list');
            return;
        }
        
        // record callback when list returns neighbors
        if (_list_callback === undefined)
            _list_callback = list_callback;
        
        // send move request
        socket.emit('list', {}); 
    }
    
    // send a message to a given node
    vast.send = function (id, msg) {

        // check if we can send
        if (socket === undefined) {
            LOG.error('not yet joined, cannot send');
            return;
        }
        
        // send move request
        socket.emit('send', {id: id, msg: msg}); 
    }    
    
    /**
     * Manages connections to hosts.
     *
     * @param {String} uri
     * @Param {Boolean} force creation of new socket (defaults to false)
     * @api public
     */
  
    /*
    vast.connect = function (host, details) {
      var uri = vast.util.parseUri(host)
        , uuri
        , socket;
  
      if (global && global.location) {
        uri.protocol = uri.protocol || global.location.protocol.slice(0, -1);
        uri.host = uri.host || (global.document
          ? global.document.domain : global.location.hostname);
        uri.port = uri.port || global.location.port;
      }
  
      uuri = vast.util.uniqueUri(uri);
  
      var options = {
          host: uri.host
        , secure: 'https' == uri.protocol
        , port: uri.port || ('https' == uri.protocol ? 443 : 80)
        , query: uri.query || ''
      };
  
      vast.util.merge(options, details);
  
      if (options['force new connection'] || !vast.sockets[uuri]) {
        socket = new vast.Socket(options);
      }
  
      if (!options['force new connection'] && socket) {
        vast.sockets[uuri] = socket;
      }
  
      socket = socket || vast.sockets[uuri];
  
      // if path is different from '' or /
      return socket.of(uri.path.length > 1 ? uri.path : '');
    };
    */
         
})('object' === typeof module ? module.exports : (this.vast = {}), this);

// overall end
})(); 
