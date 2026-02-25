const express = require('express');
const { authenticateToken } = require('../middlewares/authMiddleware');

function getOrderRoutes(orderController) {
    const router = express.Router();

    router.post('/', authenticateToken, (req, res) => orderController.createOrder(req, res));

    return router;
}

module.exports = getOrderRoutes;
