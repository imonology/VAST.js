
/*
    A router for VSS server to execute actual commands

*/

function printWords(words) {

    var str = '';
    for (var i=0; i < words.length; i++)
        str += i + ':' + words[i] + ' ';

    return str;
}

function route(handle, pathname, res) {
    LOG.debug("about to route a request for " + pathname);
    
	// extract first verb in path
	var words = pathname.split("/");
    for (var i=0; i < words.length; i++)
        LOG.debug(words[i]);
        
    var verb = words[1];
    LOG.debug('verb is: ' + verb);
	
    if (typeof handle[verb] === 'function') {
        handle[verb](words, res);        
    }
    else {
        LOG.warn('no request handle for: ' + pathname);
        res.writeHead(404, {'Content-Type': 'text/plain'});
        res.end('404 Not Found: ' + pathname); 
    }
}

exports.route = route;