import express, { Router } from 'express';
import { AuthController } from '../controllers/authController';

export default function getAuthRoutes(authController: AuthController): Router {
    const router = express.Router();

    router.post('/login', (req, res) => authController.login(req, res));

    return router;
}
