class UserRepository {
    constructor(pool) {
        this.pool = pool;
    }

    async findUserByIdAndPassword(studentId, passwordHash) {
        const result = await this.pool.query('SELECT * FROM students WHERE id = $1 AND password_hash = $2', [studentId, passwordHash]);
        return result.rows[0];
    }

    async initializeDatabase(initialHash) {
        const client = await this.pool.connect();
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS students (
                    id VARCHAR(50) PRIMARY KEY,
                    password_hash VARCHAR(255) NOT NULL
                );
            `);

            await client.query(`
                INSERT INTO students (id, password_hash) 
                VALUES ('user123', $1) 
                ON CONFLICT (id) DO NOTHING;
            `, [initialHash]);
        } finally {
            client.release();
        }
    }
}

module.exports = UserRepository;
