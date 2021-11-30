const fs = require('fs');


var LogToFile = function (filename, data_input){
    fs.appendFile(filename, data_input, function (err) {
        console.log('')
      if (err) return console.log(err);
    //   console.log('This is error > test.txt');
    });
    //  return LogToFile();
    }

function say(word) {
    var _word = {};
  console.log(word);
}

module.exports = { say };
module.exports = { LogToFile };