var productModel = {
    product_id:    {type: 'integer', unique: true},
    name: {type: 'text'},
    price:   {type:'integer'}
}

module.exports = {
    productModel
}
