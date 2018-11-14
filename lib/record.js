// a module for recording data to a file

var fs = require('fs');
var BSON = require('bson');

var stream = undefined;
var bson = undefined;



var record = function() {

    this.init = function(filename) {
        console.log('inited');
        LOG.debug('Record stream created');
        stream = fs.createWriteStream(filename+'.txt');
        bson = new BSON();
    }

    this.write = function(data) {
        data = JSON.stringify(data) + '\n';
        var serial = bson.serialize(data);

        stream.write(data);
        //stream.write(serial);
    }

    this.close = function() {
        stream.end();
        _analyse();
    }
}

if (typeof module !== "undefined")
    module.exports = record;
