var productModel = {
    id:     {type: 'serial', key: true}, // the auto-incrementing primary key
    name:   {type: 'text'},
    price:  {type: 'number'}
}

module.exports = {
    productModel
}
