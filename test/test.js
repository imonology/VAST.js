const { getTimestamp } = require("../lib/common/util")

console.log(50*(Math.random()-0.5))
console.log(50*(Math.random()-0.5))
console.log(50*(Math.random()-0.5))
console.log(50*(Math.random()-0.5))
console.log(50*(Math.random()-0.5))

var hrTime = process.hrtime()
// console.log(hrTime[0] * 1000000 + hrTime[1] / 1000) //current time in microseconds
var timestamp = (hrTime[0] * 1000000 + hrTime[1] / 1000) //current time in microseconds

console.log(timestamp)
//onsole.log(crypto.randomBytes(10));
//console.log(JSON.stringify(crypto.randomBytes(10)));


// for (var i = 0; i < 5; i++) {
//     console.log("Hi");
//   }

// Returns a random integer from 0 to 9:
random = Math.floor(Math.random() * 26);
console.log("random is : ", random);

var random2 = Math.floor(Math.random() * (50 - 26 + 1)) + 26;
console.log("random is : ", random2);