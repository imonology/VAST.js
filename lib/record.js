// a module for recording data to a file

// define log if not defined
if (typeof global.LOG === 'undefined') {
	var logger  = require('./common/logger');
	global.LOG  = new logger();

	// set default error level
	LOG.setLevel(3);
}


var fs = require('fs');
//var BSON = require('bson');

var stream = [];
//var bson = undefined;

var record = function() {

    this.init = function(filename, directory, extension) {
        extension = extension || '.txt';
        console.log('Record stream created at directory '+process.cwd()+'/'+directory+'/'+filename);
        var path = process.cwd();

        if (!fs.existsSync(path+'/'+directory)) {
            console.log("creating directory " + path+'/'+directory)            
            fs.mkdirSync(path+'/'+directory, { recursive: true}, (error) => {
                if (!error)
                    console.log("Directory created in here")
            });
        }
        try {
            stream[filename] = fs.createWriteStream(path+'/'+directory+'/'+filename+extension);
        } catch (e) {
            console.log("Cannot find directory. Create it");
            fs.mkdirSync(path+'/'+directory);
            stream[filename] = fs.createWriteStream(path+'/'+directory+'/'+filename+extension);
        }
        //bson = new BSON();
    }

    this.write = function(data, id) {
        data = JSON.stringify(data) + '\n';
        try {
            stream[id].write(data);
        } catch (e) {
            console.log("Cannot find directory. Cannot write to it");
        }
        //TODO: get serialized files working
        //var serial = bson.serialize(data);
        //stream[id].write(serial);
    }

    this.writeNoString = function(data,id) {
        try {
            stream[id].write(data);
        } catch (e) {
            console.log("Cannot find directory. Cannot write to it");
        }
    }

    this.append = function(data,id) {
        data+='\n';
        fs.readFile(process.cwd()+'/Results/result.csv', function (err, data) {
            if (err) throw err;
            console.log('File was read');

            fs.appendFile(process.cwd()+'/Results/results.csv', data, function (err) {
              if (err) throw err;
              console.log('The "data to append" was appended to file!');

            });
        });
    }

    this.close = function(id) {
        if (stream.hasOwnProperty(id)) {
            LOG.debug("Closing stream " + id);
            stream[id].end();
        }
        else
            LOG.debug("Stream " + id + " does not exist and cannot be closed");
    }
}

if (typeof module !== "undefined")
    module.exports = record;
