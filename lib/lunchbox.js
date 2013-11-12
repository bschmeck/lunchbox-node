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
            var tokens = self._login_tokens(body);
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

/* 
 * Return an array of hashes for the known restaurants.
 * Each hash has name and id attributes.
 */
Lunchbox.prototype.restaurants = function(func) {
    var self = this;
    self.login(function() {
        var orders_url = "http://lunchbox.fm/orders";
        self.request.get(orders_url, function(error, response, body) {
            if (!error && response.statusCode == 200) {
                func(self._parse_restaurants(body));
            } else {
                self.error({'message': "Unable to fetch restaurant list (" + response.statusCode + ")",
                            'error': error,
                            'response': response});
            }
        });
    });
};

Lunchbox.prototype.restaurants_since = function(startDate, func) {
    var self = this;
    self.orders_since(startDate, function(orders) {
        ret = [];
        for (var i = 0; i < orders.length; i++) {
            ret.push(orders[i].replace(/^(?:.* from )?/, ""));
        }
        func(ret);
    });
};

Lunchbox.prototype.start_order = function(restaurant, func) {
    var self = this;
    this.login(function() {
        var orders_url = "http://lunchbox.fm/orders";
        self.request.get(orders_url, function(error, response, body) {
            if (error || response.statusCode != 200) {
                self.error({'message': "Unable to fetch orders page (" + response.statusCode + ")",
                            'error': error,
                            'response': response});
                return;
            }
            var restaurantData = self._find_restaurant(body, restaurant);
            if (restaurantData.error) {
                self.error({'message': restaurantData.errorMessage});
                return;
            }
            func("Ordering from " + restaurantData.name);
        });
    });
};

/* 
 * Return the individual orders from the most recent lunch order.
 */
Lunchbox.prototype.last_order = function(func) {
    var self = this;
    self._get_order_list(function(body) {
        match = /orders\/view_past\/(\d+)/.exec(body);
        self._fetch_order(match[1], func);
    });
};

/*
 * Return the last N lunch orders.
 */
Lunchbox.prototype.last_orders = function(n, func) {
    var self = this;
    self._get_order_list(function(body) {
        $ = cheerio.load(body);
        ret = [];
        $("td").filter(function(i, el) {
            return $(el).children("strong").length > 0;
        }).slice(0, n).each(function(i, el) {
            ret.push($(el).text().trim());
        });
        func(ret);
    });
};

/*
 * Return all lunch orders placed on or after startDate
 */
Lunchbox.prototype.orders_since = function(startDate, func) {
    var self = this;
    var cutoff = new Date(startDate);
    cutoff.setHours(0, 0, 0, 0);
    self._get_order_list(function(body) {
        $ = cheerio.load(body);
        var ret = [];
        $("td").filter(function(i, el) {
            return $(el).children("strong").length > 0;
        }).filter(function(i, el) {
            return self._order_date($(el).text()) >= cutoff;
        }).each(function(i, el) {
            ret.push($(el).text().trim());
        });
        func(ret);
    });
};

Lunchbox.prototype.error = function(data) {
    this.emit('error', data.message);
};

/* Utility Functions */
Lunchbox.prototype._login_tokens = function(body) {
    ret = {};
    var match = /data\[_Token\]\[fields\]" value="(.*?)"/.exec(body);
    ret['fields'] = match[1];
    match = /data\[_Token\]\[key\]" value="(.*?)"/.exec(body);
    ret['key'] = match[1];

    return ret;
};

/*
 * Given a restaurant name, return a hash on information about
 * that restaurant.
 */
Lunchbox.prototype._find_restaurant = function(body, restaurant) {
    $ = cheerio.load(body);
    var ret = {'error': false, 'errorMessage': ""};
    var errRet = {'error': true, 'errorMessage': "No restaurants matching " + restaurant + " found.", 'name': "", 'id': "-1" };
    var found = false;
    $("#OrderRestaurantId").children("option").each(function(i, el) {
        if ($(el).text().trim().toUpperCase() == restaurant.toUpperCase()) {
            if (found) {
                errRet['errorMessage'] = "Multiple restaurants matching " + restaurant + " found.";
                return errRet;
            }
            found = true;
            ret['name'] = $(el).text().trim();
            ret['id'] = $(el).attr('value');
        }
    });
    return found ? ret : errRet;
};

/*
 * Return an array of restaurants listed on the orders page.
 */
Lunchbox.prototype._parse_restaurants = function(body) {
    $ = cheerio.load(body);
    var ret = [];
    $("#OrderRestaurantId").children("option").each(function(i, el) {
        if ($(el).attr('value') != '') {
            ret.push({'name': $(el).text(),
                      'id': $(el).attr('value')});
        }
    });
    return ret;
};

/*
 * Return a Date object from an order's date string
 */
Lunchbox.prototype._order_date = function(order) {
    var months = {'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };
    var match = /(.*)?, (.*) (\d+), (\d+)/.exec(order);
    var month = months[match[2]];
    var day = match[3];
    var year = match[4];
    return new Date(year, month, day);
};

/*
 * Scrape the individual orders from a specific past lunch order
 */
Lunchbox.prototype._fetch_order = function(order_id, func) {
    var self = this;
    this.login(function() {
        var past_order_url = 'http://lunchbox.fm/orders/view_past/' + order_id
        self.request.get(past_order_url, function(error, response, body) {
            if (!error && response.statusCode == 200) {
                func(self._scrape_orders(body));
            } else {
                self.error({'message': "Unable to fetch order " + order_id,
                            'error': error,
                            'response': response });
            }
        });
    });
};

/*
 * Parse the DOM of an individual lunch order page and return the individual orders.
 */
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

/*
 * Get the full list of past orders.
 */
Lunchbox.prototype._get_order_list = function(func) {
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

module.exports = Lunchbox;
