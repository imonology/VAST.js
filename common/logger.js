


/*

    logger for vast.js       
*/

// color control codes
var _green = '\033[32m';
var _red = '\033[31m';
var _white = '\033[m';
var _yellow = '\033[33m';

var _ERR = _red + 'ERR -';
var _ERREND = _white;

var _WARN = _yellow + 'WARN -';

function logger() {

    // by default we display all 
    var _level = 3;

    // set log level: 1 (error only), 2 (warning), 3 (debug)
    this.setLevel = function (level) {
        if (level <= 0 || level > 3) {
            this.error('log level setting incorrect');
            return;
        }        
        _level = level;
        this.debug('set error level to be: ' + level);
    }
    
    this.debug = function (msg) {
        if (_level >= 3)
            console.log(msg);
    }

    this.warn = function (msg) {
        if (_level >= 2)
            console.log(_WARN + msg + _ERREND);
    }

    this.error = function (msg) {
        if (_level >= 1)
            console.log(_ERR + msg + _ERREND);
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