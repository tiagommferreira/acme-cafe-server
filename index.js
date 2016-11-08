var express     = require('express');
var orm         = require('orm');
var bodyParser  = require('body-parser');
var config      = require('./config');
var app         = express();
var Client      = require('./models/client');
var Order       = require('./models/order');
var Product     = require('./models/product');
var Voucher     = require('./models/voucher');
var cp          = require('child_process');
var assert      = require('assert');
var fs          = require('fs');
var crypto      = require('crypto');
var _           = require('lodash');
var async       = require('async');


// gen pub priv key pair
function genKeys(cb){
    // gen private
    cp.exec('openssl genrsa 368', function(err, priv, stderr) {
      // tmp file
      var randomfn = './' + Math.random().toString(36).substring(7);
      fs.writeFileSync(randomfn, priv);
      // gen public
      cp.exec('openssl rsa -in '+randomfn+' -pubout', function(err, pub, stderr) {
           // delete tmp file
           fs.unlinkSync(randomfn);
           // callback
           cb(JSON.stringify({public: pub, private: priv}, null, 4));
      });

    });
}

var keys;
genKeys(function(result) {
    keys = JSON.parse(result);
});


app.set('port', (process.env.PORT || 8080));

// Additional middleware which will set headers that we need on each request.
app.use(function(req, res, next) {
    // Set permissive CORS header - this allows this server to be used only as
    // an API server in conjunction with something like webpack-dev-server.
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Disable caching so we'll always get the latest comments.
    res.setHeader('Cache-Control', 'no-cache');
    next();
});

app.use(bodyParser.json());

app.use(orm.express(config.database, {
    define: function (db, models, next) {
        models.client = db.define("client", Client.clientModel, Client.clientOptions);
        models.product = db.define("product", Product.productModel);
        models.order = db.define("order", Order.orderModel);
        models.voucher = db.define("voucher", Voucher.voucherModel);

        db.sync();
        next();
    }
}));

app.get('/', function(req, res) {
    res.json({success: true});
});

app.post('/client/block', function(req,res) {
    var requests = [];

    _.forEach(req.body.clients, function(client) {
        requests.push(function(callback) {
            req.models.client.one({uuid:client.uuid}, function (err,result) {
                result.status = false;
                result.save(function(err) {
                    if(err) {
                        callback(true, null);
                    }
                    else {
                        callback(null, "done");
                    }
                });
            });
        });
    });

    async.parallel(requests, function(err, results) {
        if(err) {
            res.send("Something went wrong");
        }
        else {
            res.send("Everything ok");
        }
    });

});

app.post('/register', function(req, res) {
    var newClient = {
        username: req.body.username,
        name: req.body.name,
        password: req.body.password,
        creditcard: req.body.creditcard,
    }

    req.models.client.create(newClient, function(err, results) {
        if(err) {
            console.log(err);
            res.send({success:false});
        }
        else {
            res.send({uuid: results.uuid, pin: results.pin});
        }
    });

});

app.post('/authenticate', function(req,res) {
    req.models.client.one({uuid: req.body.uuid}, function(err, client) {
        if(err) {
            res.send({success: false});
        } else {
            client.comparePassword(req.body.password, function(err, isMatch) {
                if(!err && isMatch) {
                    res.send({success: true});
                }
                else {
                    res.send({success: false});
                }
            });
        }
    });
});

app.get('/menu', function(req, res) {
    req.models.product.all(function(err,results){
        if(err) {
            res.send({success: false});
        }
        else {
            res.send(results);
        }
    });
});

app.get('/vouchers/:uuid', function(req, res) {
    var uuid = req.params.uuid;
    req.models.voucher.find({user_id: uuid, order_id: null}, function(err, results) {
        res.send(results);
    });
});

app.get('/order',function(req,res) {
  req.models.order.all(function(err,results){
    res.json(results)
  });
});

app.get('/order/:uuid', function(req, res) {

    req.models.order.find({user_id: req.params.uuid}, function(err, results) {
        if(results.length == 0) {
            res.send(results);
        }
        else {
            var organized = [];
            var groupedOrders = _.values(_.groupBy(results, 'order_id'));

            var queriesTodo = [];

            _.forEach(groupedOrders, function(orderProducts) {
                var currentOrder = {};
                currentOrder.id = orderProducts[0].order_id;

                queriesTodo.push(function(callback) {
                    req.models.voucher.find({user_id: req.params.uuid, order_id: currentOrder.id}, function(err, results) {
                        if(err) {
                            callback(true, null);
                            return;
                        }

                        var vouchers = [];
                        _.forEach(results, function(voucher) {
                            vouchers.push({id: voucher.voucher_id, name: voucher.name, type: voucher.type});
                        });
                        currentOrder.vouchers = vouchers;
                        callback(null, "done");
                    });
                });

                //get the order produts from the order results
                var products = [];
                _.forEach(orderProducts, function(product) {
                    console.log(currentOrder.id);
                    queriesTodo.push(function(callback) {
                        if(err) {
                            callback(true, null);
                            return;
                        }
                        req.models.product.one({id: product.product_id}, function(err, result) {
                            console.log(result.name);
                            products.push({id: result.id, name: result.name, price: result.price, quantity: product.quantity});
                            callback(null, "done");
                        });
                    });

                    //products.push({id: product.product_id, quantity: product.quantity});
                });
                currentOrder.products = products;

                organized.push(currentOrder);
            });

            async.parallel(queriesTodo, function(err, results) {
                if(err) {
                    res.send("Something went wrong");
                }
                else {
                    res.send(organized);
                }
            });   
        }

    });

});

