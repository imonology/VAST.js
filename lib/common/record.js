// a module for recording data to a file

var fs = require('fs');
//var BSON = require('bson');

var streams = [];
//var bson = undefined;

var record = function() {

    this.init = function(filename, directory, extension) {
        extension = extension || '.txt';
        console.log('Record stream created at directory '+process.cwd()+'/'+directory+'/'+filename);
        
        var path = process.cwd();
        var streamID = directory + '/' + filename;

        // If the write stream already exists, do not recreate it.
        // (multiple logger layers may write to the same file)
        if (streams.hasOwnProperty(streamID)) {
            //console.log('Stream[' + streamID + '] already exists!);
            return;
        }

        if (!fs.existsSync(path+'/'+directory)) {
            console.log("creating directory " + path+'/'+directory)            
            fs.mkdirSync(path+'/'+directory, { recursive: true}, (error) => {
                if (!error)
                    console.log("Directory created in here")
            });
        }

        try {
            streams[streamID] = fs.createWriteStream(path+'/'+directory+'/'+filename+extension);
        } catch (e) {
            console.log("Cannot find directory. Create it");
            fs.mkdirSync(path+'/'+directory);
            streams[streamID] = fs.createWriteStream(path+'/'+directory+'/'+filename+extension);
        }
    }

    this.write = function(data, filename, directory) {     
        data = JSON.stringify(data) + '\n';
        var streamID = directory + '/' + filename;

        try {
            streams[streamID].write(data);
        } catch (e) {
            console.log("Cannot find directory. Cannot write to it");
        }
        //TODO: get serialized files working
        //var serial = bson.serialize(data);
        //stream[streamID].write(serial);
    }

    this.writeNoString = function(data,filename, directory) {
        var streamID = directory + '/' + filename;
        try {
            streams[streamID].write(data);
        } catch (e) {
            console.log("Cannot find directory. Cannot write to it");
        }
    }

    this.append = function(data,filename, directory) {
        //data+='\n';
        //fs.readFile(process.cwd()+'/Results/result.csv', function (err, data) {
        //    if (err) throw err;
        //    console.log('File was read');

        //    fs.appendFile(process.cwd()+'/Results/results.csv', data, function (err) {
        //      if (err) throw err;
        //      console.log('The "data to append" was appended to file!');

        //    });
        //});
    }

    this.close = function(filename, directory) {
        var streamID = directory + '/' + filename;
        if (streams.hasOwnProperty(streamID)) {
            console.log("Closing stream " + streamID);
            streams[streamID].end();
        }
        else
            console.log("Stream " + streamID + " does not exist and cannot be closed");
    }
}

if (typeof module !== "undefined")
    module.exports = record;
