# Matcher
The spatial message broker for VAST.js.
 
- [ Matcher](#vastjs)
- [Default Parameters](#default-parameters)
- [The Gateway Matcher](#the-gateway-matcher)
- [The VON Peer Worker](#the-von-peer-worker)
- [API](#api)
    - [Subscription](#subscription)
    - [Publication](#publication)
    - [Point Packet](#point-packet)
    - [Area Packet](#area-packet)
    - [Matcher Messages](matcher-messages)

# Default Parameters
```sh
VON Port:                   8000 # automatically increments if 8000 is unavalable
Client Port:                20000  # automatically increments if 20000 is unavalable
Global Server Hostname:     'localhost' # assumes GS is running on local machine, change if necessary
Global Server Port:         7777
RequireGS:                  false # set to true to enable GS and visualiser 
```

# The Gateway Matcher
The Gateway matcher is the matcher that runs on top of the Gateway VON peer, and is the matcher that all new clients first connect to. When a new client connects, the GW assigns it an ID and sends a FIND_MATCHER message to the accepting matcher over VON (which could be the GW itself). When a FOUND_MATCHER message returns, the GW informs the new client of its real "owner" matcher and the client establishes a connection.  

<img src="./images/client_join.png" alt="drawing" width="400"/>

# The VON Peer Worker
The VON Peer Worker (./lib/VON_peer_worker.js) is the mechanism whereby the VON peer and matcher are seperated to run on two seperate threads.  
In a single threaded implementation, the VON peer is instantiated within the matcher, and the VON peers functions and properties can be accessed directly. In the current worker-thread implementation, the matcher is only capable of sending and receiveing pointMessages and areaMessages through the VON using the VON_peer_worker.  
  
The matcher and the VON peer worker "communicate" using worker-threads messages.

# API
## Subscription
The subscription is defined in ./lib/types.js

| Property      | Description |
| -----------   | ----------- |  
| hostID        | The ID of the matcher/(VON peer) that 'owns' this subscription |  
| hostPos       | The position of the host matcher. Used to forward matched overlapping/distant subscriptions back to the host |  
| clientID      | The ID of the client who requested this subscription |
| subID         | A unique ID to identify this subscription |
| channel       | The channel that this subscription is for. _Wildcards are_ **not** _supported_ |  
| aoi           | The Area of Interest that this subscription is for |
| recipients    | A list containing _at least_ all of this peer's enclosing neighbours who also received this subscription |
---
<br/><br/>

## Publication
The publication is defined in ./lib/types.js

| Property      | Description |
| -----------   | ----------- |  
| payload       | The application-specific payload of the publication. Any JSON object (serialisable by socket.io) |
| channel       | The channel that this publication is for |  
| aoi           | The Area of Interest that this publication is for |
| recipients    | A list containing _at least_ all of this peer's enclosing neighbours who also received this publication |
|               | |
| **Properties to Remove^** |
| clientID      | The ID of the client that sent this publication. Unnecessary field for matcher-layer. Specify in payload for application-specific requirements |
| matcherID     | The ID of the matcher/(VON peer) responsible for the client that sent this publicationtion  |
| chain         | This is the list of VON IDs (in order) that specify how the publication was forwarded on the VON layer | 

**^A Note on Properties To Remove**  
These fields are used for bug fixing and verification of SPS functions. They are not needed for VAST.js to function, and should be removed.

---
<br/><br/>

## Point Packet
The point packet is used to send [matcher messages](matcher-messages) to a point in the VE using pointMessage(...) in VON_peer. 
  
| Property      | Description |
| -----------   | ----------- |  
| type          | The type of [Matcher Message](matcher-messages) |
| msg           | The message content |
| sender        | The ID of the matcher that sent the message |
| sourcePos     | The position of the sender |
| targetPos     | The target position |
| chain^        | This is the list of VON IDs (in order) that specify how the publication was forwarded on the VON layer |
| checklist^^   | Optional checklist used for filtering |


^: The chain field is only used for debugging. Remove it in the future  
^^: The checklist field should rather be passed as an additional argument to the pointMessage(...) function in VON_peer.js. It was only added to pointPacket to simplify sendWorkerMessage(...) in matcher.js.  

---
<br/><br/>

## Area Packet
The area packet is used to send [matcher messages](matcher-messages) to an area in the VE using areaMessage(...) and forwardOverlapping(...) in VON_peer.js. 
  
| Property      | Description |
| -----------   | ----------- |  
| type          | The type of [Matcher Message](matcher-messages) |
| msg           | The message content |
| sender        | The ID of the matcher that sent the message |
| sourcePos     | The position of the sender |
| targetAoI     | The target Area of Interest |
| recipients    | A list containing _at least_ all of this peer's enclosing neighbours who also received this message |
| chain^        | This is the list of VON IDs (in order) that specify how the publication was forwarded on the VON layer |


^: The chain field is only used for debugging. Remove it in the future    

---
<br/><br/>

## Matcher Messages
These are an enumeration that specify the type of message that one matcher is sending to another (or itself).  
This is declared in ./lib/common.js  

| Message       | Description   |
| -----------   | -----------   |
| FIND_MATCHER  | Sent by GW to the position of a joining client to find the accepting matcher |
| FOUND_MATCHER | The response returned to the GW from the accepting matcher, containing its ID, address and port |
| PUB           | Contains a client publication and is sent to the pub's AoI |
| PUB_MATCHED   | Sent to the owner matcher for publications matched by overlapping / distant subscriptions. |
| SUB_NEW       | Sent to matchers to indicate a new subscription that they must maintain |
| SUB_DELETE    | Sent to matchers to notify them of a deleted subscription |
| **TO BE ADDED**|
| SUB_UPDATE    | Send to the _old_ AoI of a sub to notify of _new_ sub details. Also need to inform new matchers if relevant |

---
<br/><br/>  


