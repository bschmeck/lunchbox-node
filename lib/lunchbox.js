var request = require('request'),
    events = require('events'),
    cheerio = require('cheerio'),
    Lunchbox = function(username, password){
        this.username = username;
        this.password = password;
        this.logged_in = false;
        this.request = request.defaults({jar: true});
        events.EventEmitter.call(this);
    };

Lunchbox.super_ = events.EventEmitter;
Lunchbox.prototype = Object.create(events.EventEmitter.prototype, {
    constructor: {
        value: Lunchbox,
        enumerable: false
    }
});

Lunchbox.prototype._tokens = function(body) {
    ret = {};
    var match = /data\[_Token\]\[fields\]" value="(.*?)"/.exec(body);
    ret['fields'] = match[1];
    match = /data\[_Token\]\[key\]" value="(.*?)"/.exec(body);
    ret['key'] = match[1];

    return ret;
};

Lunchbox.prototype.login = function(func) {
    var self = this;
    if (self.logged_in) {
        func();
        return;
    }
    // 1. Get page @ login_url
    var login_url = "http://lunchbox.fm";
    self.request(login_url, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            // 2. Submit login form
            // We need to submit 2 hidden fields along with email and password
            // There are 2 forms on the page, login and forgot password, we need the
            // the key and fields token from the login form, which comes first
            // Grab data[_Token][fields] and data[_Token][key] from the form
            var tokens = self._tokens(body);
            var form = { 'data[User][email]': self.username,
                         'data[User][password]': self.password,
                         'data[User][remember_me]': 0,
                         'data[_Token][key]': tokens['key'],
                         'data[_Token][fields]': tokens['fields'] };
            self.request.post({url: login_url, form: form }, function(error, response, body) {
                if (!error && response.statusCode == 302) {
                    self.logged_in = true;
                    if (func) {
                        func();
                    }
                } else {
                    status_error = "";
                    if (response.statusCode >= 400) {
                        status_error = " (" + response.statusCode + ")";
                    }
                    self.error({'message': "Login failed" + status_error,
                                'error': error,
                                'response': response });
                }
            });
        } else {
            self.error({'message': "Lunchbox is unavailable",
                        'error': error,
                        'response': response });
        }
    });
};

Lunchbox.prototype.start_order = function(restaurant) {
    this.login(function() {
        console.log("time to start order");
    });
};

Lunchbox.prototype.get_order_list = function(func) {
    var self = this;
    this.login(function() {
        var past_orders_url = 'http://lunchbox.fm/orders/past';
        self.request.get(past_orders_url, function(error, response, body) {
            if (!error && response.statusCode == 200) {
                func(body);
            } else {
                self.error({'message': "Unable to fetch orders list",
                            'error': error,
                            'response': response });
            }
        });
    });
};

Lunchbox.prototype.last_order = function(func) {
    var self = this;
    self.get_order_list(function(body) {
        match = /orders\/view_past\/(\d+)/.exec(body);
        self.fetch_order(match[1], func);
    });
};

Lunchbox.prototype.last_orders = function(n, func) {
    var self = this;
    self.get_order_list(function(body) {
        $ = cheerio.load(body);
        ret = [];
        $("td").filter(function(i, el) {
            return $(el).children("strong").length > 0;
        }).slice(0, n).each(function(i, el) {
            ret.push($(el).text().trim());
        });
        func(ret.join("\n"));
    });
};

Lunchbox.prototype.orders_since = function(endDate, func) {
    var self = this;
    var months = {'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 }
    self.get_order_list(function(body) {
        $ = cheerio.load(body);
        ret = [];
        $("td").filter(function(i, el) {
            return $(el).children("strong").length > 0;
        }).filter(function(i, el) {
            match = /(.*)?, (.*) (\d+), (\d+)/.exec($(el).text());
            month = months[match[2]]
            day = match[3]
            year = match[4]
            orderDate = new Date(year, month, day)
            return orderDate >= endDate;
        }).each(function(i, el) {
            ret.push($(el).text().trim());
        });
        func(ret.join("\n"));
    });
};

Lunchbox.prototype._scrape_orders = function(body) {
    $ = cheerio.load(body);
    ret = [];
    ret.push($(".mrg-top-none").text().trim());

    table = $("table").first();
    rows = table.find("td:not([colspan])").filter(function(i, el) {
        return ($(el).children("strong").length > 0 && $(el).text()[0] != "$");
    });
    rows.each(function(i, el) {
        ret.push($(el).text().trim());
    });

    return ret;
};

Lunchbox.prototype.fetch_order = function(order_id, func) {
    var self = this;
    this.login(function() {
        var past_order_url = 'http://lunchbox.fm/orders/view_past/' + order_id
        self.request.get(past_order_url, function(error, response, body) {
            if (!error && response.statusCode == 200) {
                func(self._scrape_orders(body).join("\n"));
            } else {
                self.error({'message': "Unable to fetch order " + order_id,
                            'error': error,
                            'response': response });
            }
        });
    });
};

Lunchbox.prototype.error = function(data) {
    this.emit('error', data.message);
};

module.exports = Lunchbox;
