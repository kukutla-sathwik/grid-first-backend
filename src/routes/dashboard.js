import express from 'express';
import pool from '../config/db.js';
import { authRequired } from '../middleware/auth.js';

const router = express.Router();

// GET /api/dashboard/stats - role-based stats grid
router.get('/stats', authRequired, async (req, res) => {
  const user = req.user;

  if (user.role === 'ADMIN') {
    const [[{ totalUsers }]] = await pool.query('SELECT COUNT(*) AS totalUsers FROM users');
    const [[{ pendingApprovals }]] = await pool.query(
      "SELECT COUNT(*) AS pendingApprovals FROM users WHERE status = 'pending_approval'",
    );
    const [[{ totalLawyers }]] = await pool.query(
      "SELECT COUNT(*) AS totalLawyers FROM users WHERE role = 'LAWYER'",
    );
    const [[{ totalCitizens }]] = await pool.query(
      "SELECT COUNT(*) AS totalCitizens FROM users WHERE role = 'CITIZEN'",
    );
    const [[{ totalCases }]] = await pool.query('SELECT COUNT(*) AS totalCases FROM cases');

    return res.json({
      totalUsers: Number(totalUsers),
      pendingApprovals: Number(pendingApprovals),
      totalLawyers: Number(totalLawyers),
      totalCitizens: Number(totalCitizens),
      totalCases: Number(totalCases),
    });
  }

  if (user.role === 'LAWYER') {
    const [[{ totalConsultations }]] = await pool.query(
      'SELECT COUNT(*) AS totalConsultations FROM consultations WHERE lawyer_id = ?',
      [user.id],
    );
    const [[{ pendingRequests }]] = await pool.query(
      "SELECT COUNT(*) AS pendingRequests FROM consultations WHERE lawyer_id = ? AND status = 'REQUESTED'",
      [user.id],
    );
    const [[{ acceptedConsultations }]] = await pool.query(
      "SELECT COUNT(*) AS acceptedConsultations FROM consultations WHERE lawyer_id = ? AND status = 'ACCEPTED'",
      [user.id],
    );
    const [[{ activeCases }]] = await pool.query(
      `
      SELECT COUNT(*) AS activeCases
      FROM cases cs
      JOIN consultations con ON con.id = cs.consultation_id
      WHERE con.lawyer_id = ? AND cs.case_status IN ('OPEN','IN_PROGRESS')
      `,
      [user.id],
    );

    return res.json({
      totalConsultations: Number(totalConsultations),
      pendingRequests: Number(pendingRequests),
      acceptedConsultations: Number(acceptedConsultations),
      activeCases: Number(activeCases),
    });
  }

  // CITIZEN
  const [[{ totalConsultations }]] = await pool.query(
    'SELECT COUNT(*) AS totalConsultations FROM consultations WHERE citizen_id = ?',
    [user.id],
  );
  const [[{ pendingConsultations }]] = await pool.query(
    "SELECT COUNT(*) AS pendingConsultations FROM consultations WHERE citizen_id = ? AND status = 'REQUESTED'",
    [user.id],
  );
  const [[{ activeCases }]] = await pool.query(
    `
    SELECT COUNT(*) AS activeCases
    FROM cases cs
    JOIN consultations con ON con.id = cs.consultation_id
    WHERE con.citizen_id = ? AND cs.case_status IN ('OPEN','IN_PROGRESS')
    `,
    [user.id],
  );

  return res.json({
    totalConsultations: Number(totalConsultations),
    pendingConsultations: Number(pendingConsultations),
    activeCases: Number(activeCases),
  });
});

export default router;

