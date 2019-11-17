var ES = require('../lib/entryServer');
LOG.debug("Start ES")
var startPort = parseInt(process.argv[2]);
console.log("Create");
var entryServer = new ES(startPort);
console.log("Done")
entryServer.init();
