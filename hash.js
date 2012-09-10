
//
// a generic Hash object:
//  see: http://www.mojavelinux.com/articles/javascript_hashes.html
//
//  property:
//      - length:   the length of the hash object
//      - items:    the actual objects stored

function Hash()
{
	this.length = 0;
	this.items = new Array();
	var idxmap = new Array();
    
	for (var i = 0; i < arguments.length; i += 2) {
		if (typeof(arguments[i + 1]) != 'undefined') {
			this.items[arguments[i]] = arguments[i + 1];
			this.length++;
		}
	}
   
	this.remove = function(in_key)
	{
		var tmp_previous;
		if (typeof(this.items[in_key]) != 'undefined') {
			this.length--;
			var tmp_previous = this.items[in_key];
			delete this.items[in_key];
			
			// remove index to key mapping
			var newmap = []
			for (var i=0; i < idxmap.length; i++) {
				if (idxmap[i] != in_key)
					newmap.push(idxmap[i]);
			}
			idxmap = newmap;
		}
	   
		return tmp_previous;
	}

	this.get = function(in_key) {
		if (typeof(this.items[in_key]) == 'undefined')
			return null;
		return this.items[in_key];
	}
    
    // doesn't work this way
	this.getByIndex = function(index) {
	    if (index < 0 || index >= idxmap.length)
			return null;
		return this.items[idxmap[index]];
	}
    
	this.set = function(in_key, in_value)
	{    
		var tmp_previous;
		
		if (typeof(in_value) != 'undefined') {
			if (typeof(this.items[in_key]) == 'undefined') {
				
				// store map of index to key
				idxmap[this.length] = in_key;
				this.length++;
			}
			else {
				tmp_previous = this.items[in_key];
			}

			this.items[in_key] = in_value;			
		}
	   
		return tmp_previous;
	}

	this.has = function(in_key)
	{
		return typeof(this.items[in_key]) != 'undefined';
	}

	this.clear = function()
	{
		for (var i in this.items) {
			delete this.items[i];
		}
		idxmap = [];

		this.length = 0;
	}
}
	
module.exports = Hash;