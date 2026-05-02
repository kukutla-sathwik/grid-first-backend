import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import pool from '../config/db.js';
import { authRequired, loadCurrentUser } from '../middleware/auth.js';

dotenv.config();

const router = express.Router();

function signToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
  };
  const secret = process.env.JWT_SECRET || 'dev_secret';
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  return jwt.sign(payload, secret, { expiresIn });
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { full_name, email, password, role, bar_council_id } = req.body || {};

  if (!full_name || !email || !password || !role) {
    return res.status(400).json({ message: 'full_name, email, password and role are required' });
  }

  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) {
    return res.status(409).json({ message: 'Email already in use' });
  }

  const password_hash = await bcrypt.hash(password, 10);

  // Citizens and admins are active immediately; lawyers require admin approval.
  const status = role === 'LAWYER' ? 'pending_approval' : 'active';

  const [result] = await pool.query(
    'INSERT INTO users (full_name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)',
    [full_name, email, password_hash, role, status],
  );

  const userId = result.insertId;

  if (role === 'LAWYER') {
    // Minimal default profile for lawyer, can be updated via /api/lawyers/profile
    await pool.query(
      'INSERT INTO lawyer_profiles (user_id, specialization, availability_mode, bar_council_id) VALUES (?, ?, ?, ?)',
      [userId, 'General Practice', 'SIMPLE_STATUS', bar_council_id || null],
    );
  }

  const [rows] = await pool.query(
    'SELECT id, full_name, email, role, status, reviewed_by, reviewed_at, created_at, updated_at FROM users WHERE id = ?',
    [userId],
  );

  const user = rows[0];
  return res.status(201).json({ message: 'Registered successfully', user });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }

  const [rows] = await pool.query(
    'SELECT id, full_name, email, password_hash, role, status, reviewed_by, reviewed_at, created_at, updated_at FROM users WHERE email = ?',
    [email],
  );

  if (!rows.length) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const user = rows[0];
  const passwordMatches = await bcrypt.compare(password, user.password_hash);

  if (!passwordMatches) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  if (user.status === 'pending_approval') {
    return res.status(403).json({ message: 'Your account is pending approval' });
  }

  if (user.status === 'rejected') {
    return res.status(403).json({ message: 'Your account has been rejected' });
  }

  const token = signToken(user);

  // Strip password_hash before returning
  // eslint-disable-next-line no-unused-vars
  const { password_hash, ...safeUser } = user;

  return res.json({ token, user: safeUser });
});

// GET /api/auth/me
router.get('/me', authRequired, loadCurrentUser, (req, res) => {
  return res.json(req.currentUser);
});

export default router;

