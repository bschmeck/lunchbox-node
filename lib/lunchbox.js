var request = require('request'),
    Lunchbox = function(username, password){
        this.username = username;
        this.password = password;
        this.logged_in = false;
        this.request = request.defaults({jar: true});
    };

Lunchbox.prototype.login = function(func) {
    var self = this;
    if (self.logged_in) {
        func();
    }
    // 1. Get page @ login_url
    var login_url = "http://lunchbox.fm";
    self.request(login_url, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var match = /data\[_Token\]\[fields\]" value="(.*?)"/.exec(body);
            var fields_token = match[1];
            match = /data\[_Token\]\[key\]" value="(.*?)"/.exec(body);
            var key_token = match[1];

            // 2. Submit login form
            // We need to submit 2 hidden fields along with email and password
            // There are 2 forms on the page, login and forgot password, we need the
            // the key and fields token from the login form, which comes first
            // Grab data[_Token][fields] and data[_Token][key] from the form
            var form = { 'data[User][email]': self.username,
                         'data[User][password]': self.password,
                         'data[User][remember_me]': 0,
                         'data[_Token][key]': key_token,
                         'data[_Token][fields]': fields_token };
            self.request.post({url: login_url, form: form }, function(error, response, body) {
                self.logged_in = (!error && response.statusCode == 302);
                if (self.logged_in && func) {
                    func();
                }
            });
        }
    });
};

Lunchbox.prototype.start_order = function(restaurant) {
    this.login(function() {
        console.log("time to start order");
    });
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
