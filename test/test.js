require('../lib/common.js');

//var networkInterfaces = require('os').networkInterfaces();
//var address = networkInterfaces['eth0'][0]['address'];

function getIPAddress() {
    var interfaces = require('os').networkInterfaces();
    console.log(interfaces);
    for (var devName in interfaces) {
      var iface = interfaces[devName];
  
      for (var i = 0; i < iface.length; i++) {
        var alias = iface[i];
        if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal)
          return alias.address;
      }
    }
    return '0.0.0.0';
}

address = getIPAddress();


console.log(address);


