


/*

    logger for vast.js       
*/

// color control codes
var _green = '\033[32m';
var _red = '\033[31m';
var _white = '\033[m';
var _yellow = '\033[33m';

var _ERR = _red;
var _ERREND = _white
var _WARN = _yellow;

function logger() {
    
    // by default we display all 
    var _level = 3;

    // convert obj to msg
    var _convert = function (obj) {	    
	    return (typeof obj === 'object' ? JSON.stringify(obj, null, 4) : obj);
    }    
    
    // get current time
    var _curr_time = function () {
        var currDate = new Date();
        return '-' + currDate.getHours() + ':' + currDate.getMinutes() + '- '; 
    }
    
    // set log level: 1 (error only), 2 (warning), 3 (debug)
    this.setLevel = function (level) {
        if (level <= 0 || level > 3) {
            this.error('log level setting incorrect');
            return;
        }        
        _level = level;
        console.log('set error level to be: ' + level);
    }

    this.sys = function (msg) {
        msg = _convert(msg);    
        if (_level >= 4)
            console.log(_curr_time() + msg);
    }
    
    this.debug = function (msg) {
        msg = _convert(msg);    
        if (_level >= 3)
            console.log(_curr_time() + msg);
    }

    this.warn = function (msg) {
        msg = _convert(msg);    
        if (_level >= 2)
            console.log(_WARN + _curr_time() + msg + _ERREND);
    }

    this.error = function (msg) {
        msg = _convert(msg);    
        if (_level >= 1)
            console.log(_ERR + _curr_time() + msg + _ERREND);
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

if (typeof module !== 'undefined')
	module.exports = logger;

/*
exports.debug = function (msg) {
    console.log(msg);
}

exports.warn = function (msg) {
    console.log(_WARN + msg + _ERREND);
}

exports.error = function (msg) {
    console.log(_ERR + msg + _ERREND);
}
*/