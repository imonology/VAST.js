const { json } = require("express");

var obj1 = {
    arr : {
        0 : 31,
        1 : 21
    },

    arr2 : {
        pos1 : {
            x : 10,
            y : 15
        },
        pos2 : {
            x : 11,
            y : 11
        }
    },

    id : 1
}

var obj2 = {
    arr : {
        0 : 31,
        1 : 21
    },

    arr2 : {
        pos1 : {
            x : 10,
            y : 15
        },
        pos2 : {
            x : 11,
            y : 11
        }
    },
    
    id : 2
}

var obj3 = {
    arr : {
        0 : 32,
        1 : 21
    },

    arr2 : {
        pos1 : {
            x : 10,
            y : 15
        },
        pos2 : {
            x : 11,
            y : 11
        }
    },
    
    id : 1
}

var one = JSON.stringify(obj1) === JSON.stringify(obj2);
var two = JSON.stringify(obj1) === JSON.stringify(obj3);
console.log(one, two);


