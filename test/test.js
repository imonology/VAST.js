const { getTimestamp } = require("../lib/common/util")

console.log(50*(Math.random()-0.5))
console.log(50*(Math.random()-0.5))
console.log(50*(Math.random()-0.5))
console.log(50*(Math.random()-0.5))
console.log(50*(Math.random()-0.5))

var hrTime = process.hrtime()
// console.log(hrTime[0] * 1000000 + hrTime[1] / 1000) //current time in microseconds
var timestamp = (hrTime[0] * 1000000 + hrTime[1] / 1000) //current time in microseconds

//test

console.log(timestamp)
//onsole.log(crypto.randomBytes(10));
//console.log(JSON.stringify(crypto.randomBytes(10)));


// for (var i = 0; i < 5; i++) {
//     setTimeout(function timer() {
//         console.log("hello world");
//       }, i * 3000);
//     //  console.log("Hi");
//    }

// Returns a random integer from 0 to 9:
random = Math.floor(Math.random() * 26);
console.log("random is : ", random);

var random2 = Math.floor(Math.random() * (50 - 26 + 1)) + 26;
console.log("random is : ", random2);

const csv = require('csv-parser')
const fs = require('fs')
const logger = require("../lib/common/logger")
const results = [];

// require('fs');

// fs.writeFile('hello.txt', 'Hello World!', function (err) {
// //   if (err) return console.log(err);

//   console.log('Hello World > helloworld.txt');
// });



//  for (var i = 0; i < 5; i++) {

//      setTimeout(function timer() {
//         //  console.log(timestamp, "hello world");
//         //  var A = Date.now();
//         var hrTime = process.hrtime()
//         var timestamp = (hrTime[0] * 1000000 + hrTime[1] / 1000) //current time in microseconds
//          console.log(timestamp)

//        }, i * 1000);
//      //  console.log("Hi");
//     }


// // var logger = require('../lib/common/logger')
var lib = require("../lib/common/logging.js");
var N;
// // console.log('prelog is ', log_one.LogToFile)
// log_oneLogToFile('test.txt', 'this is a test');
// // console.log('postlog is ', log_one.LogToFile)

// LogTo

// result = lib.say('check')
// console.log('The result is: ', result);

result = lib.LogToFile('test.txt', 'this is a test')

// var mycar = new logging.Car('Eagle', 'Talon TSi', 1993);