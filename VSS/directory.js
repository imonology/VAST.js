
//
// directory.js		VSS directory to manage node to server mapping
//
// history:
//		2013-03-15		init
//		

var _ident2addr = {};

//
// public calls
//

// record a newly created node (replacing existing record under the same ident)
exports.createNode = function (ident, addr) {

	if (_ident2addr.hasOwnProperty(ident))
		return false;

	_ident2addr[ident] = addr;
	return true;
}

// erase record for a node
exports.destroyNode = function (ident) {
	if (_ident2addr.hasOwnProperty(ident)) {
		delete _ident2addr[ident];
		return true;
	}
	
	return false;
}

// check if a node exists and return its contact address
exports.checkNode = function (ident) {
	if (_ident2addr.hasOwnProperty(ident))
		return _ident2addr[ident];
	return '';
}
