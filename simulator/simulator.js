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
const { map } = require('jquery');

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
        var dataFromTextFile = []
        const fileStream = fs.createReadStream(filename);

        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        // Note: we use the crlfDelay option to recognize all instances of CR LF
        // ('\r\n') in input.txt as a single line break.

        for await (const data of rl) {
            var dataLine = []
            var cur = "";
            for (var d of data) {
                if ((d >= 'a' && d <= 'z') || (d >= 'A' && d <= 'Z') || (d >= '0' && d <= '9') || (d >= '_')) {
                    cur += d;
                } else {
                    if (cur.length != 0) dataLine.push(cur);
                    cur = ""
                }
            }
            if (cur.length != 0) dataLine.push(cur);
            dataFromTextFile.push(dataLine)
        }

        // console.log(dataFromTextFile);
        // console.log(dataFromTextFile.map(data=>data));
        return dataFromTextFile

    } catch (e) {
        console.log('Error:', e.stack);
    }
}

var dataFromTextFile = dataFromTextFiles('./simulator/instruction.txt').then(dataFromTextFile => {
    dataFromTextFile.map(dataFromTextFile => {
        
        if(dataFromTextFile[0] == '//'){
            console.log(dataFromTextFile);
        }

        else if (dataFromTextFile[0] == 'wait'){
            if (dataFromTextFile.length != 2) {
                console.log("wrong input");
            }
            else {
                instructions.push(new instruction(dataFromTextFile[0],
                    {
                        waitTime: dataFromTextFile[1]
                    }
                ));
            }
        }

        else if (dataFromTextFile[0] == 'newMatcher') {
            if (dataFromTextFile.length != 8) {
                console.log("wrong input");

            }
            else {
                instructions.push(new instruction(dataFromTextFile[0],
                    {
                        alias: dataFromTextFile[1],
                        isGateway: (dataFromTextFile[2] == 'true') ? true : false,
                        host: dataFromTextFile[3],
                        port: Number(dataFromTextFile[4]),
                        x: Number(dataFromTextFile[5]),
                        y: Number(dataFromTextFile[6]),
                        radius: Number(dataFromTextFile[7])
                    })
                );
            }
        }
        else if (dataFromTextFile[0] == 'newClient') {
            if (dataFromTextFile.length != 7) {
                console.log("wrong input");
            }
            else {
                instructions.push(new instruction(dataFromTextFile[0],
                    {
                        alias: dataFromTextFile[1],
                        host: dataFromTextFile[2],
                        port: Number(dataFromTextFile[3]),
                        x: Number(dataFromTextFile[4]),
                        y: Number(dataFromTextFile[5]),
                        radius: Number(dataFromTextFile[6])
                    }));
            }
        }
        else if (dataFromTextFile[0] == 'subscribe') {
            if (dataFromTextFile.length != 6) {
                console.log("wrong input");
            }
            else {
                instructions.push(new instruction(dataFromTextFile[0],
                    {
                        alias: dataFromTextFile[1],
                        x: Number(dataFromTextFile[2]),
                        y: Number(dataFromTextFile[3]),
                        radius: Number(dataFromTextFile[4]),
                        channel: dataFromTextFile[5]
                    }));
            }
        } else if (dataFromTextFile[0] == 'publish') {
            if (dataFromTextFile.length != 7) {
                console.log("wrong input");
            }
            else {
                instructions.push(new instruction(dataFromTextFile[0],
                    {
                        alias: dataFromTextFile[1],
                        x: Number(dataFromTextFile[2]),
                        y: Number(dataFromTextFile[3]),
                        radius: Number(dataFromTextFile[4]),
                        payload: dataFromTextFile[5],
                        channel: dataFromTextFile[6]
                    }));
            }
        }
    })


    console.log(instructions);
    execute();
});

dataFromTextFile;
  


