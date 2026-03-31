const { getOne, getMany, run } = require('../_utils/db');
const { authenticate, cors, parseBody } = require('../_utils/auth');

module.exports = async function handler(req, res) {
    cors(res, req);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Admin-only
    const user = await authenticate(req);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    // GET — list all feedback
    if (req.method === 'GET') {
        const status = req.query?.status || null;
        const page = parseInt(req.query?.page) || 1;
        const limit = Math.min(parseInt(req.query?.limit) || 20, 100);
        const offset = (page - 1) * limit;

        let where = '';
        let params = [];
        let paramIdx = 1;

        if (status) {
            where = `WHERE f.status = $${paramIdx}`;
            params.push(status);
            paramIdx++;
        }

        const feedback = await getMany(
            `SELECT f.id, f.user_id, f.message, f.status, f.admin_notes, f.created_at,
                    u.email, u.display_name, u.custom_display_name
             FROM user_feedback f
             LEFT JOIN users u ON f.user_id = u.id
             ${where}
             ORDER BY f.created_at DESC
             LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
            [...params, limit, offset]
        );

        // Get total count
        const countResult = await getOne(
            `SELECT COUNT(*) as total FROM user_feedback f ${where}`,
            status ? [status] : []
        );

        return res.status(200).json({
            success: true,
            feedback,
            pagination: {
                page,
                limit,
                total: parseInt(countResult.total),
                pages: Math.ceil(parseInt(countResult.total) / limit)
            }
        });
    }

    // PUT — update feedback status/notes
    if (req.method === 'PUT') {
        const body = await parseBody(req);
        const { id, status, admin_notes } = body;

        if (!id) {
            return res.status(400).json({ error: 'Feedback ID is required' });
        }

        const validStatuses = ['new', 'reviewed', 'resolved'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be: ' + validStatuses.join(', ') });
        }

        // Build update query dynamically
        let updates = [];
        let params = [];
        let paramIdx = 1;

        if (status) {
            updates.push(`status = $${paramIdx}`);
            params.push(status);
            paramIdx++;
        }
        if (admin_notes !== undefined) {
            updates.push(`admin_notes = $${paramIdx}`);
            params.push(admin_notes);
            paramIdx++;
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Nothing to update' });
        }

        params.push(id);
        await run(
            `UPDATE user_feedback SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
            params
        );

        console.log(`Admin ${user.id} updated feedback #${id}: status=${status || 'unchanged'}`);

        return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
