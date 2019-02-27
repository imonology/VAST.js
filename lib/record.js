// a module for recording data to a file

var fs = require('fs');
var BSON = require('bson');

var stream = [];
var bson = undefined;

var record = function() {

    this.init = function(filename) {
        LOG.debug('Record stream created');
        stream[filename] = fs.createWriteStream(filename+'.txt');
        bson = new BSON();
    }

    this.write = function(data, id) {
        data = JSON.stringify(data) + '\n';
        var serial = bson.serialize(data);

        stream[id].write(data);

        /*
        fs.watch(fileName+'.txt', function(curr, prev){
            fs.stat(fileName+'.txt', function(err,stats) {

            })
        })
        */

        //stream.write(serial);
    }

    this.close = function(id) {
        stream[id].end();
        _analyse();
    }
}

if (typeof module !== "undefined")
    module.exports = record;
