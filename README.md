# VAST.js
P2P Spatial Publish and Subscribe built on the Voronoi Overlay Network (VON).
 
- [VAST.js](#vastjs)
- [Introduction to VAST.js](#introduction-to-vastjs)
    - [Basic Stricture](#basic-structure)
    - [Matchers](#matchers)
    - [Voronoi Overlay Network](#voronoi-overlay-network)
- [Dependancies](#dependancies)
- [Getting Started](#getting-started)

# Introduction to VAST.js
## Basic Structure
<img src="./docs/images/VAST_Layers.png" alt="drawing" width="400"/>

## Matchers
[Clients](./docs/client.md) establish connections to [matchers](./docs/matcher.md) based on their position in the environment. Matchers act as "spatial message brokers", i.e. they are responsible for handling subscription requests from their own clients and for matching publications to subscriptions.
Each matcher keeps a list of all subscriptions of its own clients as well as copies of "ovelapping" subscriptions for clients connected to other matchers.  
  
  
Matchers are not "aware" of each other and do not have direct connections, instead each matcher has an underlying [VON Peer](./docs/VON.md), which can be used to send any matcher-to-matcher packets with the newly implemented spatial forwarding functions in the VON peer. 

## Voronoi Overlay Network
The Voronoi Overlay Network (VON) is a dynamic, self-organising peer-to-peer network that establishes mutual awareness and a TCP socket between each peer and its neighbours in the virtual environment. Each peer maintains a localised Voronoi partition of its enclosing, AoI and boundary neighbours, which is shared between peers to facilitate neighbour discovery as peers join, leave and move around the VE. The VON has been extended to send any message to a point or area in the environment, and each VON peer will only receive the message once.
  
For more detail on the VON, see [VON Peer](./docs/VON.md)



# Dependancies
## Worker Threads Module
The VON peer runs on a worker thread of the Matcher. Install in the VAST.js directory using:
```sh
npm install worker-threads
``` 

## Socket.io and Socket.io-client
Currently, the matcher uses socket.io to establish a WebSocket connection with clients.  
The Global Server also uses Socket.io to establish a connection with each matcher.
Clients and matchers also require the socket.io-client module.  
Install in the VAST.js directory using:
```sh
npm install socket.io
npm install socket.io-client
```

# Getting Started




