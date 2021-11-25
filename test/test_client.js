const client = require("../lib/client");
require("../lib/common.js");
require("dotenv").config();
const SIZE = 1000; // world size
const fs = require("fs");
const csv = require("csv-parser");
// my position and AoI to subscribe for PONG messages
var x = process.argv[2] || Math.random() * SIZE;
var y = process.argv[3] || Math.random() * SIZE;
var r = process.argv[4] || 10;
var type = process.argv[5];

if (type == "subscribe") {
  UTIL.lookupIP(process.env.COMPUTER_NAME, function (addr) {
    GW_addr = addr;

    C = new client(GW_addr, 20000, x, y, r, function (id) {
      _id = id;

      C.subscribe(x, y, r, "PING");
      // console.log('Client: ' + id + ' subscribing for pings at {x: '+x2+'; y: '+y2+'; radius: '+r2+'}');
    });
  });
} else if (type == "publish") {
  UTIL.lookupIP(process.env.COMPUTER_NAME, function (addr) {
    GW_addr = addr;
    const data = [];

    function writeToCSVFile() {
      fs.createReadStream("./output.csv")
        .pipe(csv())
        .on("data", function (row) {
          console.log(row);
          const _data = {
            x: row.x,
            y: row.y,
            r: row.r,
          };
          data.push(_data);
        })
        .on("end", function () {
          console.table(data);
          // TODO: SAVE users data to another file
        });
      data.push({ x, y, r });
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
      const header = ["x, y, r"];

      const rows = data.map((d) => `${d.x}, ${d.y}, ${d.r}`);
      return header.concat(rows).join("\n");
    }
    writeToCSVFile();
    C = new client(GW_addr, 20000, x, y, r, function (id) {
      _id = id;
      C.publish(x, y, r, "50", "Channel");
    });
  });
} else if (type == "unsubscribe") {
  UTIL.lookupIP(process.env.COMPUTER_NAME, function (addr) {
    GW_addr = addr;

    C = new client(GW_addr, 20000, x, y, r, function (id) {
      _id = id;
      C.unsubscribe("Channel");
    });
  });
}
