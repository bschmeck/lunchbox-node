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
    var login_url = "http://lunchbox.fm";
    // 1. Get page @ login_url
    // 2. Submit login form
    // We need to submit 2 hidden fields along with email and password
    // There are 2 forms on the page, login and forgot password, we need the
    // the key and fields token from the login form, which comes first
    // Grab data[_Token][fields] and data[_Token][key] from the form
    // 3. Do something with cookies here
    this.logged_in = true;
};

Lunchbox.prototype.start_order = function(restaurant) {
    this.login();
    return "start_order";
};

Lunchbox.prototype.last_order = function() {
    this.login();
    var past_orders_url = 'http://lunchbox.fm/orders/past';
    // 1. Grab highest numbered order
    var order_id = 0;
    var past_order_url = 'http://lunchbox.fm/orders/view_past/' + order_id;
    // 2. Get page
    // 3. Grab orders from page
    return "last_order";
};

module.exports = Lunchbox;