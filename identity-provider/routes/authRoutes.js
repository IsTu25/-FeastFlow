const express = require('express');

function getAuthRoutes(authController) {
    const router = express.Router();

    router.post('/login', (req, res) => authController.login(req, res));

    return router;
}

module.exports = getAuthRoutes;
