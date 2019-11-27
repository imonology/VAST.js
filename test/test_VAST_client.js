// integration test for VAST client comprised of VON and matcher

require('../lib/common');

LOG.setLevel(3);

// capture variables
LOG.info("Capturing variables")
var is_Client = JSON.parse(process.argv[2]);
var host = process.argv[3];
var port = process.argv[4];
var radius = process.argv[5];
var local_IP = process.argv[6];
var x = parseInt(process.argv[7]);
var y = parseInt(process.argv[8]);
var entryServers = parseInt(process.argv[9]);
LOG.debug("Done capturing variables");

var vast = new VAST.client(is_Client, host, port, radius, local_IP, x, y, entryServers);
