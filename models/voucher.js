var voucherModel = {
    voucher_id:    {type: 'integer', unique: true},
    name:          {type: 'text'},
    type:          {type: 'integer'},
    user_id:       {type: 'text'},
    order_id:      {type: 'integer'},
    signature:     {type: 'text'}
}


module.exports = {
    voucherModel
}
