module.exports = {

    'secret': 'supersecret',
    'database': process.env.DATABASE_URL || 'postgres://postgres:123123@localhost:5432/acme'

};
