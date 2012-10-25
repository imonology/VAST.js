
/* inhertance test 

*/

function handler() {
    this.public_str0 = 'hi world'; 
    var private_str = 'private world';

    // calling this can use both public & private variables (both are accessible)
    this.show_str = function () {
        console.log('handler show_str: pubstr: ' + this.public_str + ' pristr: ' + private_str);
    }
}

handler.prototype.public_str = 'hello world';

var callback = function (onSuccess) {

    //this.public_str = 'def';
    console.log('callback called...');
    onSuccess();
}

handler.prototype.show2 = function () {
    
    var func = function () {    
        console.log('handler show2: pubstr: ' + handler.prototype.public_str);
    }
    
    console.log('show2, public_str0: ' + this.public_str0);
    callback(func);
}

var von_handler = function () {
    
    this.von_str = 'VON message';
    var von_pri_str = 'private VON msg';
    
    // print out
    this.show = function () {
        console.log('von_handler: pubstr: ' + this.public_str);
        console.log('von_handler: von_pubstr: ' + this.von_str + ' pristr: ' + von_pri_str);
                    
        this.show_str();
    }
}
von_handler.prototype = new handler();


var vonnode = new von_handler();
vonnode.show();
console.log('external access of pub str: ' + vonnode.public_str);
vonnode.show_str();
vonnode.show2();
