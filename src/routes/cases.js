import express from 'express';
import multer from 'multer';
import pool from '../config/db.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

async function getCaseWithType(caseId) {
  const [rows] = await pool.query(
    `
    SELECT
      c.*,
      ct.id AS ct_id, ct.case_type_name AS ct_name, ct.description AS ct_desc, ct.is_active AS ct_active
    FROM cases c
    JOIN case_types ct ON ct.id = c.case_type_id
    WHERE c.id = ?
    LIMIT 1
    `,
    [caseId],
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id,
    consultation_id: r.consultation_id,
    case_type_id: r.case_type_id,
    case_title: r.case_title,
    case_description: r.case_description,
    priority_level: r.priority_level,
    case_status: r.case_status,
    created_at: r.created_at,
    updated_at: r.updated_at,
    case_type: {
      id: r.ct_id,
      case_type_name: r.ct_name,
      description: r.ct_desc,
      is_active: !!r.ct_active,
    },
  };
}

async function canAccessCase(user, caseId) {
  const [rows] = await pool.query(
    `
    SELECT cs.id, con.citizen_id, con.lawyer_id
    FROM cases cs
    JOIN consultations con ON con.id = cs.consultation_id
    WHERE cs.id = ?
    LIMIT 1
    `,
    [caseId],
  );
  if (!rows.length) return { ok: false, status: 404, message: 'Case not found' };
  const r = rows[0];

  if (user.role === 'ADMIN') return { ok: true };
  if (user.role === 'CITIZEN' && Number(r.citizen_id) === Number(user.id)) return { ok: true };
  if (user.role === 'LAWYER' && Number(r.lawyer_id) === Number(user.id)) return { ok: true };

  return { ok: false, status: 403, message: 'Forbidden' };
}

