var ES = require('../lib/entryServer');

var startPort = parseInt(process.argv[2]);
var entryServer = new ES(startPort);
entryServer.init();
