/*
    logger for vast.js  
    
    To use, create a new layer (layers may be reused / shared) and call the 
    debug, sys, etc. functions. 

    TODO:
        - closeLayer()
        - layer protections? write streams overwrite old files...
        - potentially .csv functionality. Not a priority 

*/

let fs = require('fs');

function logger() {

    // Structures for logger layers, recording streams
    let _layers = [];
    let _streams = [];

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
        return (typeof obj === 'object' ? JSON.stringify(obj) : obj);
    }    
    
    // get current time
    let _curr_time = function () {
        var currDate = new Date();
        return currDate.getTime();
        //return '-' + currDate.getHours() + ':' + currDate.getMinutes() + '- '; 
    }

    // add a new layer
    // TODO: add extensions? currently defaults to .txt in record.js
    // TODO: merge layername and filename. No real need for both if its 1-to-1 relationship. Asking for bugsss..
    this.newLayer = function (layername, filename, directory, displayLevel, recordLevel){
        var path = directory+'/'+filename;

        // check if the layer already exists
        if (_layers.hasOwnProperty(layername)){
            //_layers[layername].warn('Logging layer "' + layername + '" already exists.');
        }

        // create the new layer
        else {

            // Check if an open write stream exists for this file.
            // only create if recordLevel > 0
            if (!_streams.hasOwnProperty(path) && recordLevel > 0){
                _streams[path] = new stream(filename, directory);
            }

            _layers[layername] = new layer(layername, displayLevel, recordLevel, _streams[path]);
        } 

        // return reference to layer
        return _layers[layername];
    }

    let layer = function(layername, displayLevel, recordLevel, stream){
        let _layername = layername;
        let _displayLevel = typeof(displayLevel) == 'number' ? displayLevel : 1; // by default, display errors only 
        let _recordLevel = typeof(displayLevel) == 'number' ? recordLevel : 0;  // by default, do not write to a file
        let _stream = stream;

        // SET LEVELS WILL BREAK IF RECORDLEVEL = 0 set to > 1
        // Do not reimplement unless ablsolutely neccessary
        /*
        this.setLevels = function(displayLevel, recordLevel){
            _displayLevel = displayLevel;
            _recordLevel = recordLevel;
        }
        */

        this.close = function(){
            delete _layers[_layername];
        }

        // going to be used for printing "event" or "state" type objects to a results file

        this.printObject = function(obj){    
            var obj = JSON.stringify(obj);
            
            if (_displayLevel >= 1)
                console.log(obj);

            if (_recordLevel >= 1)
                _stream.writeLine(obj);
        }
        

        this.sys = function (msg) {
            //msg = _curr_time()() + _convert(msg);
            msg = _convert({time: _curr_time(), msg: msg});    
            if (_displayLevel >= 4)
                console.log(msg);

            if (_recordLevel >= 4)
                _stream.writeLine(msg);
        }
        
        this.debug = function (msg) {
            msg = _convert({time: _curr_time(), msg: msg});    
            if (_displayLevel >= 3)
                console.log(msg);

            if (_recordLevel >= 3)
                _stream.writeLine(msg);
        }
    
        this.warn = function (msg) {
            msg = _convert({time: _curr_time(), msg: msg});    
            if (_displayLevel >= 2)
                console.log(_WARN + msg + _ERREND);

            if (_recordLevel >= 2)
            _stream.writeLine(msg);
        }
    
        this.error = function (msg) {
            msg = _convert({time: _curr_time(), msg: msg});    
            if (_displayLevel >= 1)
                console.log(_ERR + msg + _ERREND);

            if (_recordLevel >= 1)
            _stream.writeLine(msg);
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

let stream = function(filename, directory, extension) {
    let _filename = filename;
    let _directory = directory;
    let _extension = extension || '.txt';
    let _path = process.cwd();
    let _stream;
     
    let _init = function(){
        if (!fs.existsSync(_path+'/'+_directory)) {
            console.log("creating directory " + _path+'/'+_directory)            
            fs.mkdirSync(_path+'/'+_directory, { recursive: true}, (error) => {
                if (!error)
                    console.log("Directory created in here")
            });
        }
    
        try {
            _stream = fs.createWriteStream(_path+'/'+_directory+'/'+_filename+_extension);
        } 
        catch (e) {
            console.log("Cannot find directory. Create it");
            fs.mkdirSync(_path+'/'+_directory);
            _stream = fs.createWriteStream(_path+'/'+_directory+'/'+_filename+_extension);
        }
    }

    this.writeLine = function(data) {     
        // only stringify if not already a string. (Avoid double quotations)
        data = typeof data === 'object' ? JSON.stringify(data) + '\n' : data + '\n';
        try {
            _stream.write(data);
        } catch (e) {
            console.log('Cannot write to ' + _path + '/' + _directory + '/' + _filename + _extension);
            console.log('error:', e);
        }
    }

    this.close = function(){
        _stream.end();
    }

    _init();
}

if (typeof module !== 'undefined'){
	module.exports = logger;
}