var express     = require('express');
var orm         = require('orm');
var bodyParser  = require('body-parser');
var config      = require('./config');
var app         = express();
var Client      = require('./models/client');

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

app.listen(app.get('port'), function() {
  console.log('Server started: http://localhost:' + app.get('port') + '/');
});