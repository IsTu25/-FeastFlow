const express = require('express');

function getStockRoutes(stockController) {
    const router = express.Router();

    router.post('/deduct', (req, res) => stockController.deduct(req, res));

    return router;
}

module.exports = getStockRoutes;
