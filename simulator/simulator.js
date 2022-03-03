// CF Marais December 2021
// A discrete event simulator for VAST, used for code verification and bug finding

// imports
const matcher = require('../lib/matcher.js');
const client = require('../lib/client.js'); 
const { instruction } = require('./types.js');

var log = LOG.newLayer('simulator', 'simulator', 'logs_and_events', 5, 5);

// Data structures to store matchers
// alias --> matcher{}.
var matchers = {};
var matcherIDs2alias = {};
var clients = {};
var clientIDs2alias = {};

var instructions = [];

//importing data from text file
var fs = require('fs');
const readline = require('readline');
const { map, data } = require('jquery');

var filename = process.argv[2] || "./simulator/instruction.txt";
if (filename.length > 4 && filename.slice(-4) != ".txt") {
  console.log("Please Provide A Text File");
  return;
}

// Interpret and execute instruction
async function executeInstruction(instruction, step, success, fail){   
    var opts = instruction.opts;
    var type = instruction.type;
    
    switch (type){

        case 'wait' : {
            delay(opts.waitTime, function(){
                success('waited for ' + opts.waitTime + ' milliseconds');
            });
        }
        break;

        case 'newMatcher' : {

            if (!matchers.hasOwnProperty(opts.alias)){       

                matchers[opts.alias]= new matcher(opts.x, opts.y, opts.radius, 
                    {
                        isGateway: opts.isGateway, 
                        host: opts.host, 
                        port: opts.port,
                        alias: opts.alias
                    },
                    function(id){
                        matcherIDs2alias[id] = opts.alias;
                        success('Matcher: ' + opts.alias + ' created with ID: ' + id);
                    }
                );
            }
            else{
                fail('Matcher already exists with alias: ' + opts.alias);
            }
        }
        break;

        case 'newClient' : {
            if(!clients.hasOwnProperty(opts.alias)){
                
                clients[opts.alias] = new  client(opts.host, opts.port, opts.x, opts.y, opts.radius, function(id){
                    clientIDs2alias[id] = opts.alias;
                    clients[opts.alias].setAlias = opts.alias;
                    let m = clients[opts.alias].getMatcherID();
                    success('Client ' + opts.alias + ' assigned to matcher: ' + matcherIDs2alias[m]);
                });
            }
            else{
                fail('client already exists with alias: ' + alias);
            }
        }
        break;

        case 'subscribe' : {

            if(clients.hasOwnProperty(opts.alias)){
                clients[opts.alias].subscribe(opts.x, opts.y, opts.radius, opts.channel);
                success(opts.alias + ': added subscription:', opts.x, opts.y, opts.radius, opts.channel);
            }
            else{
                fail('Invalid client alias for subscription: ' + opts.alias);
            }
        }
        break;

        case 'publish' : {

            if(clients.hasOwnProperty(opts.alias)){
                clients[opts.alias].publish(opts.x, opts.y, opts.radius, opts.payload, opts.channel);
                success(opts.alias + ' published:', opts.payload, 'on channel: ' + opts.channel)
            }
            else{
                fail('client with alias "' + alias + '" does not exist');
            }
        }
        break;

        default: {
            fail('instruction at step ' + step + 'is not valid');
        }
    }
}

// A function wrapper used to execute steps synchronously using a promise
var executeInstructionWrapper = function(instruction, step){
    return new Promise(function(resolve, reject){
        
        executeInstruction(instruction, step, 
            function(successResponse){
                resolve(successResponse);
            },
            
            function(failResponse){
                reject(failResponse);
            });
    });
}

async function execute(step){
    step = step || 0;

    if (step >= instructions.length){
        log.debug('Reached end of instructions');
        return;
    }

    try {
        log.debug('Executing instruction ' + step);
        var result = await executeInstructionWrapper(instructions[step], step);
        log.debug(result);
    }
    catch(error){
        log.error(error);
    }
    execute(step+1);
}

async function delay(m, callback) {    
    m = m || 100;
    await new Promise(function() {
      setTimeout(callback, m);
    });
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
          } 
          
          else if (isString == 1) {
            cur += d;
          } 
          
          else if (
            (d >= "a" && d <= "z") || (d >= "A" && d <= "Z") ||
            (d >= "0" && d <= "9") || (d == "/")) {
            cur += d;
          } 
          
          else {
            if (cur.length != 0) 
                dataLine.push(cur);

            cur = "";
          }
        }
        if (cur.length != 0) 
            dataLine.push(cur);
        
        dataFromTextFile.push(dataLine);
      }
  
      return dataFromTextFile;
    } catch (e) {
      log.error("Error:", e.stack);
    }
  };
  
  var dataFromTextFile = dataFromTextFiles(filename).then((dataFromTextFile) => {
    
    var i = 1;  // line counter
    
    dataFromTextFile.map((dataFromTextFile) => {
        switch (dataFromTextFile[0]) {

            case "wait" :{
                if (dataFromTextFile.length != 2) {
                    log.debug(`wrong input in line number ${i}`);
                }
                else {
                    instructions.push(new instruction(dataFromTextFile[0],
                        {
                            waitTime: dataFromTextFile[1]
                        }
                    ));
                }
                i++;
            }
            break;

            case "newMatcher" :{
                if (dataFromTextFile.length != 8) {
                    log.debug(`wrong input in line number ${i}`);
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
            }
            break;

            case "newClient" :{
                if (dataFromTextFile.length != 7) {
                    log.debug(`wrong input in line number ${i}`);
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
            }
            break;

            case "subscribe" :{
                if (dataFromTextFile.length != 6) {
                    log.debug(`wrong input in line number ${i}`);
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
            } 
            break;

            case "publish" :{
                if (dataFromTextFile.length != 7) {
                    log.debug(`wrong input in line number ${i}`);
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
            }
            break;

            // instruction to end simulation
            case "end" :{
                return;
            }
            break;

            default :{
                // NOT a comment or empty line, alert user
                if (dataFromTextFile.length > 0 && !dataFromTextFile[0].startsWith('//')){
                    log.debug(`Unrecognised Input in line number ${i}`)
                }
                i++;
                break;
            }         
        }
    });

    // start executing once all instructions loaded
    execute();
  });


  dataFromTextFile;