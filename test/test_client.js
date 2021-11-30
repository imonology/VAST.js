const client = require("../lib/client");
require("../lib/common.js");
require("dotenv").config();
const SIZE = 1000; // world size
const fs = require("fs");
const csv = require("csv-parser");

var hrTime = process.hrtime()
var timestamp = (hrTime[0] * 1000000 + hrTime[1] / 1000) //current time in microseconds

// my position and AoI to subscribe for PONG messages
var x = process.argv[2] || Math.random() * SIZE;
var y = process.argv[3] || Math.random() * SIZE;
var r = process.argv[4] || 10;
var type = process.argv[5];

// console.log(type)

var channel = 'Channel'


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
    const data = [];

    function writeToCSVFile() {
      fs.createReadStream("./output.csv")
        .pipe(csv())
        .on("data", function (row) {
          console.log(row);
          const _data = {
              timestamp: row.timestamp,
              x: row.x,
              y: row.y,
              r: row.r,
              type: row.type,
          };
          data.push(_data);
        })
        .on("end", function () {
          console.table(data);
          // TODO: SAVE users data to another file
        });
      data.push({timestamp, x, y, r, type});
      const filename = "output.csv";
      fs.writeFile(filename, extractAsCSV(), (err) => {
        if (err) {
          console.log("Error writing to csv file", err);
        } else {
          console.log(`saved as ${filename}`);
        }
      });
    }

    function extractAsCSV() {
      const header = ["time, x, y, r, RequestType"];

      const rows = data.map((d) => `${d.timestamp}, ${d.x}, ${d.y}, ${d.r}, ${d.type}, ${d.channel}`);
      return header.concat(rows).join("\n");
    }
    
    writeToCSVFtaskile();

    C = new client(GW_addr, 20000, x, y, r, function (id) {
      _id = id;

      for (var i = 0; i < 5; i++) {
        C.publish(x, y, r, "100", channel);
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
