var http = require('http'),
    Lunchbox = function(username, password){
        this.username = username;
        this.password = password;
        this.logged_in = false;
    };

Lunchbox.prototype.login = function() {
    if (this.logged_in) {
        return;
    }
};

Lunchbox.prototype.start_order = function(restaurant) {
    this.login();
    return "start_order";
};

Lunchbox.prototype.last_order = function() {
    this.login();
    return "last_order";
};

module.exports = Lunchbox;