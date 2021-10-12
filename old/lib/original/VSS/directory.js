
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
exports.deleteNode = function (ident) {
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

// list node ident list at a matching address
exports.listNodes = function (local_addr) {
	var list = [];

	for (var ident in _ident2addr) {

		if (local_addr && local_addr !== _ident2addr[ident])
			continue;

		LOG.warn(ident + ' addr: ' + _ident2addr[ident]);
		list.push(ident);
	}

	return list;
}
