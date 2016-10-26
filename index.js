var express     = require('express');
var orm         = require('orm');
var bodyParser  = require('body-parser');
var config      = require('./config');
var app         = express();
var Client      = require('./models/client');
var Order       = require('./models/order');
var Product     = require('./models/product');
var Voucher     = require('./models/voucher');

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
        models.voucher = db.define("voucher", Voucher.voucherModel, Voucher.voucherOptions);

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
    res.send([{voucher_id:5454, name:"Free Popcorn", type:1, user_id:1, signature:"lsndlkasndla"},{voucher_id:4545, name:"Free Coffee", type:2, user_id:1, signature:"dsfdsf"}]);
});

app.get('/order',function(req,res) {
  req.models.order.find(null,function(err,results){
    res.json(results)
  });
});


app.post('/order', function(req,res) {

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
        res.json(results);
      }
    });
  })
});



app.listen(app.get('port'), function() {
  console.log('Server started: http://localhost:' + app.get('port') + '/');
});
