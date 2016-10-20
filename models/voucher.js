var voucherModel = {
    voucher_id:    {type: 'integer', unique: true},
    name:          {type: 'text'},
    type:          {type: 'integer'},
    user_id:       {type: 'text'},
    signature:     {type: 'text'}
}

var voucherOptions = {
    hooks: {
        beforeSave: function(next) {
            var _this = this;

            this.signature = "";
        }
    }
}

module.exports = {
    voucherModel, voucherOptions
}
