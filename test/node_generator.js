

// Subscribers 
for (var i = 0; i < 25; i++) {
    var x = Math.floor(Math.random() * 26);
    var y = Math.floor(Math.random() * 26);
    var r = Math.floor(Math.random() * 26);

     console.log("start node test_client.js", x, y, r, "publish");
   }


   for (var i = 0; i < 25; i++) {
    var x2 = Math.floor(Math.random() * (50 - 26 + 1)) + 26;
    var y2 = Math.floor(Math.random() * (50 - 26 + 1)) + 26;
    var r2 = Math.floor(Math.random() * (50 - 26 + 1)) + 26;

     console.log("start node test_client.js", x2, y2, r2, "subscribe");
   }