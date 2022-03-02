// CF Marais December 2021
// A discrete event simulator for VAST, used for code verification and bug finding

// imports
const matcher = require("../lib/matcher.js");
const client = require("../lib/client.js");
const { instruction } = require("./types.js");
// Data structures to store matchers
// alias --> matcher{}.
var matchers = {};
var clients = {};
var instructions = [];
//importing data from text file
var fs = require("fs");
const readline = require("readline");
const { map } = require("jquery");
//taking values from the terminal
var filename = process.argv[2] || "instruction.txt";
if (filename.length > 4 && filename.slice(-4) != ".txt") {
  console.log("Please Provide A Text File");
  return;
}

//function to obtain all the data from a text file
var dataFromTextFiles = async (filename) => {
  try {
    var dataFromTextFile = [];
    const fileStream = fs.createReadStream(filename);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });
    // Note: we use the crlfDelay option to recognize all instances of CR LF
    // ('\r\n') in input.txt as a single line break.

    for await (const data of rl) {
      var dataLine = [];
      var cur = "";
      var isString = 0;
      for (var d of data) {
        if (d == '"') {
          isString = 1 - isString;
        } else if (isString == 1) {
          cur += d;
        } else if (
          (d >= "a" && d <= "z") ||
          (d >= "A" && d <= "Z") ||
          (d >= "0" && d <= "9")
        ) {
          cur += d;
        } else {
          if (cur.length != 0) dataLine.push(cur);
          cur = "";
        }
      }
      if (cur.length != 0) dataLine.push(cur);
      dataFromTextFile.push(dataLine);
    }

    // console.log(dataFromTextFile);
    // console.log(dataFromTextFile.map(data=>data));
    return dataFromTextFile;
  } catch (e) {
    console.log("Error:", e.stack);
  }
};

var dataFromTextFile = dataFromTextFiles(filename).then((dataFromTextFile) => {
  // console.log("debo:", dataFromTextFile)
  var i = 0,f=0;
  dataFromTextFile.map((dataFromTextFile) => {
    console.log("hi", dataFromTextFile);
    switch (dataFromTextFile[0]) {
      case "end":
        f=1;
        break;
      case "":
          if(f==1)break;
        i++;
        break; //for empty line
      case "//":
        if(f==1)break;
        console.log(dataFromTextFile);
        i++;
        break;
      case "newMatcher":
        if(f==1)break;
        if (dataFromTextFile.length != 8) {
          console.log(`wrong input in line number ${i}`);
        } else {
          instructions.push(
            new instruction(dataFromTextFile[0], {
              alias: dataFromTextFile[1],
              isGateway: dataFromTextFile[2] == "true" ? true : false,
              host: dataFromTextFile[3],
              port: Number(dataFromTextFile[4]),
              x: Number(dataFromTextFile[5]),
              y: Number(dataFromTextFile[6]),
              radius: Number(dataFromTextFile[7]),
            })
          );
        }
        i++;
        break;
      case "newClient":
        if(f==1)break;
        if (dataFromTextFile.length != 7) {
          console.log(`wrong input in line number ${i}`);
        } else {
          instructions.push(
            new instruction(dataFromTextFile[0], {
              alias: dataFromTextFile[1],
              host: dataFromTextFile[2],
              port: Number(dataFromTextFile[3]),
              x: Number(dataFromTextFile[4]),
              y: Number(dataFromTextFile[5]),
              radius: Number(dataFromTextFile[6]),
            })
          );
        }
        i++;
        break;
      case "subscribe":
        if(f==1)break;
        if (dataFromTextFile.length != 6) {
          console.log(`wrong input in line number ${i}`);
        } else {
          instructions.push(
            new instruction(dataFromTextFile[0], {
              alias: dataFromTextFile[1],
              x: Number(dataFromTextFile[2]),
              y: Number(dataFromTextFile[3]),
              radius: Number(dataFromTextFile[4]),
              channel: dataFromTextFile[5],
            })
          );
        }
        i++;
        break;
      case "publish":
        if(f==1)break;
        if (dataFromTextFile.length != 7) {
          console.log(`wrong input in line number ${i}`);
        } else {
          instructions.push(
            new instruction(dataFromTextFile[0], {
              alias: dataFromTextFile[1],
              x: Number(dataFromTextFile[2]),
              y: Number(dataFromTextFile[3]),
              radius: Number(dataFromTextFile[4]),
              payload: dataFromTextFile[5],
              channel: dataFromTextFile[6],
            })
          );
        }
        i++;
        break;
      default:
        if(f==1)break;
          console.log(`Wrong Input in line number${i}`)
        i++;
    }
  });

  console.log(instructions);
  execute();
});
dataFromTextFile;

