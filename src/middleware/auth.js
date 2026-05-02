import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import pool from '../config/db.js';

dotenv.config();

export function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    req.user = {
      id: payload.id,
      role: payload.role,
      email: payload.email,
    };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

export async function loadCurrentUser(req, res, next) {
  if (!req.user) return next();

  const [rows] = await pool.query(
    'SELECT id, full_name, email, role, status, reviewed_by, reviewed_at, created_at, updated_at FROM users WHERE id = ?',
    [req.user.id],
  );

  if (!rows.length) {
    return res.status(401).json({ message: 'User not found' });
  }

  req.currentUser = rows[0];
  next();
}
