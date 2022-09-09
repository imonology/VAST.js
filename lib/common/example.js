require('../common.js');

// create logging layers
var layerA = LOG.newLayer('layerA', 'file1', 'textfiles');
var layerB = LOG.newLayer('layerB', 'file2', 'textfiles');

// layers may write to the same file (file1 is shared)
var layerC = LOG.newLayer('layerC', 'file1', 'textfiles');

// set debug priotiry levels (display, recording)
layerA.setLevels(5, 5); // display all, print all
layerB.setLevels(5, 5); 
layerC.setLevels(1, 5); // display only errors, print all 

layerA.debug('hello file 1. hello console.');
layerB.debug('hello file 2, also in the console');
layerC.debug('printing to file 1 again, but not shown in console');

layerC.error('Errors are still displayed in the console');

// change priority levels and test
layerC.setLevels(5, 0); // display all, do not print
layerC.debug('Im in the console only');
