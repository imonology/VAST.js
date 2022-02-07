// CF Marais December 2021
// A discrete event simulator for VAST, used for code verification and bug finding

// imports
const matcher = require('../lib/matcher.js');
const client = require('../lib/client.js'); 
const { instruction } = require('./types.js');

// Data structures to store matchers
// alias --> matcher{}.
var matchers = {};
var clients = {};

var instructions = [];

// start matchers
instructions.push(new instruction('newMatcher', {alias: 'GW', isGateway: true, host: 'localhost', port: 8000, x: 100, y: 100, radius: 100}));
instructions.push(new instruction('newMatcher', {alias: 'M1', isGateway: false, host: 'localhost', port: 8000, x: 500, y: 500, radius: 100}));

//start clients
instructions.push(new instruction('newClient', {alias: 'C1', host: 'localhost', port: 20000, x: 100, y: 100, radius: 100}));
instructions.push(new instruction('newClient', {alias: 'C2', host: 'localhost', port: 20000, x: 500, y: 500, radius: 100}));

//subscribe
var list = ['C1', 'C2','C3'];
instructions.push(new instruction('subscribe', {alias: 'C1', x: 150, y: 250, radius: 500, channel: 'test'}));

//publish
instructions.push(new instruction('publish', {alias: 'C2', x: 100, y: 200, radius: 500, payload: 'hello?', channel: 'test'}));

console.log(instructions);


// Interpret and execute instruction
var executeInstruction = function(instruction, step, successCallback, failCallback){   
    var opts = instruction.opts;
    var type = instruction.type;
    
    switch (type){
        case 'newMatcher' : {

            if (!matchers.hasOwnProperty(opts.alias)){       

                matchers[opts.alias]= new matcher(opts.isGateway, opts.host, opts.port, opts.x, opts.y, opts.radius, function(id){
                    connected = true;
                    successCallback('Matcher: ' + opts.alias + ' created with ID: ' + id);
                });
            }
            else{
                failCallback('Matcher already exists with alias: ' + opts.alias);
            }
        }
        break;

        case 'newClient' : {
            if(!clients.hasOwnProperty(opts.alias)){
                
                clients[opts.alias] = new client(opts.host, opts.port, opts.x, opts.y, opts.radius, function(id){
                    successCallback('Client ' + opts.alias + ' assigned to matcher: ' + clients[opts.alias]._matcherID);
                });
            }
            else{
                failCallback('client already exists with alias: ' + alias);
            }
        }
        break;

        case 'subscribe' : {

            if(clients.hasOwnProperty(opts.alias)){
                clients[opts.alias].subscribe(opts.x, opts.y, opts.radius, opts.channel);
                successCallback(opts.alias + ': added subscription:', opts.x, opts.y, opts.radius, opts.channel);
            }
            else{
                failCallback('Invalid client alias for subscription: ' + opts.alias);
            }

            
        }
        break;

        case 'publish' : {

            if(clients.hasOwnProperty(opts.alias)){
                clients[opts.alias].publish(opts.x, opts.y, opts.radius, opts.payload, opts.channel);
                successCallback(opts.alias + ' published:', opts.payload, 'on channel: ' + opts.channel)
            }
            else{
                failCallback('client with alias "' + alias + '" does not exist');
            }


            // sub each client in list if they are known
            for( var i = 0; i < clientList.length; i++){
                if(clients.hasOwnProperty(clientList[i])){
                    clients[clientList[opts.alias]].subscribe(x, y, radius, channel);
                }
                else{
                    console.log('Invalid client alias for subscription: ' + clientList[i]);
                }
            }

            successCallback('subscription instruction complete')
        }
        break;

        default: {
            failCallback('instruction at step ' + step + 'is not valid');
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

async function execute(){
    for (var step = 0; step < instructions.length; step++){
        console.log('executing step ' + step);
    
        try {
            var result = await executeInstructionWrapper(instructions[step], step);
            console.log(result);
        }
        catch(error){
            console.log(error);
        }
    }
}

execute();


