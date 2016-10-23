var uuid   = require('uuid');
var bcrypt = require('bcrypt-nodejs');

var clientModel = {
    id:         {type: 'serial', key: true}, // the auto-incrementing primary key
    uuid:       {type: 'text', unique: true},
    name:       {type: 'text'},
    username:   {type: 'text'},
    pin:        {type: 'integer', size: 4},
    creditcard: {type: 'text'},
    status:     {type: 'boolean'}
}

var clientOptions = {
    hooks: {
        beforeSave: function(next) {
            var _this = this;

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
    }
}

module.exports = {
    clientModel, clientOptions
}
