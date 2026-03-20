const db = require('./database');

console.log('Running SafeTea database migrations...');

// Users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
              password_hash TEXT NOT NULL,
                  display_name TEXT NOT NULL,
                      role TEXT DEFAULT 'member' CHECK(role IN ('member', 'moderator', 'admin')),
                          city TEXT,
                              state TEXT,
                                  is_verified INTEGER DEFAULT 0,
                                      is_anonymous INTEGER DEFAULT 1,
                                          avatar_initial TEXT,
                                              avatar_color TEXT,
                                                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                          last_login DATETIME
                                                            );
                                                            `);

                                                            // Posts table (community feed)
                                                            db.exec(`
                                                              CREATE TABLE IF NOT EXISTS posts (
                                                                  id TEXT PRIMARY KEY,
                                                                      user_id TEXT NOT NULL,
                                                                          city TEXT NOT NULL,
                                                                              content TEXT NOT NULL,
                                                                                  category TEXT DEFAULT 'general' CHECK(category IN ('general', 'warning', 'alert', 'question', 'positive')),
                                                                                      is_anonymous INTEGER DEFAULT 1,
                                                                                          reply_count INTEGER DEFAULT 0,
                                                                                              is_verified INTEGER DEFAULT 0,
                                                                                                  is_flagged INTEGER DEFAULT 0,
                                                                                                      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                                                                          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                                                                              FOREIGN KEY (user_id) REFERENCES users(id)
                                                                                                                );
                                                                                                                `);
                                                                                                                
                                                                                                                // Replies table
                                                                                                                db.exec(`
                                                                                                                  CREATE TABLE IF NOT EXISTS replies (
                                                                                                                      id TEXT PRIMARY KEY,
                                                                                                                          post_id TEXT NOT NULL,
                                                                                                                              user_id TEXT NOT NULL,
                                                                                                                                  content TEXT NOT NULL,
                                                                                                                                      is_anonymous INTEGER DEFAULT 1,
                                                                                                                                          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                                                                                                              FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
                                                                                                                                                  FOREIGN KEY (user_id) REFERENCES users(id)
                                                                                                                                                    );
                                                                                                                                                    `);
                                                                                                                                                    
                                                                                                                                                    // Alerts table
                                                                                                                                                    db.exec(`
                                                                                                                                                      CREATE TABLE IF NOT EXISTS alerts (
                                                                                                                                                          id TEXT PRIMARY KEY,
                                                                                                                                                              city TEXT NOT NULL,
                                                                                                                                                                  type TEXT NOT NULL CHECK(type IN ('safety', 'scam', 'stalking', 'general')),
                                                                                                                                                                      title TEXT NOT NULL,
                                                                                                                                                                          description TEXT,
                                                                                                                                                                              location TEXT,
                                                                                                                                                                                  severity TEXT DEFAULT 'medium' CHECK(severity IN ('low', 'medium', 'high', 'critical')),
                                                                                                                                                                                      report_count INTEGER DEFAULT 1,
                                                                                                                                                                                          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                                                                                                                                                                                            );
                                                                                                                                                                                            `);
                                                                                                                                                                                            
                                                                                                                                                                                            // City votes table
                                                                                                                                                                                            db.exec(`
                                                                                                                                                                                              CREATE TABLE IF NOT EXISTS city_votes (
                                                                                                                                                                                                  id TEXT PRIMARY KEY,
                                                                                                                                                                                                      city_name TEXT NOT NULL,
                                                                                                                                                                                                          state TEXT,
                                                                                                                                                                                                              vote_count INTEGER DEFAULT 0,
                                                                                                                                                                                                                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                                                                                                                                                                                                                    );
                                                                                                                                                                                                                    `);
                                                                                                                                                                                                                    
                                                                                                                                                                                                                    // User votes tracking (prevent duplicate votes)
                                                                                                                                                                                                                    db.exec(`
                                                                                                                                                                                                                      CREATE TABLE IF NOT EXISTS user_city_votes (
                                                                                                                                                                                                                          user_id TEXT NOT NULL,
                                                                                                                                                                                                                              city_vote_id TEXT NOT NULL,
                                                                                                                                                                                                                                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                                                                                                                                                                                                      PRIMARY KEY (user_id, city_vote_id),
                                                                                                                                                                                                                                          FOREIGN KEY (user_id) REFERENCES users(id),
                                                                                                                                                                                                                                              FOREIGN KEY (city_vote_id) REFERENCES city_votes(id)
                                                                                                                                                                                                                                                );
                                                                                                                                                                                                                                                `);
                                                                                                                                                                                                                                                
                                                                                                                                                                                                                                                // Sessions table for token blacklisting
                                                                                                                                                                                                                                                db.exec(`
                                                                                                                                                                                                                                                  CREATE TABLE IF NOT EXISTS sessions (
                                                                                                                                                                                                                                                      id TEXT PRIMARY KEY,
                                                                                                                                                                                                                                                          user_id TEXT NOT NULL,
                                                                                                                                                                                                                                                              token_hash TEXT NOT NULL,
                                                                                                                                                                                                                                                                  expires_at DATETIME NOT NULL,
                                                                                                                                                                                                                                                                      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                                                                                                                                                                                                                                          FOREIGN KEY (user_id) REFERENCES users(id)
                                                                                                                                                                                                                                                                            );
                                                                                                                                                                                                                                                                            `);
                                                                                                                                                                                                                                                                            
                                                                                                                                                                                                                                                                            // Create indexes
                                                                                                                                                                                                                                                                            db.exec(`
                                                                                                                                                                                                                                                                              CREATE INDEX IF NOT EXISTS idx_posts_city ON posts(city);
                                                                                                                                                                                                                                                                                CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
                                                                                                                                                                                                                                                                                  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
                                                                                                                                                                                                                                                                                    CREATE INDEX IF NOT EXISTS idx_alerts_city ON alerts(city);
                                                                                                                                                                                                                                                                                      CREATE INDEX IF NOT EXISTS idx_replies_post ON replies(post_id);
                                                                                                                                                                                                                                                                                        CREATE INDEX IF NOT EXISTS idx_city_votes_name ON city_votes(city_name);
                                                                                                                                                                                                                                                                                          CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
                                                                                                                                                                                                                                                                                          `);
                                                                                                                                                                                                                                                                                          
                                                                                                                                                                                                                                                                                          console.log('Migrations completed successfully!');
