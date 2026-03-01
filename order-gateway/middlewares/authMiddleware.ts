import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRETS = (process.env.JWT_SECRET || 'super_secret_jwt_key').split(',');

export interface AuthRequest extends Request {
    user?: any;
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || (req.query.token as string);

    if (!token) {
        res.sendStatus(401);
        return;
    }

    let verified = false;
    for (const secret of JWT_SECRETS) {
        try {
            const user = jwt.verify(token, secret);
            req.user = user;
            verified = true;
            break;
        } catch (err) {
            // Continue to next secret
        }
    }

    if (!verified) {
        res.sendStatus(403);
        return;
    }

    next();
}
