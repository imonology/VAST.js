/*
    logger for vast.js  
    
    To use, create a new layer (layers may be reused / shared) and call the 
    debug, sys, etc. functions. 
*/

function logger() {

    // the record used to write to different write streams
    const Record = require('./record.js');
    let _record = new Record();

    // A structure of logger layers. Each object that adds a layer gets a reference to its layer only.
    let _layers = [];

    // color control codes
    let _green = '\033[32m';
    let _red = '\033[31m';
    let _white = '\033[m';
    let _yellow = '\033[33m';

    let _ERR = _red;
    let _ERREND = _white
    let _WARN = _yellow;

    // convert obj to msg
    let _convert = function (obj) {	    
        return (typeof obj === 'object' ? JSON.stringify(obj, null, 4) : obj);
    }    
    
    // get current time
    let _curr_time = function () {
        var currDate = new Date();
        return '-' + currDate.getHours() + ':' + currDate.getMinutes() + '- '; 
    }

    // add a new layer
    // TODO: add extensions? currently defaults to .txt in record.js
    this.newLayer = function (layername, filename, directory, displayLevel, recordLevel){

        // check if the layer already exists
        if (_layers.hasOwnProperty(layername)){
            //_layers[layername].warn('Logging layer "' + layername + '" already exists.');
        } 

        // create the new layer
        else {
            _layers[layername] = new layer(layername, filename, directory, displayLevel, recordLevel);

            // initialise a write stream for this layer
            // (it may already exist; layers may share write streams) 
            _record.init(filename, directory);
        } 

        // return reference to layer
        return _layers[layername];
    }

    let layer = function(layername, filename, directory){
        let _layername = layername;
        let _filename = filename;
        let _directory = directory;
        let _displayLevel = 1; // by default, display errors only 
        let _recordLevel = 0;  // by default, do not write to a file

        this.setLevels = function(displayLevel, recordLevel){
            _displayLevel = displayLevel;
            _recordLevel = recordLevel;
        }

        this.sys = function (msg) {
            msg = _curr_time() + _convert(msg);    
            if (_displayLevel >= 4)
                console.log(msg);

            if (_recordLevel >= 4)
                _record.write(msg, _filename, _directory);
        }
        
        this.debug = function (msg) {
            msg = _curr_time() + _convert(msg)    
            if (_displayLevel >= 3)
                console.log(msg);

            if (_recordLevel >= 3)
                _record.write(msg, _filename, _directory);
        }
    
        this.warn = function (msg) {
            msg = _curr_time() + _convert(msg)    
            if (_displayLevel >= 2)
                console.log(_WARN + msg + _ERREND);

            if (_recordLevel >= 2)
            _record.write(msg, _filename, _directory);
        }
    
        this.error = function (msg) {
            msg = _curr_time() + _convert(msg)    
            if (_displayLevel >= 1)
                console.log(_ERR + _curr_time() + msg + _ERREND);

            if (_recordLevel >= 1)
            _record.write(msg, _filename, _directory);
        }
        
        this.stack = function () {
            var e = new Error('dummy');
            var stack = e.stack.replace(/^[^\(]+?[\n$]/gm, '')
                .replace(/^\s+at\s+/gm, '')
                .replace(/^Object.<anonymous>\s*\(/gm, '{anonymous}()@')
                .split('\n');
            console.log(stack);                
        }
    }
}

if (typeof module !== 'undefined'){
	module.exports = logger;
}