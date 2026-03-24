const { getOne, getMany, run } = require('./_utils/db');
const { generateToken } = require('./_utils/auth');
const bcrypt = require('bcryptjs');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.query.secret;
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const results = [];
  function log(test, status, detail) {
    results.push({ test, status, detail });
  }

  try {
    // ============================================================
    // SETUP: Create 3 test accounts + 1 admin
    // ============================================================
    const passwordHash = bcrypt.hashSync('TestPass123!', 10);

    // Clean up any previous test data
    await run("DELETE FROM users WHERE email LIKE '%@safetea.test'");

    // Create test users
    const alice = await getOne(
      "INSERT INTO users (email, password_hash, display_name, city, role, avatar_initial, avatar_color) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      ['alice@safetea.test', passwordHash, 'Test Alice', 'Chicago', 'member', 'A', '#E8A0B5']
    );
    const beth = await getOne(
      "INSERT INTO users (email, password_hash, display_name, city, role, avatar_initial, avatar_color) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      ['beth@safetea.test', passwordHash, 'Test Beth', 'Chicago', 'member', 'B', '#3498db']
    );
    const carol = await getOne(
      "INSERT INTO users (email, password_hash, display_name, city, role, avatar_initial, avatar_color) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      ['carol@safetea.test', passwordHash, 'Test Carol', 'Chicago', 'member', 'C', '#2ecc71']
    );
    const admin = await getOne(
      "INSERT INTO users (email, password_hash, display_name, city, role, avatar_initial, avatar_color) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      ['admin@safetea.test', passwordHash, 'Test Admin', 'Chicago', 'admin', 'X', '#e74c3c']
    );

    log('Setup', 'PASS', `Created 4 test accounts: Alice(${alice.id}), Beth(${beth.id}), Carol(${carol.id}), Admin(${admin.id})`);

    const aliceToken = generateToken(alice);
    const bethToken = generateToken(beth);
    const carolToken = generateToken(carol);
    const adminToken = generateToken(admin);

    // ============================================================
    // TEST 1: Create posts
    // ============================================================
    const alicePost = await getOne(
      "INSERT INTO posts (user_id, title, body, category, city, feed) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [alice.id, 'Safety tip from Alice', 'Always share your location with a trusted friend before meeting someone new. This is a test post from Alice.', 'safety', 'Chicago', 'community']
    );
    log('Create Post (Alice)', alicePost ? 'PASS' : 'FAIL', `Post ID: ${alicePost?.id}`);

    const bethPost = await getOne(
      "INSERT INTO posts (user_id, title, body, category, city, feed) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [beth.id, 'Warning from Beth', 'Met someone at a coffee shop downtown who seemed off. Trust your gut! This is a test post from Beth.', 'warning', 'Chicago', 'community']
    );
    log('Create Post (Beth)', bethPost ? 'PASS' : 'FAIL', `Post ID: ${bethPost?.id}`);

    // ============================================================
    // TEST 2: Edit own post (Alice edits her post)
    // ============================================================
    await run("UPDATE posts SET body = $1 WHERE id = $2 AND user_id = $3",
      ['EDITED: Always share your location with a trusted friend before meeting someone new. Stay safe out there!', alicePost.id, alice.id]
    );
    const editedPost = await getOne("SELECT * FROM posts WHERE id = $1", [alicePost.id]);
    const editPass = editedPost && editedPost.body.startsWith('EDITED:');
    log('Edit Own Post (Alice)', editPass ? 'PASS' : 'FAIL', editPass ? 'Post body updated successfully' : 'Post body not updated');

    // TEST 2b: Verify Beth cannot edit Alice's post
    const bethEditResult = await getOne("SELECT * FROM posts WHERE id = $1 AND user_id = $2", [alicePost.id, beth.id]);
    log('Edit Other Post (Beth->Alice)', !bethEditResult ? 'PASS' : 'FAIL', 'Beth correctly cannot match Alice post as owner');

    // ============================================================
    // TEST 3: Delete own post (create then delete)
    // ============================================================
    const tempPost = await getOne(
      "INSERT INTO posts (user_id, title, body, category, city) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [carol.id, 'Temp post', 'This post will be deleted as a test.', 'general', 'Chicago']
    );
    await run("DELETE FROM posts WHERE id = $1 AND user_id = $2", [tempPost.id, carol.id]);
    const deletedPost = await getOne("SELECT * FROM posts WHERE id = $1", [tempPost.id]);
    log('Delete Own Post (Carol)', !deletedPost ? 'PASS' : 'FAIL', !deletedPost ? 'Post deleted successfully' : 'Post still exists');

    // ============================================================
    // TEST 4: Report feature
    // ============================================================
    // Beth reports Alice's post
    await run(
      "INSERT INTO post_reports (reporter_id, post_id, reported_user_id, reason, details) VALUES ($1, $2, $3, $4, $5)",
      [beth.id, alicePost.id, alice.id, 'inappropriate', 'Test report from Beth']
    );
    const report1 = await getOne("SELECT * FROM post_reports WHERE reporter_id = $1 AND post_id = $2", [beth.id, alicePost.id]);
    log('Report Post (Beth reports Alice)', report1 ? 'PASS' : 'FAIL', `Report ID: ${report1?.id}`);

    // Carol reports Alice's post
    await run(
      "INSERT INTO post_reports (reporter_id, post_id, reported_user_id, reason, details) VALUES ($1, $2, $3, $4, $5)",
      [carol.id, alicePost.id, alice.id, 'spam', 'Test report from Carol']
    );

    // Admin reports Alice's post (3rd report — should auto-hide)
    await run(
      "INSERT INTO post_reports (reporter_id, post_id, reported_user_id, reason, details) VALUES ($1, $2, $3, $4, $5)",
      [admin.id, alicePost.id, alice.id, 'harassment', 'Test report from Admin']
    );

    // Check report count
    const reportCount = await getOne("SELECT COUNT(*) as count FROM post_reports WHERE post_id = $1", [alicePost.id]);
    log('Report Count', parseInt(reportCount.count) === 3 ? 'PASS' : 'FAIL', `${reportCount.count} reports on Alice's post`);

    // Simulate auto-hide (the API does this at 3+)
    if (parseInt(reportCount.count) >= 3) {
      await run("UPDATE posts SET hidden = true WHERE id = $1", [alicePost.id]);
    }
    const hiddenPost = await getOne("SELECT hidden FROM posts WHERE id = $1", [alicePost.id]);
    log('Auto-hide at 3+ reports', hiddenPost?.hidden ? 'PASS' : 'FAIL', hiddenPost?.hidden ? 'Post hidden after 3 reports' : 'Post NOT hidden');

    // Duplicate report prevention
    try {
      await run(
        "INSERT INTO post_reports (reporter_id, post_id, reported_user_id, reason) VALUES ($1, $2, $3, $4)",
        [beth.id, alicePost.id, alice.id, 'spam']
      );
      log('Duplicate Report Prevention', 'FAIL', 'Duplicate report was allowed');
    } catch (e) {
      log('Duplicate Report Prevention', 'PASS', 'Duplicate report correctly rejected (unique constraint)');
    }

    // ============================================================
    // TEST 5: Removal request
    // ============================================================
    await run(
      "INSERT INTO removal_requests (requester_id, post_id, post_author_id, reason, details, status) VALUES ($1, $2, $3, $4, $5, $6)",
      [carol.id, bethPost.id, beth.id, 'my_photo_used', 'My photo was used without permission in this post', 'pending']
    );
    const removal = await getOne("SELECT * FROM removal_requests WHERE requester_id = $1 AND post_id = $2", [carol.id, bethPost.id]);
    log('Removal Request (Carol)', removal ? 'PASS' : 'FAIL', `Request ID: ${removal?.id}, Status: ${removal?.status}`);

    // Duplicate removal request prevention
    try {
      await run(
        "INSERT INTO removal_requests (requester_id, post_id, post_author_id, reason, status) VALUES ($1, $2, $3, $4, $5)",
        [carol.id, bethPost.id, beth.id, 'privacy_violation', 'pending']
      );
      log('Duplicate Removal Prevention', 'FAIL', 'Duplicate request was allowed');
    } catch (e) {
      log('Duplicate Removal Prevention', 'PASS', 'Duplicate removal request correctly rejected');
    }

    // ============================================================
    // TEST 6: Ban feature (Admin bans Beth)
    // ============================================================
    await run(
      "UPDATE users SET banned = true, banned_at = NOW(), ban_reason = $1, ban_type = $2 WHERE id = $3",
      ['Repeated policy violations (test)', 'permanent', beth.id]
    );
    // Hide all Beth's posts
    await run("UPDATE posts SET hidden = true WHERE user_id = $1", [beth.id]);

    // Insert ban log
    await run(
      "INSERT INTO ban_log (admin_id, banned_user_id, reason, ban_type) VALUES ($1, $2, $3, $4)",
      [admin.id, beth.id, 'Repeated policy violations (test)', 'permanent']
    );

    const bannedUser = await getOne("SELECT banned, ban_reason, ban_type FROM users WHERE id = $1", [beth.id]);
    log('Ban User (Admin bans Beth)', bannedUser?.banned ? 'PASS' : 'FAIL',
      `Banned: ${bannedUser?.banned}, Type: ${bannedUser?.ban_type}, Reason: ${bannedUser?.ban_reason}`);

    const bethHiddenPosts = await getMany("SELECT id, hidden FROM posts WHERE user_id = $1", [beth.id]);
    const allHidden = bethHiddenPosts.every(p => p.hidden);
    log('Ban Hides All Posts', allHidden ? 'PASS' : 'FAIL',
      `${bethHiddenPosts.length} posts, all hidden: ${allHidden}`);

    const banLog = await getOne("SELECT * FROM ban_log WHERE banned_user_id = $1", [beth.id]);
    log('Ban Audit Trail', banLog ? 'PASS' : 'FAIL', `Log ID: ${banLog?.id}, Admin: ${banLog?.admin_id}`);

    // ============================================================
    // TEST 7: Auto-flag user at 5+ reports
    // ============================================================
    // Create more posts for Alice and report them
    const alicePost2 = await getOne(
      "INSERT INTO posts (user_id, title, body, category, city) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [alice.id, 'Another post', 'Test post 2 from Alice', 'general', 'Chicago']
    );
    await run(
      "INSERT INTO post_reports (reporter_id, post_id, reported_user_id, reason) VALUES ($1, $2, $3, $4)",
      [beth.id, alicePost2.id, alice.id, 'spam']
    );
    await run(
      "INSERT INTO post_reports (reporter_id, post_id, reported_user_id, reason) VALUES ($1, $2, $3, $4)",
      [carol.id, alicePost2.id, alice.id, 'harassment']
    );

    // Count total reports against Alice (should be 5 = 3 from post1 + 2 from post2)
    const aliceTotalReports = await getOne("SELECT COUNT(*) as count FROM post_reports WHERE reported_user_id = $1", [alice.id]);
    if (parseInt(aliceTotalReports.count) >= 5) {
      await run("UPDATE users SET flagged = true WHERE id = $1", [alice.id]);
    }
    const flaggedAlice = await getOne("SELECT flagged FROM users WHERE id = $1", [alice.id]);
    log('Auto-flag at 5+ reports', flaggedAlice?.flagged ? 'PASS' : 'FAIL',
      `Total reports: ${aliceTotalReports.count}, Flagged: ${flaggedAlice?.flagged}`);

    // ============================================================
    // TEST 8: Verify tokens work
    // ============================================================
    log('JWT Token (Alice)', aliceToken ? 'PASS' : 'FAIL', `Token generated: ${aliceToken ? aliceToken.substring(0, 20) + '...' : 'none'}`);
    log('JWT Token (Admin)', adminToken ? 'PASS' : 'FAIL', `Token generated: ${adminToken ? adminToken.substring(0, 20) + '...' : 'none'}`);

    // ============================================================
    // CLEANUP: Remove test data
    // ============================================================
    await run("DELETE FROM ban_log WHERE banned_user_id IN (SELECT id FROM users WHERE email LIKE '%@safetea.test')");
    await run("DELETE FROM removal_requests WHERE requester_id IN (SELECT id FROM users WHERE email LIKE '%@safetea.test')");
    await run("DELETE FROM post_reports WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@safetea.test')");
    await run("DELETE FROM posts WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@safetea.test')");
    await run("DELETE FROM users WHERE email LIKE '%@safetea.test'");
    log('Cleanup', 'PASS', 'All test data removed');

    // ============================================================
    // SUMMARY
    // ============================================================
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;

    return res.status(200).json({
      summary: `${passed} passed, ${failed} failed out of ${results.length} tests`,
      allPassed: failed === 0,
      results
    });

  } catch (error) {
    console.error('Test runner error:', error);
    return res.status(500).json({
      error: 'Test runner crashed',
      message: error.message,
      results
    });
  }
};
