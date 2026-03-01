import { Request, Response } from 'express';
import { AuthService } from '../services/authService';

export class AuthController {
    private authService: AuthService;

    constructor(authService: AuthService) {
        this.authService = authService;
    }

    async login(req: Request, res: Response) {
        const { studentId, password } = req.body;
        if (!studentId || !password) {
            return res.status(400).json({ error: 'Missing credentials' });
        }

        try {
            const result = await this.authService.login(studentId, password);
            if (!result) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            res.json(result);
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}

export default AuthController;
