import { Pool, PoolClient } from 'pg';
import { User } from '../types';

export class UserRepository {
    private pool: Pool;

    constructor(pool: Pool) {
        this.pool = pool;
    }

    async findByStudentId(studentId: string): Promise<User | undefined> {
        const res = await this.pool.query('SELECT id as "studentId", password_hash as "passwordHash" FROM students WHERE id = $1', [studentId]);
        return res.rows[0];
    }

    async initializeDatabase(defaultPasswordHash: string): Promise<void> {
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
            `, [defaultPasswordHash]);
        } finally {
            client.release();
        }
    }
}

export default UserRepository;
