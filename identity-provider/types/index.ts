export interface User {
    studentId: string;
    passwordHash: string;
    role?: string;
}

export interface AuthResponse {
    token: string;
    studentId: string;
}
