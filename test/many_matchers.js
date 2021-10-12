const matcher = require('../lib/matcher.js');

var matcherCount = 10;
var matchers = [];

function random(){
    return Math.random()*1000;
}

//GW first
matchers.push(new matcher(true, '0.0.0.0', 8000, random(), random(), 100));

function addMatcher(){
    if(matchers.length < matcherCount){
        matchers.push(new matcher(false, '0.0.0.0', 8000, random(), random(), 100));
    }else{
        console.log('MATCHERS COMPLETE');
    }
}

for (var i = 0; i < matcherCount; i++){
    setTimeout(addMatcher, 200);
}