// GET /api/cases - list cases for current user
router.get('/', authRequired, async (req, res) => {
  const user = req.user;
  let where = '';
  let params = [];

  if (user.role === 'ADMIN') {
    where = '1=1';
    params = [];
  } else if (user.role === 'CITIZEN') {
    where = 'con.citizen_id = ?';
    params = [user.id];
  } else if (user.role === 'LAWYER') {
    where = 'con.lawyer_id = ?';
    params = [user.id];
  } else {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const [rows] = await pool.query(
    `
    SELECT
      cs.*,
      ct.id AS ct_id, ct.case_type_name AS ct_name, ct.description AS ct_desc, ct.is_active AS ct_active
    FROM cases cs
    JOIN consultations con ON con.id = cs.consultation_id
    JOIN case_types ct ON ct.id = cs.case_type_id
    WHERE ${where}
    ORDER BY cs.updated_at DESC
    `,
    params,
  );

  const mapped = rows.map((r) => ({
    id: r.id,
    consultation_id: r.consultation_id,
    case_type_id: r.case_type_id,
    case_title: r.case_title,
    case_description: r.case_description,
    priority_level: r.priority_level,
    case_status: r.case_status,
    created_at: r.created_at,
    updated_at: r.updated_at,
    case_type: {
      id: r.ct_id,
      case_type_name: r.ct_name,
      description: r.ct_desc,
      is_active: !!r.ct_active,
    },
  }));

  res.json(mapped);
});

// GET /api/cases/:id - case detail
router.get('/:id', authRequired, async (req, res) => {
  const caseId = Number(req.params.id);
  if (!caseId) return res.status(400).json({ message: 'Invalid id' });

  const access = await canAccessCase(req.user, caseId);
  if (!access.ok) return res.status(access.status).json({ message: access.message });

  const cs = await getCaseWithType(caseId);
  if (!cs) return res.status(404).json({ message: 'Case not found' });
  res.json(cs);
});

// POST /api/cases - create case (lawyer or admin)
router.post('/', authRequired, async (req, res) => {
  const user = req.user;
  if (!(user.role === 'LAWYER' || user.role === 'ADMIN')) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const {
    consultation_id,
    case_type_id,
    case_title,
    case_description,
    priority_level,
    case_status,
  } = req.body || {};

  if (!consultation_id || !case_type_id || !case_title) {
    return res
      .status(400)
      .json({ message: 'consultation_id, case_type_id, and case_title are required' });
  }

  // For lawyer: consultation must belong to them and be accepted
  if (user.role === 'LAWYER') {
    const [cons] = await pool.query(
      'SELECT id, lawyer_id, status FROM consultations WHERE id = ? LIMIT 1',
      [consultation_id],
    );
    if (!cons.length) return res.status(404).json({ message: 'Consultation not found' });
    if (Number(cons[0].lawyer_id) !== Number(user.id)) return res.status(403).json({ message: 'Forbidden' });
    if (cons[0].status !== 'ACCEPTED') {
      return res.status(409).json({ message: 'Consultation must be ACCEPTED to create a case' });
    }
  }

  const [result] = await pool.query(
    `
    INSERT INTO cases (
      consultation_id, case_type_id, case_title, case_description, priority_level, case_status
    ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      consultation_id,
      case_type_id,
      case_title,
      case_description || null,
      priority_level || 'MEDIUM',
      case_status || 'OPEN',
    ],
  );

  const cs = await getCaseWithType(result.insertId);
  res.status(201).json(cs);
});

// PATCH /api/cases/:id - update case details/status (lawyer/admin)
router.patch('/:id', authRequired, async (req, res) => {
  const user = req.user;
  if (!(user.role === 'LAWYER' || user.role === 'ADMIN')) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const caseId = Number(req.params.id);
  if (!caseId) return res.status(400).json({ message: 'Invalid id' });

  const access = await canAccessCase(user, caseId);
  if (!access.ok) return res.status(access.status).json({ message: access.message });

  const allowed = ['case_title', 'case_description', 'priority_level', 'case_status', 'case_type_id'];
  const updates = [];
  const values = [];

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
      updates.push(`${key} = ?`);
      values.push(req.body[key]);
    }
  }

  if (!updates.length) return res.status(400).json({ message: 'Nothing to update' });

  values.push(caseId);
  await pool.query(`UPDATE cases SET ${updates.join(', ')} WHERE id = ?`, values);

  const cs = await getCaseWithType(caseId);
  res.json(cs);
});

// ---- CASE NOTES ----

// GET /api/cases/:id/notes
router.get('/:id/notes', authRequired, async (req, res) => {
  const caseId = Number(req.params.id);
  if (!caseId) return res.status(400).json({ message: 'Invalid id' });

  const access = await canAccessCase(req.user, caseId);
  if (!access.ok) return res.status(access.status).json({ message: access.message });

  const [rows] = await pool.query(
    `
    SELECT
      n.*,
      u.id AS u_id, u.full_name AS u_full_name, u.email AS u_email, u.role AS u_role, u.status AS u_status,
      u.reviewed_by AS u_reviewed_by, u.reviewed_at AS u_reviewed_at, u.created_at AS u_created_at, u.updated_at AS u_updated_at
    FROM case_notes n
    JOIN users u ON u.id = n.author_id
    WHERE n.case_id = ?
    ORDER BY n.created_at ASC
    `,
    [caseId],
  );

  const mapped = rows
    .filter((r) => {
      // citizens should only see shared notes
      if (req.user.role === 'CITIZEN') return r.visibility === 'SHARED_WITH_CITIZEN';
      return true;
    })
    .map((r) => ({
      id: r.id,
      case_id: r.case_id,
      author_id: r.author_id,
      note_type: r.note_type,
      content: r.content,
      visibility: r.visibility,
      created_at: r.created_at,
      updated_at: r.updated_at,
      author: {
        id: r.u_id,
        full_name: r.u_full_name,
        email: r.u_email,
        role: r.u_role,
        status: r.u_status,
        reviewed_by: r.u_reviewed_by,
        reviewed_at: r.u_reviewed_at,
        created_at: r.u_created_at,
        updated_at: r.u_updated_at,
      },
    }));

  res.json(mapped);
});

// POST /api/cases/:id/notes
router.post('/:id/notes', authRequired, async (req, res) => {
  const caseId = Number(req.params.id);
  if (!caseId) return res.status(400).json({ message: 'Invalid id' });

  const access = await canAccessCase(req.user, caseId);
  if (!access.ok) return res.status(access.status).json({ message: access.message });

  const { note_type, content, visibility } = req.body || {};
  if (!note_type || !content) return res.status(400).json({ message: 'note_type and content are required' });

  // Citizens cannot create LAWYER_ONLY notes
  const finalVisibility =
    req.user.role === 'CITIZEN' ? 'SHARED_WITH_CITIZEN' : visibility || 'LAWYER_ONLY';

  const [result] = await pool.query(
    'INSERT INTO case_notes (case_id, author_id, note_type, content, visibility) VALUES (?, ?, ?, ?, ?)',
    [caseId, req.user.id, note_type, content, finalVisibility],
  );

  const [rows] = await pool.query(
    `
    SELECT
      n.*,
      u.id AS u_id, u.full_name AS u_full_name, u.email AS u_email, u.role AS u_role, u.status AS u_status,
      u.reviewed_by AS u_reviewed_by, u.reviewed_at AS u_reviewed_at, u.created_at AS u_created_at, u.updated_at AS u_updated_at
    FROM case_notes n
    JOIN users u ON u.id = n.author_id
    WHERE n.id = ?
    `,
    [result.insertId],
  );

  const r = rows[0];
  res.status(201).json({
    id: r.id,
    case_id: r.case_id,
    author_id: r.author_id,
    note_type: r.note_type,
    content: r.content,
    visibility: r.visibility,
    created_at: r.created_at,
    updated_at: r.updated_at,
    author: {
      id: r.u_id,
      full_name: r.u_full_name,
      email: r.u_email,
      role: r.u_role,
      status: r.u_status,
      reviewed_by: r.u_reviewed_by,
      reviewed_at: r.u_reviewed_at,
      created_at: r.u_created_at,
      updated_at: r.u_updated_at,
    },
  });
});

// ---- CASE ATTACHMENTS ----

// GET /api/cases/:id/attachments
router.get('/:id/attachments', authRequired, async (req, res) => {
  const caseId = Number(req.params.id);
  if (!caseId) return res.status(400).json({ message: 'Invalid id' });

  const access = await canAccessCase(req.user, caseId);
  if (!access.ok) return res.status(access.status).json({ message: access.message });

  const [rows] = await pool.query(
    `
    SELECT
      a.*,
      u.id AS u_id, u.full_name AS u_full_name, u.email AS u_email, u.role AS u_role, u.status AS u_status,
      u.reviewed_by AS u_reviewed_by, u.reviewed_at AS u_reviewed_at, u.created_at AS u_created_at, u.updated_at AS u_updated_at
    FROM case_attachments a
    JOIN users u ON u.id = a.uploaded_by
    WHERE a.case_id = ?
    ORDER BY a.created_at DESC
    `,
    [caseId],
  );

  const mapped = rows.map((r) => ({
    id: r.id,
    case_id: r.case_id,
    uploaded_by: r.uploaded_by,
    attachment_type: r.attachment_type,
    file_name: r.file_name,
    file_url: r.file_url,
    file_size: r.file_size,
    mime_type: r.mime_type,
    created_at: r.created_at,
    uploader: {
      id: r.u_id,
      full_name: r.u_full_name,
      email: r.u_email,
      role: r.u_role,
      status: r.u_status,
      reviewed_by: r.u_reviewed_by,
      reviewed_at: r.u_reviewed_at,
      created_at: r.u_created_at,
      updated_at: r.u_updated_at,
    },
  }));

  res.json(mapped);
});

// POST /api/cases/:id/attachments - upload attachment
// Note: this stores a placeholder file_url (no real file storage yet).
router.post('/:id/attachments', authRequired, upload.single('file'), async (req, res) => {
  const caseId = Number(req.params.id);
  if (!caseId) return res.status(400).json({ message: 'Invalid id' });

  const access = await canAccessCase(req.user, caseId);
  if (!access.ok) return res.status(access.status).json({ message: access.message });

  const attachment_type = req.body?.attachment_type || 'DOCUMENT';
  const file = req.file;
  const file_name = file?.originalname || req.body?.file_name || null;
  const file_size = file?.size || null;
  const mime_type = file?.mimetype || null;

  // Placeholder URL for now. Replace with S3/local upload later.
  const file_url = req.body?.file_url || `uploaded://${Date.now()}-${file_name || 'file'}`;

  const [result] = await pool.query(
    `
    INSERT INTO case_attachments (case_id, uploaded_by, attachment_type, file_name, file_url, file_size, mime_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [caseId, req.user.id, attachment_type, file_name, file_url, file_size, mime_type],
  );

  const [rows] = await pool.query('SELECT * FROM case_attachments WHERE id = ?', [result.insertId]);
  res.status(201).json(rows[0]);
});

// DELETE /api/cases/:id/attachments/:attachId
router.delete('/:id/attachments/:attachId', authRequired, async (req, res) => {
  const caseId = Number(req.params.id);
  const attachId = Number(req.params.attachId);
  if (!caseId || !attachId) return res.status(400).json({ message: 'Invalid id' });

  const access = await canAccessCase(req.user, caseId);
  if (!access.ok) return res.status(access.status).json({ message: access.message });

  // Only uploader, case lawyer, or admin can delete
  const [ownerRows] = await pool.query(
    `
    SELECT a.uploaded_by, con.lawyer_id
    FROM case_attachments a
    JOIN cases cs ON cs.id = a.case_id
    JOIN consultations con ON con.id = cs.consultation_id
    WHERE a.id = ? AND a.case_id = ?
    LIMIT 1
    `,
    [attachId, caseId],
  );

  if (!ownerRows.length) return res.status(404).json({ message: 'Attachment not found' });

  const { uploaded_by, lawyer_id } = ownerRows[0];
  const canDelete =
    req.user.role === 'ADMIN' ||
    Number(uploaded_by) === Number(req.user.id) ||
    Number(lawyer_id) === Number(req.user.id);

  if (!canDelete) return res.status(403).json({ message: 'Forbidden' });

  await pool.query('DELETE FROM case_attachments WHERE id = ? AND case_id = ?', [attachId, caseId]);
  res.status(204).send();
});

export default router;

