class AuthController {
    constructor(authService) {
        this.authService = authService;
    }

    async login(req, res) {
        const { studentId, password } = req.body;
        if (!studentId || !password) {
            return res.status(400).json({ error: 'Missing credentials' });
        }

        try {
            const result = await this.authService.login(studentId, password);
            res.json(result);
        } catch (error) {
            console.error("Login error:", error);
            res.status(error.status || 500).json({ error: error.message || 'Internal server error' });
        }
    }
}

module.exports = AuthController;
