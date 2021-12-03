const client = require("../lib/client");
require("../lib/common.js");
var lib = require("../lib/common/logging.js");

// require("dotenv").config();

const SIZE = 1000; // world size
// const csv = require("csv-parser");

const fs = require('fs');
var dir = './logs';

if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
}

// Node Position
var x = process.argv[2] || Math.random() * SIZE;
var y = process.argv[3] || Math.random() * SIZE;
var r = process.argv[4] || 10;

// AOI to publish and/or subscribe
var type = process.argv[5];
var x2 = process.argv[6] || Math.random() * SIZE;
var y2 = process.argv[7] || Math.random() * SIZE;
var r2 = process.argv[8] || 10;

fs.readFile('./logs/Test_Client_Log.txt', 'utf8', function(err, data) {
  if (err) throw err;
  if(data.length===0){
    var client_data_header = ('timestamp, x2, y2, r2, type, channel, payload \n') 
    result = lib.LogToFile('./logs/Test_Client_Log.txt', client_data_header)    
  }
});

if (type == "subscribe") {
  UTIL.lookupIP("127.0.0.1", function (addr) {
    GW_addr = addr;
    // subscription channel
    

    C = new client(GW_addr, 20000, x, y, r,  function (id) { //new client with location data = {x,y,r}
      _id = id;

       for (var i = 0; i < 5; i++) {
        setTimeout(function timer() {

      C.subscribe(x2, y2, r2, channel); //subscription AOI
      sub_data = (''+UTIL.getTimestamp()+', '+x2+', '+y2+', '+r2+', '+type+', '+channel+', N/A \n');
      result = lib.LogToFile('./logs/Test_Client_Log.txt', sub_data);

      console.log('Client ' +_id+ + ' "is subscribing to the" '+channel+' channel around area : {x: '+x2+'; y: '+y2+'; radius: '+r2+'}');
    }, i * 5000);        
  }
    });
  });
} else if (type == "publish") {
  
    UTIL.lookupIP("127.0.0.1", function (addr) {
    GW_addr = addr;
    var payload = "payload";
        
    C = new client(GW_addr, 20000, x, y, r, function (id) {
      _id = id;

      // Make 5 pub requests every 1000ms
      for (var i = 0; i < 5; i++) {
        setTimeout(function timer() {
          C.publish(x2, y2, r2, payload, channel)
          pub_data = (''+UTIL.getTimestamp()+', '+x2+', '+y2+', '+r2+', '+type+', na, '+payload+' \n');
          result = lib.LogToFile('./logs/Test_Client_Log.txt', pub_data);
          
          console.log('Client '+_id+' is publishing to area : {x: '+x2+'; y: '+y2+'; radius: '+r2+'}');
        }, i * 1000);
        
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
   });}


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