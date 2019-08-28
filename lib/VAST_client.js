// This will be the main Vast client, containing VON peers and matchers

var common = require('./common.js');

function VASTClient(is_Client, host, port, radius, local_IP, x, y) {
    LOG.debug("Constructing VASTClient");

    // msg handlers
    var _msg_handler;

    // client ID
    var _client_id;

    // local GWaddr variable
    var _addr = { host: host, port: port };

    // VON node definition
    var VONNode = function (isClient, GWaddr, radius, localIP, x, y) {
        var port = GWaddr.port;

        LOG.debug("Creating VON peer");
        // create GW or a connecting client;
        var peer = new VON.peer();
        peer.debug(false);
        var aoi  = new VAST.area(new VAST.pos(x,y), radius);
        _msg_handler = peer.getHandler();

        // perform movement
        var moveNode = function (peer) {

            try {
                var new_pos = movement[num-1][moveCount].split(',');
            } catch (e) {
                tick_id = undefined;
                return false;
            }
            if (typeof new_pos[0] == 'undefined' || typeof new_pos[1] == 'undefined') {
                console.log("Stopping movement tick");
                tick_id = undefined;
                return false;
            }

            aoi.center.x = Math.floor(new_pos[0]);
            aoi.center.y = Math.floor(new_pos[1]);

            LOG.debug('node num: ' + num + ' moves to ' + aoi.center);
            peer.move(aoi);
        }

        var moveGW = function (peer) {
            var new_pos = movement[num-1][0].split(',');

            aoi.center.x = Math.floor(new_pos[0]);
            aoi.center.y = Math.floor(new_pos[1]);

            LOG.debug('node num: ' + num + ' moves to ' + aoi.center);
            peer.move(aoi);
        }

        LOG.layer(aoi.center);
        peer.init((isClient ? VAST.ID_UNASSIGNED : VAST.ID_GATEWAY), port, localIP, function () {
            peer.join(GWaddr, aoi,

                // done callback
                function (id) {
                    LOG.warn('joined successfully! id: ' + id + '\n');

                    _client_id = id;


                    if (id !== VAST.ID_GATEWAY){
                        //tick_id = setInterval(function(){moveNode(peer)}, tick_interval);
                    } else {
                        //console.log("Gateway move has started");
                        //setInterval(function(){moveGW(peer)}, tick_interval);
                    }
                },

                function (id) {
                    if (id !== VAST.ID_GATEWAY){
                        //tick_id = setInterval(function(){moveNode(peer)}, tick_interval);
                    } else {
                        //console.log("Gateway move has started");
                        //setInterval(function(){moveGW(peer)}, tick_interval);
                    }
                }
            );
        }, function (vonPeer, id, port) {
            LOG.debug("Creating Matcher");
            LOG.debug("ID: " + id + " port: " + port);

            // a matcher unit
            var matcher = new VAST.matcher(vonPeer);
            matcher.init(id, port, function (gwaddr) {
                LOG.info("VAST_client::VONNode => matcher init complete. GWaddr: ");
                LOG.info(gwaddr);
                matcher.join(GWaddr, aoi, function (id,msg_handler) {
                    LOG.info("Matcher finished joining the overlay!");
                });
            });
        });

        return peer;
    }

    // instantiate the VON peer
    LOG.debug("Creating VONNode");
    var vonPeer = new VONNode(is_Client, _addr, radius, local_IP, x, y);
}

// export the class with conditional check
if (typeof module !== "undefined")
	module.exports = VASTClient;
