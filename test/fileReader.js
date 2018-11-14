var fs = require('fs')
    , es = require('event-stream');

var lineNr = 0;
var movementPoints = {};
var tempHolder;

var s = fs.createReadStream('MovementPoints.txt')
    .pipe(es.split())
    .pipe(es.mapSync(function(line){

        // pause the readstream
        s.pause();

        lineNr += 1;
        console.log("Line number: "+lineNr);

        // process line here and call s.resume() when rdy
        tempHolder = line.split(":");
        //console.log(tempHolder);
        movementPoints[tempHolder[0]] = tempHolder[1].split(";");
        //console.log(movementPoints[tempHolder[0]]);

        if (lineNr == 100) {
            console.log("file reading complete");
            console.log(movementPoints[0]);
            s.end();
        }

        // resume the readstream, possibly from a callback
        s.resume();
    })
    .on('error', function(err){
        console.log('Error while reading file.', err);
    })
    .on('end', function(){
        console.log('Read entire file.')
    })
);
