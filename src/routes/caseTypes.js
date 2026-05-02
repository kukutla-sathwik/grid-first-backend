import express from 'express';
import pool from '../config/db.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = express.Router();

// GET /api/case-types
router.get('/', authRequired, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, case_type_name, description, is_active FROM case_types ORDER BY case_type_name ASC',
  );
  res.json(rows.map((r) => ({ ...r, is_active: !!r.is_active })));
});

// POST /api/case-types (admin)
router.post('/', authRequired, requireRole('ADMIN'), async (req, res) => {
  const { case_type_name, description, is_active } = req.body || {};
  if (!case_type_name) return res.status(400).json({ message: 'case_type_name is required' });

  const [result] = await pool.query(
    'INSERT INTO case_types (case_type_name, description, is_active) VALUES (?, ?, ?)',
    [case_type_name, description || null, is_active === false ? 0 : 1],
  );

  const [rows] = await pool.query(
    'SELECT id, case_type_name, description, is_active FROM case_types WHERE id = ?',
    [result.insertId],
  );
  res.status(201).json({ ...rows[0], is_active: !!rows[0].is_active });
});

// PUT /api/case-types/:id (admin)
router.put('/:id', authRequired, requireRole('ADMIN'), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid id' });

  const { case_type_name, description, is_active } = req.body || {};
  const fields = [];
  const values = [];

  if (case_type_name !== undefined) {
    fields.push('case_type_name = ?');
    values.push(case_type_name);
  }
  if (description !== undefined) {
    fields.push('description = ?');
    values.push(description);
  }
  if (is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(is_active ? 1 : 0);
  }

  if (!fields.length) return res.status(400).json({ message: 'Nothing to update' });

  values.push(id);
  const [result] = await pool.query(`UPDATE case_types SET ${fields.join(', ')} WHERE id = ?`, values);
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Case type not found' });

  const [rows] = await pool.query(
    'SELECT id, case_type_name, description, is_active FROM case_types WHERE id = ?',
    [id],
  );
  res.json({ ...rows[0], is_active: !!rows[0].is_active });
});

export default router;

