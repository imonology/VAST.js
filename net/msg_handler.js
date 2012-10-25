
/*
 * VAST, a scalable peer-to-peer network for virtual environments
 * Copyright (C) 2005-2011 Shun-Yun Hu (syhu@ieee.org)
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 */

/*  
    msg_handler.js

    a simple class to dispatch incoming messages to registered handlers,
    while translating internal objects to outgoing message types (in JSON format)

    basic goals:
        - allow multiple instances of the message handler be created, each responsible for a different logic
        - allow a single network layer be used by multiple handlers
        - ease of development (handle writers need not know each other, can be independently plug in & out)
        - automatic dispatching to the right handler for message handling
    
    supported functions:
    
    // basic callback / structure
        sendMessage
        sendPack
        _msgHandler
    
    // constructor
    
    // basic functions
    
    // accessors
      
    history:
        2012-10-03              initial version 
*/

function msg_handler(l_connHandler, l_disconnHandler, l_packetHandler, l_self_id) {
        
    // prevent incorrect init
    if (l_connHandler === undefined || 
        l_disconnHandler === undefined ||
        l_packetHandler === undefined)
        return;
          
    //
    // public methods (usable by classes that inherent the msg_handler class)
    //
                
    //
    //  private methods (internal usage, some are replacable at inherted class)
    //
      
    // constructor
    LOG.debug('msg_handler init, l_packetHandler: ' + typeof l_packetHandler);
  
    // NOTE: packet & message handlers cannot be of prototype-style, 
    //       as they need to occupy memory independently for each msg handler instance
    
    // default packet handler (does not process anything)    
    //var _handlePacket = undefined;
    
    // keep local reference for 'this'
    var _that = this;    
    
    // handler for incoming messages
    this.msgHandler = function (from_id, msg) {
                        
        // prevent processing invalid msg
        // NOTE: we allow for empty message (?) such as VON_DISCONNECT
        if (msg == '' || msg === null || msg === undefined) {
            LOG.error('msgHandler: invalid msg from [' + from_id + '], skip processing');
            return;
        }
    
        var pack;
        
        try {
            // convert msg back to js_obj
            pack = JSON.parse(msg);
        }
        catch (e) {
            LOG.error('msgHandler: convert to js_obj fail: ' + e + ' msg: ' + msg);
            return;
        }
          
        if (l_packetHandler === undefined) {
            LOG.error('no valid packet handler for type: ' + pack.type + ' msg: ' + msg);         
            return;
        }
    
        //LOG.debug('call packetHandler: ' + typeof l_packetHandler);
        if (l_packetHandler(from_id, pack) === false)
            LOG.error('cannot recongize message type: ' + pack.type + ' msg: ' + msg);         
    }    
    
    /*
    // initialize message handler
    this.init = function (connHandler, disconnHandler, packetHandler, self_id) {
  
        // replace default with provided custom handler, if any
        if (typeof packetHandler === 'function') {
            LOG.warn('handlePacket type is: ' + typeof _handlePacket);
            _handlePacket = packetHandler;
        }
 
        LOG.debug('msg_handler:init() called. checking existence of net object...');
 
        // create new net layer if does not exist
        if (this.net === undefined) {
            LOG.warn('creating new VASTnet...');
            
            // create network layer & start listening
            // NOTE: internal handlers must be defined before creating the VAST.net instance        
            this.net = new VAST.net(this.msgHandler, connHandler, disconnHandler, self_id);    
        }    
    } 
    */

    // create new net layer if does not exist
    LOG.warn('creating new VASTnet... net: ' + typeof this.net);
        
    // create network layer & start listening
    // NOTE: internal handlers must be defined before creating the VAST.net instance        
    this.net = new VAST.net(this.msgHandler, l_connHandler, l_disconnHandler, l_self_id);    

    
} // end msg_handler


// send a pack object to its destinated targets
// TODO: this previously exist at the network layer, should move it there?
msg_handler.prototype.sendPack = function (pack, is_reliable) {

    // serialize string
    var encode_str = JSON.stringify(pack);
    
    // go through each target and send        
    // TODO: optimize so only one message is sent to each physical host target        
    for (var i=0; i < pack.targets.length; i++)            
        this.net.send(pack.targets[i], encode_str, is_reliable);
}

// send a javascript object to a SINGLE target node (given message 'type' and 'priority')
msg_handler.prototype.sendMessage = function (target, msg_type, js_obj, priority, is_reliable) {

    // create a delivery package to send
    var pack = new VAST.pack(
        msg_type,
        js_obj,
        priority);
        
    pack.targets.push(target);
    
    //console.log('this.net: ' + this.net + ' target: ' + target);
    
    // convert pack to JSON or binary string
    // NOTE: we pass the same context
    return msg_handler.prototype.sendPack.call(this, pack, is_reliable);
}

if (typeof module !== 'undefined')
	module.exports = msg_handler;
