const client = require("../lib/client");
require("../lib/common.js");

require('../lib/common/logger.js'); //for logging

var lib = require("../lib/common/logging.js");

require("dotenv").config();

const SIZE = 1000; // world size
const fs = require("fs");
const csv = require("csv-parser");



// my position and AoI to subscribe for PONG messages
var x = process.argv[2] || Math.random() * SIZE;
var y = process.argv[3] || Math.random() * SIZE;
var r = process.argv[4] || 10;
var type = process.argv[5];

// console.log(type)

var channel = 'Channel'
var payload = 'PING'



// CSV functions to write and read

// const data = [];
// function writeToCSVFile() {
//   fs.createReadStream("./output.csv")
//     .pipe(csv())
//     .on("data", function (row) {
//       // console.log(row);
//       const _data = {
//           timestamp: row.timestamp,
//           x: row.x,
//           y: row.y,
//           r: row.r,
//           type: row.type,
//           payload: row.payload
//       };
//       data.push(_data);
      
//     })
//     .on("end", function () {
//       console.table(data);
//       // TODO: SAVE users data to another file
//     });
//   data.push({timestamp, x, y, r, type, payload});

//   const filename = "output.csv";
  
//   fs.writeFile(filename, extractAsCSV(), (err) => {
//     if (err) {
//       console.log("Error writing to csv file", err);
//     } else {
//       console.log(`saved as ${filename}`);
//     }
//   });
//   // return writeToCSVFile;
// }

// function extractAsCSV() {
//   const header = ["time, x, y, r, RequestType, Payload"];

//   const rows = data.map((d) => `${d.timestamp}, ${d.x}, ${d.y}, ${d.r}, ${d.type}, ${d.payload}`);
//   return header.concat(rows).join("\n");
// }

// // ------ 

// writeToCSVFile();

// if (type == "subscribe") {
//   console.log('true')
  
//   UTIL.lookupIP("127.0.0.1", function (addr) {
//     GW_addr = addr;
      
//       C = new client(GW_addr, 20000, x, y, r, function (id) {
//         _id = id;
  
//         C.subscribe(x, y, r, _id);
//         console.log(_id + ' is subscribing for PONGS around themself at:{x: '+x+'; y: '+y+'; radius: '+r+'}');
//         // console.log('Client: ' + id + ' subscribing for pings at {x: '+x2+'; y: '+y2+'; radius: '+r2+'}');
//       });
//     });
//   }

if (type == "subscribe") {
  UTIL.lookupIP("127.0.0.1", function (addr) {
    GW_addr = addr;

    C = new client(GW_addr, 20000, x, y, r, function (id) {
      _id = id;

      C.subscribe(x, y, r, _id);
      console.log(_id + ' is subscribing for PONGS around themself at:{x: '+x+'; y: '+y+'; radius: '+r+'}');
      // console.log('Client: ' + id + ' subscribing for pings at {x: '+x2+'; y: '+y2+'; radius: '+r2+'}');
    });
  });
} else if (type == "publish") {
  
    UTIL.lookupIP("127.0.0.1", function (addr) {
    GW_addr = addr;
        
    C = new client(GW_addr, 20000, x, y, r, function (id) {
      _id = id;
      
      var pub_data_header = ('timestamp, x, y, r \n')
      result = lib.LogToFile('test.txt', pub_data_header)
      // var pub_data = ('\n '+timestamp+', '+x+', '+y+', '+r+'')

      for (var i = 0; i < 5; i++) {
        setTimeout(function timer() {
          var timestamp = Date.now();
          C.publish(x, y, r, "10", channel)
          pub_data = (''+timestamp+', '+x+', '+y+', '+r+'');
          // B = new LogToFile(process.env.CLIENT_FILENAME, pub_data);
          // console.log(B)
          console.log(pub_data)

          result = lib.LogToFile('test.txt', pub_data)
          // console.log(_id + ' is publishing to area :{x: '+x+'; y: '+y+'; radius: '+r+'}');
        }, i * 1000);
        
      //  console.log("Hi");
     }

    });
  });
} 
else if (type == "unsubscribe") {
  UTIL.lookupIP("127.0.0.1", function (addr) {
    GW_addr = addr;

    C = new client(GW_addr, 20000, x, y, r, function (id) {
      _id = id;
      C.unsubscribe(channel);
    });
  });
}
