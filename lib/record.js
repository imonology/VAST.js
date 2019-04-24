// a module for recording data to a file

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
        var serial = bson.serialize(data);

        //TODO: get serialized files working
        stream[id].write(data);
        //stream[id].write(serial);
    }

    this.close = function(id) {
        stream[id].end();
        _analyse();
    }
}

if (typeof module !== "undefined")
    module.exports = record;
