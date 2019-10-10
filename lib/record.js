// a module for recording data to a file

// define log if not defined
if (typeof global.LOG === 'undefined') {
	var logger  = require('./common/logger');
	global.LOG  = new logger();

	// set default error level
	LOG.setLevel(3);
}
var fs = require('fs');
var BSON = require('bson');

var stream = [];
var bson = undefined;

var record = function() {

    this.init = function(filename, directory) {
        LOG.debug('Record stream created at directory '+process.cwd()+'/'+directory+'/'+filename);
        var path = process.cwd();
        stream[filename] = fs.createWriteStream(path+'/'+directory+'/'+filename+'.txt');
        bson = new BSON();
    }

    this.write = function(data, id) {
        data = JSON.stringify(data) + '\n';
        stream[id].write(data);

        //TODO: get serialized files working
        //var serial = bson.serialize(data);
        //stream[id].write(serial);
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