app.get('/voucher', function(req,res) {
  req.models.voucher.all(function(err,results){
    res.json(results)
  });
});

app.post('/order', function(req,res) {

    var groupedProducts = _.groupBy(req.body.products, 'order_id');
    var groupedVouchers = _.groupBy(req.body.vouchers, 'order_id');

    var verify = crypto.createVerify('sha1WithRSAEncryption');

    var voucherQueries = [];

    console.log(req.body);

    //For each order
    _.forEach(groupedVouchers, function(order) {
        voucherQueries.push(function(callback) {
            //check if the user is in the blacklist
            req.models.client.one({uuid: order[0].user_id}, function(err, result) {
                if(!err) {
                    //The user is not in the blacklist
                    if(result.status == true) {
                        //For each voucher in the order
                        _.forEach(order, function(voucher) {
                            //verify if the voucher signature is valid
                            var toVerify = {
                                name: voucher.name,
                                type: voucher.type,
                                user_id: voucher.user_id,
                                voucher_id: voucher.voucher_id,
                            }

                            verify.update(JSON.stringify(toVerify));

                            if(verify.verify(keys.public, voucher.signature, 'base64')) {
                                //If the signature is valid, update the order_id in the database
                                req.models.voucher.find({voucher_id: voucher.voucher_id}, function(err, results){
                                    results[0].order_id = voucher.order_id;
                                    results[0].save(function(err){
                                        callback(null, true);
                                    });
                                });
                            }
                            else {
                                //Put the user in the blacklist
                                req.models.client.one({uuid:voucher.user_id}, function (err,result) {
                                    result.status = false;
                                    result.save(function(err) {
                                        callback(true, null);
                                    });
                                });
                            }

                        });
                    }
                    //The user is in the blacklist
                    else {
                        callback(true, null);
                    }
                }
            });
        });

    });

    //execute all the requests
    async.parallel(voucherQueries, function(err, results) {
        if(err) {
            res.send({result:"user banned"});
        }
        else {
            //If all the vouchers are valid, then go through the produts
            
            //For each order
            _.forEach(groupedProducts, function(order) {
                //If the order total price is more than 20, generate a random voucher
                if(order[0].total_price > 20) {
                    generateVoucher(req.models.voucher, Math.floor(Math.random()*(2-1+1)+1), order[0].uuid);
                }

                checkUserTotalSpent(req.models.client, req.models.voucher, order[0].uuid, order[0].total_price);

                //For each product
                _.forEach(order, function(product) {
                    var newOrder = {
                        user_id: product.uuid,
                        product_id: product.product_id,
                        order_id: product.order_id,
                        quantity: product.quantity
                    }
                    req.models.order.create(newOrder,function(err,results){
                        
                    });
                });

                //Send the result
                res.send({result:"order saved"});
            });
        }
        
    });

});

app.get("/cenas", function(req, res) {
    console.log(keys.public);
    const sign = crypto.createSign('sha1WithRSAEncryption');
    sign.update("memes");
    res.send(sign.sign(keys.private, 'base64'));    
})

app.get('/api', function(req,res) {
  res.send({"public_key": keys.public});
});

function generateVoucher(model, type, user_id) {
    const sign = crypto.createSign('sha1WithRSAEncryption');

    if(type === 1) {
        name = "Free Popcorn";
    }
    else if(type === 2) {
        name = "Free Coffee";
    }
    else if(type === 3) {
        name = "5% Discount";
    }

    var voucher = {
        name: name,
        type: type,
        user_id: user_id
    }

    voucher.voucher_id = Math.floor(Math.random()*(1000-1+1)+1) + Math.floor(Math.random()*(500-100+1)+100);
    
    sign.update(JSON.stringify(voucher));
    voucher.signature = sign.sign(keys.private,'base64');
    voucher.order_id = null;

    model.create(voucher, function(err,results) {

    });
}

function checkUserTotalSpent(clientModel, voucherModel, user_uuid, moneyToAdd) {
    clientModel.one({}, function(err, result) {
        if(!err) {
            if(result.total_spent + moneyToAdd >= 100) {
                generateVoucher(voucherModel, 3, user_uuid);
                result.total_spent = 0;
                result.save(function(err) {
                    
                });
            }
            else {
                result.total_spent += moneyToAdd;
                result.save(function(err) {

                });
            }
        }
    });
}



app.listen(app.get('port'), function() {
  console.log('Server started: http://localhost:' + app.get('port') + '/');
});
