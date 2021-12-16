const client = require("../lib/client");
require("../lib/common.js");
var lib = require("../lib/common/logging.js");

var channel="PING"
const SIZE = 1000; 

const fs = require("fs");
var dir = "./logs";
fs.readFile('./logs/file.txt', 'utf8', function(err, data) {
    // if (err) throw err;
    // console.log(data);
    for(var i=0;i<data.length;i=i+15){
      
  // Node Position 
  var x = data[i];
  var y = data[i+2];
  var r = data[i+4];

  // AOI to publish and/or subscribe 
  var type = data[i+12];
  var x2 = data[i+6];
  var y2 = data[i+8];
  var r2 = data[i+10];
  console.log(type)
if (type == "s") {
  UTIL.lookupIP("127.0.0.1", function (addr) {
    GW_addr = addr;
    // subscription channel

    C = new client(GW_addr, 20000, x, y, r, function (id) {
      //new client with location data = {x,y,r}
      _id = id;

      for (var i = 0; i < 1; i++) {
        setTimeout(function timer() {
          C.subscribe(x2, y2, r2, channel); //subscription AOI 
        }, i * 5000);
      }
    });
  });
} else if (type == "p") {
  UTIL.lookupIP("127.0.0.1", function (addr) {
    GW_addr = addr;
    var payload = "payload";

    C = new client(GW_addr, 20000, x, y, r, function (id) {
      _id = id;

      // Make 5 pub requests every 1000ms
      for (var i = 0; i < 1; i++) {
        setTimeout(function timer() {
          C.publish(x2, y2, r2, payload, channel);
         
        }, i * 1000);
      }
    });
  });
} else if (type == "u") {
  UTIL.lookupIP("127.0.0.1", function (addr) {
    GW_addr = addr;

    C = new client(GW_addr, 20000, x, y, r, function (id) {
      _id = id;
      C.unsubscribe(channel);
    });
  });
}


    }
  });
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}


  