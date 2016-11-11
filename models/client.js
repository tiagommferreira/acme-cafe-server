var uuid   = require('uuid');
var bcrypt = require('bcrypt-nodejs');

var clientModel = {
    id:         {type: 'serial', key: true}, // the auto-incrementing primary key
    uuid:       {type: 'text', unique: true},
    name:       {type: 'text'},
    username:   {type: 'text'},
    password:   {type: 'text'},
    pin:        {type: 'integer', size: 4},
    creditcard: {type: 'text'},
    cc_date:    {type: 'date'},
    total_spent:{type: 'number'},            
    status:     {type: 'boolean'}
}

var clientOptions = {
    hooks: {
        beforeCreate: function(next) {
            var _this = this;
            _this.total_spent = 0;
              _this.uuid = uuid.v1();
              _this.pin = Math.floor(1000 + Math.random() * 9000);
              _this.status = true;

              bcrypt.genSalt(10, function (err, salt) {
                  if (err) {
                      return next(err);
                  }
                  bcrypt.hash(_this.password, salt, null, function (err, hash) {
                      if (err) {
                          return next(err);
                      }
                      _this.password = hash;
                      next();
                  });
              });

        }
    },
    methods: {
        comparePassword: function(pass, cb) {
            bcrypt.compare(pass, this.password, function (err, isMatch) {
                if (err) {
                    return cb(err);
                }
                cb(null, isMatch);
            });
        }
    }
}

module.exports = {
    clientModel, clientOptions
}
