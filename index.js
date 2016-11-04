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

        var organized = [];
        var groupedOrders = _.values(_.groupBy(results, 'order_id'));

        var vouchersToFetch = [];

        _.forEach(groupedOrders, function(orderProducts) {
            var currentOrder = {};
            currentOrder.id = orderProducts[0].order_id;

            vouchersToFetch.push(function(callback) {
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
                products.push({id: product.product_id, quantity: product.quantity});
            });
            currentOrder.products = products;

            organized.push(currentOrder);
        });

        async.parallel(vouchersToFetch, function(err, results) {
            if(err) {
                res.send("Something went wrong");
            }
            else {
                res.send(organized);
            }
        });


    });

});

function getOrderVouchers(voucherModel, uuid, order_id) {
    //get the order vouchers from the database
    voucherModel.find({user_id: uuid, order_id: order_id}, function(err, results) {
        var vouchers = [];
        _.forEach(results, function(voucher) {
            vouchers.push({id: voucher.voucher_id, name: voucher.name, type: voucher.type});
        });
        return vouchers;
    });

}


app.get('/voucher', function(req,res) {
  req.models.voucher.all(function(err,results){
    res.json(results)
  });
});

app.post('/order', function(req,res) {
    var order_id = req.body.products[0].order_id;
    var uuid = req.body.products[0].uuid;
    var total_price = req.body.products[0].total_price;

    var verify = crypto.createVerify('sha1WithRSAEncryption');

    req.body.vouchers.forEach(function(voucher) {
        var toVerify = {
            name: voucher.name,
            type: voucher.type,
            user_id: voucher.user_id,
            order_id: null,
            voucher_id: voucher.voucher_id,
        }

        verify.update(JSON.stringify(toVerify));

        if(verify.verify(keys.public, voucher.signature, 'base64')) {
            req.models.voucher.find({voucher_id: voucher.voucher_id}, function(err, results){
                results[0].order_id = order_id;
                results[0].save(function(err){

                });
            });
        }
        else {
            console.log("not legit signature");
            res.send('Error validating signature');
            //TODO: add user to blacklist
            return;
        }
    });

    req.body.products.forEach(function(orderItem){
        var newOrder = {
            user_id: orderItem.uuid,
            product_id: orderItem.product_id,
            order_id: orderItem.order_id,
            quantity: orderItem.quantity
        }
        req.models.order.create(newOrder,function(err,results){
            if(err) {
                res.send('Something went wrong');
            }
            else {
            }
        });
    });

    if(total_price > 20) {
        generateVoucher(req.models.voucher, Math.floor(Math.random()*(2-1+1)+1), uuid);
    }

    res.send({success: true});

});

app.get('/api', function(req,res) {
  res.send({"public_key": keys.public});
});

app.get('/client/:uuid/total', function(req, res) {
    var client_uuid = req.params.uuid;

    req.models.order.find({user_id: client_uuid}, function(err, results){
        if(err) {
            res.send(err);
        }
        else {
            req.models.product.all(function(prodErr, prodResults){
                if(prodErr) {
                    res.send(prodErr);
                }
                else {
                    var total = 0;

                    results.forEach(function(result) {

                        var product = prodResults.find(function(element){
                            return element.id === result.product_id;
                        });

                        total += product.price * result.quantity;

                    });

                    res.send({total: total});
                }
            });
        }
    });

});


function generateVoucher(model, type, user_id) {
    const sign = crypto.createSign('sha1WithRSAEncryption');

    var name = type === 1 ? "Free Popcorn" : "Free Coffee";

    var voucher = {
        name: name,
        type: type,
        user_id: user_id,
        order_id: null,
    }

    voucher.voucher_id = Math.floor(Math.random()*(1000-1+1)+1) + Math.floor(Math.random()*(500-100+1)+100);;

    sign.update(JSON.stringify(voucher));
    voucher.signature = sign.sign(keys.private,'base64');

    model.create(voucher, function(err,results) {

    });
}



app.listen(app.get('port'), function() {
  console.log('Server started: http://localhost:' + app.get('port') + '/');
});