// // start matchers
// instructions.push(new instruction('newMatcher', {alias: 'GW', isGateway: true, host: 'localhost', port: 8000, x: 100, y: 100, radius: 100}));
// instructions.push(new instruction('newMatcher', {alias: 'M1', isGateway: false, host: 'localhost', port: 8000, x: 500, y: 500, radius: 100}));

// //start clients
// instructions.push(new instruction('newClient', {alias: 'C1', host: 'localhost', port: 20000, x: 100, y: 100, radius: 100}));
// instructions.push(new instruction('newClient', {alias: 'C2', host: 'localhost', port: 20000, x: 500, y: 500, radius: 100}));

// //subscribe
var list = ["C1", "C2", "C3"];
// instructions.push(new instruction('subscribe', {alias: 'C1', x: 150, y: 250, radius: 500, channel: 'test'}));

// //publish
// instructions.push(new instruction('publish', {alias: 'C2', x: 100, y: 200, radius: 500, payload: 'hello?', channel: 'test'}));

// Interpret and execute instruction
var executeInstruction = function (
  instruction,
  step,
  successCallback,
  failCallback
) {
  var opts = instruction.opts;
  var type = instruction.type;

  switch (type) {
    case "newMatcher":
      {
        if (!matchers.hasOwnProperty(opts.alias)) {
          matchers[opts.alias] = new matcher(
            opts.isGateway,
            opts.host,
            opts.port,
            opts.x,
            opts.y,
            opts.radius,
            function (id) {
              connected = true;
              successCallback(
                "Matcher: " + opts.alias + " created with ID: " + id
              );
            }
          );
        } else {
          failCallback("Matcher already exists with alias: " + opts.alias);
        }
      }
      break;

    case "newClient":
      {
        if (!clients.hasOwnProperty(opts.alias)) {
          clients[opts.alias] = new client(
            opts.host,
            opts.port,
            opts.x,
            opts.y,
            opts.radius,
            function (id) {
              successCallback(
                "Client " +
                  opts.alias +
                  " assigned to matcher: " +
                  clients[opts.alias]._matcherID
              );
            }
          );
        } else {
          failCallback("client already exists with alias: " + alias);
        }
      }
      break;

    case "subscribe":
      {
        if (clients.hasOwnProperty(opts.alias)) {
          clients[opts.alias].subscribe(
            opts.x,
            opts.y,
            opts.radius,
            opts.channel
          );
          successCallback(
            opts.alias + ": added subscription:",
            opts.x,
            opts.y,
            opts.radius,
            opts.channel
          );
        } else {
          failCallback("Invalid client alias for subscription: " + opts.alias);
        }
      }
      break;

    case "publish":
      {
        if (clients.hasOwnProperty(opts.alias)) {
          clients[opts.alias].publish(
            opts.x,
            opts.y,
            opts.radius,
            opts.payload,
            opts.channel
          );
          successCallback(
            opts.alias + " published:",
            opts.payload,
            "on channel: " + opts.channel
          );
        } else {
          failCallback('client with alias "' + alias + '" does not exist');
        }

        // sub each client in list if they are known
        for (var i = 0; i < clientList.length; i++) {
          if (clients.hasOwnProperty(clientList[i])) {
            clients[clientList[opts.alias]].subscribe(x, y, radius, channel);
          } else {
            console.log(
              "Invalid client alias for subscription: " + clientList[i]
            );
          }
        }

        successCallback("subscription instruction complete");
      }
      break;

    default: {
      failCallback("instruction at step " + step + "is not valid");
    }
  }
};

// A function wrapper used to execute steps synchronously using a promise
var executeInstructionWrapper = function (instruction, step) {
  return new Promise(function (resolve, reject) {
    executeInstruction(
      instruction,
      step,
      function (successResponse) {
        resolve(successResponse);
      },

      function (failResponse) {
        reject(failResponse);
      }
    );
  });
};

async function execute() {
  for (var step = 0; step < instructions.length; step++) {
    console.log("executing step " + step);

    try {
      var result = await executeInstructionWrapper(instructions[step], step);
      console.log(result);
    } catch (error) {
      console.log(error);
    }
  }
}
