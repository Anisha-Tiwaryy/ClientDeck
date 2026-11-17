import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

export const sign = (u) => jwt.sign({ id: u.id, role: u.role, name: u.name }, SECRET, { expiresIn: '12h' });

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Reps only see their own leads; managers see everyone's.
export const scope = (user, alias = 'l') =>
  user.role === 'manager' ? { sql: 'TRUE', params: [] } : { sql: `${alias}.owner_id = $1`, params: [user.id] };

const Register = z.object({
  name: z.string().min(2), email: z.string().email(), password: z.string().min(8),
  role: z.enum(['rep', 'manager']).default('rep'),
});
const Login = z.object({ email: z.string().email(), password: z.string() });

export async function register(req, res) {
  const b = Register.parse(req.body);
  const hash = await bcrypt.hash(b.password, 10);
  const { rows } = await query(
    'INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING RETURNING id, name, email, role',
    [b.name, b.email.toLowerCase(), hash, b.role]);
  if (!rows[0]) return res.status(409).json({ error: 'Email already registered' });
  res.status(201).json({ user: rows[0], token: sign(rows[0]) });
}

export async function login(req, res) {
  const b = Login.parse(req.body);
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [b.email.toLowerCase()]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(b.password, u.password_hash))) return res.status(401).json({ error: 'Wrong email or password' });
  res.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role }, token: sign(u) });
}
