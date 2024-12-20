// *****************************************************
// <!-- Section 1 : Import Dependencies -->
// *****************************************************

const express = require('express'); // To build an application server or API
const app = express();
const { Configuration, OpenAIApi } = require('openai');
const handlebars = require('express-handlebars');
const Handlebars = require('handlebars');
const path = require('path');
const pgp = require('pg-promise')(); // To connect to the Postgres DB from the node server
const bodyParser = require('body-parser');
const session = require('express-session'); // To set the session object. To store or access session data, use the `req.session`, which is (generally) serialized as JSON by the store.
const bcrypt = require('bcryptjs'); //  To hash passwords
const axios = require('axios'); // To make HTTP requests from our server. 
const crypto = require('crypto');
const nodemailer = require('nodemailer');



// *****************************************************
// <!-- Section 2 : Connect to DB -->
// *****************************************************

// create `ExpressHandlebars` instance and configure the layouts and partials dir.

const hbs = handlebars.create({
  extname: 'hbs',
  layoutsDir: __dirname + '/views/layouts',
  partialsDir: __dirname + '/views/partials',
  helpers: {
    not_equal: function(a, b) {
      return a !== b;
    },
    equal: function(a, b) {
      return a === b;
    },
    or: function(a, b) {
      return a || b;
    },
    if_eq: function(a, b, opts) {
      if (a === b) {
        return opts.fn(this);
      }
      return opts.inverse(this);
    },
    eq: function(a, b) {
      return a === b;
    },
    formatDate: function(date) {
      if (!date) return '';
      const d = new Date(date);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    },
    safeLatex: function(text) {
      if (!text) return '';
      return new Handlebars.SafeString(
        text.replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;')
      );
    },
    truncateLatex: function(text, length) {
      if (!text) return '';
      const stripped = text.replace(/\\[a-z]*\{([^}]*)\}/g, '$1')  // Remove LaTeX commands
                         .replace(/\\\[|\\\]|\$|\\/g, '')          // Remove LaTeX delimiters
                         .trim();
      return stripped.length > length ? 
             stripped.substring(0, length) + '...' : 
             stripped;
    },
    firstLetter: function(username) {
      return username ? username.charAt(0).toUpperCase() : '';
  }
  }
});

// email transporter
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  },

});


// sql config
const dbConfig = {
  host: 'dpg-csvpgvilqhvc73bgrnu0-a', //dpg-csvpgvilqhvc73bgrnu0-a
  port: 5432, // the database port
  database: process.env.POSTGRES_DB, // the database name
  user: process.env.POSTGRES_USER, // the user account to connect with
  password: process.env.POSTGRES_PASSWORD, // the password of the user account
};

const db = pgp(dbConfig);

app.use(express.static(path.join(__dirname, 'public')));

// test database
db.connect()
  .then(obj => {
    console.log('Database connection successful'); 
    obj.done(); // success, release the connection;
  })
  .catch(error => {
    console.error('Database connection failed');

  });
// *****************************************************
// <!-- Section 3 : App Settings -->
// *****************************************************

// Register `hbs` as our view engine using its bound `engine()` function.
app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.json()); // specify the usage of JSON for parsing request body.
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
// initialize session variables

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    saveUninitialized: false,
    resave: false,
  })
);

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

const configuration = new Configuration({
  apiKey: process.env.API_KEY, // secure this key
});
const openai = new OpenAIApi(configuration);


// *****************************************************
// <!-- Section 4 : API Routes -->
// *****************************************************


app.get('/welcome', (req, res) => {
  res.status(200).json({status: 'success', message: 'Welcome!'});
});
app.get('/forgot-password', (req, res) => {
  console.log('Forgot password route hit');
  try {
    res.render('pages/forgotPass', { 
      hideNav: true,
      message: req.query.message,
      error: req.query.error,
      layout: 'main'  // explicitly specify the layout
    });
  } catch (error) {
    console.error('Error rendering forgot password page:', error);
    res.status(500).json({ error: error.message });
  }
});
app.post('/request-password-reset', async (req, res) => {
  const { email } = req.body;
  console.log('Attempting password reset for:', email);
  
  try {
    // First, ensure the table exists
    await db.none(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token VARCHAR(64) PRIMARY KEY,
        username VARCHAR(50) REFERENCES users(username),
        expiration_timestamp TIMESTAMP WITH TIME ZONE,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const user = await db.oneOrNone('SELECT username FROM users WHERE email = $1', [email]);
    
    if (!user) {
      return res.status(404).json({ error: 'No account found with this email' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expirationTime = new Date(Date.now() + 15 * 60 * 1000);

    await db.none(
      'INSERT INTO password_reset_tokens (token, username, expiration_timestamp) VALUES ($1, $2, $3)',
      [token, user.username, expirationTime]
    );

    console.log('Sending email to:', email);
    
    try {
      await transporter.sendMail({
        from: `"UnderLeaf Team" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Password Reset Request',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <img src="cid:underleafLogo" alt="UnderLeaf Logo" style="width: 200px; margin-bottom: 20px;"/>
            <h2 style="color: #555;">Hi from UnderLeaf Team!</h2>
            <p style="color: #666; line-height: 1.5;">There was a password reset associated with your email. If you did not request this, you can safely ignore this email.</p>
            <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #accaa1; margin: 20px 0;">
              <p style="margin: 0; color: #555;">Your reset token is: <strong>${token}</strong></p>
              <p style="margin: 5px 0 0; color: #777; font-size: 0.9em;">This code expires in 15 minutes</p>
            </div>
            <p style="color: #666;">Thanks!<br>The UnderLeaf Team</p>
          </div>
        `,
        attachments: [{
          filename: 'UnderLEaf.png',
          path: 'public/images/UnderLEaf.png',
          cid: 'underleafLogo'
        }]
      });
      res.json({ message: 'Reset code sent successfully' });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      res.status(500).json({ error: 'Failed to send email' });
    }
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Failed to process reset request' });
  }
});
app.post('/verify-reset-token', async (req, res) => {
  const { token, email } = req.body;

  try {
    const tokenRecord = await db.oneOrNone(
      `SELECT t.*, u.email 
       FROM password_reset_tokens t
       JOIN users u ON t.username = u.username
       WHERE t.token = $1 
       AND t.used = FALSE 
       AND t.expiration_timestamp > NOW()`,
      [token]
    );

    if (!tokenRecord) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    if (tokenRecord.email !== email) {
      return res.status(400).json({ error: 'Email does not match token' });
    }

    res.json({ valid: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify token' });
  }
});

// Reset password
app.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    // Get user info and verify token in one query
    const tokenRecord = await db.oneOrNone(`
      SELECT t.username 
      FROM password_reset_tokens t
      WHERE t.token = $1 
      AND t.used = FALSE 
      AND t.expiration_timestamp > NOW()`,
      [token]
    );

    if (!tokenRecord) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and mark token as used in a transaction
    await db.tx(async t => {
      await t.none('UPDATE users SET password = $1 WHERE username = $2', 
        [hashedPassword, tokenRecord.username]);
      await t.none('UPDATE password_reset_tokens SET used = TRUE WHERE token = $1', 
        [token]);
    });

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});
// Add these before any middleware or routes
app.use(async (req, res, next) => {
  if (req.session.user) {
      try {
          // Check if user needs credit refresh
          const user = await db.oneOrNone(`
              SELECT last_credit_reset 
              FROM users 
              WHERE username = $1 
              AND NOT is_premium 
              AND last_credit_reset < NOW() - INTERVAL '7 days'`,
              [req.session.user.username]
          );
          
          if (user) {
              // Reset credits
              await db.none(`
                  UPDATE users 
                  SET ai_credits = 10, 
                      last_credit_reset = NOW() 
                  WHERE username = $1`,
                  [req.session.user.username]
              );
              
              // Update session
              req.session.user.ai_credits = 10;
              await req.session.save();
          }
      } catch (error) {
          console.error('Error checking credit refresh:', error);
      }
  }
  next();
});

const auth = (req, res, next) => {
    console.log('Auth middleware:', {
        path: req.path,
        isAuthenticated: !!req.session.user,
        publicPath: ['/login', '/register', '/logout', '/auth'].includes(req.path)
    });
    
    const publicPaths = ['/login', '/register', '/logout', '/request-password-reset', '/verify-reset-token', '/reset-password', '/api/user/notes'];
    if (!req.session.user && !publicPaths.includes(req.path)) {
        console.log('Redirecting to login - unauthorized access');
        return res.redirect('/login');
    }
    next();
};

// Authentication middleware
app.use(auth);

app.get('/', (req, res) => {
    if (req.session.user) {
        return res.redirect('/editor');
    }
    res.redirect('/login');
});
  
app.get('/login', (req, res) => {
  if (req.session.user) {
      return res.redirect('/editor');
  }
  res.render('pages/auth', { 
      isRegister: false,
      loginError: req.query.error,
      hideNav: true  // Hide the navbar on the login page
  });
});


app.get('/register', (req, res) => {
  if (req.session.user) {
      return res.redirect('/editor');
  }
  res.render('pages/auth', { 
      isRegister: true,
      registerError: req.query.error,
      hideNav: true  // Hide the navbar on the register page
  });
});


app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await db.oneOrNone('SELECT * FROM users WHERE username = $1', [username]);
        
        if (!user) {
            return res.status(401).render('pages/auth', { 
                loginError: 'Invalid username',
                isRegister: false,
                hideNav: true  // Hide the navbar on the login page
            });
        }
        
        const passwordValid = await bcrypt.compare(password, user.password);
        if (!passwordValid) {
            return res.status(401).render('pages/auth', { 
                message: 'Invalid password',
                isRegister: false,
                hideNav: true  // Hide the navbar on the login page
            });
        }
        
        req.session.user = user;
        req.session.save();
        res.status(200).redirect('/editor');
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).render('pages/auth', { 
            loginError: 'An error occurred during login',
            isRegister: false,
            hideNav: true  // Hide the navbar on the login page
        });
    }
});

app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.none('INSERT INTO users(username, email, password) VALUES($1, $2, $3)', [
            username,
            email,
            hashedPassword,
        ]);
        res.status(201).redirect('/login?message=Registration successful! Please login.');
    } catch (error) {
        console.error('Registration error:', error);
        res.status(409).render('pages/auth', { 
            registerError: 'Username/email already exists',
            isRegister: true,
            hideNav: true  // Hide the navbar on the login page
        });
    }
});


app.get('/editor', async (req, res) => {
    const user = req.session.user;
    res.render('pages/editor', { user });
});

app.get('/edit-note/:id', async (req, res) => {
  const noteId = req.params.id;
  const user = req.session.user;
  const viewOnly = req.query.viewOnly === 'true'; // Check if this is a view-only request

  try {
      const note = await db.one(`
          SELECT n.*, 
                 CASE 
                   WHEN n.username = $1 THEN true
                   ELSE np.can_edit
                 END as can_edit
          FROM notes n
          LEFT JOIN note_permissions np ON n.id = np.note_id AND np.username = $1
          WHERE n.id = $2 
          AND (n.username = $1 OR np.username = $1 AND np.can_read = true)`,
          [user.username, noteId]
      );

      // Override can_edit if this is a view-only request
      if (viewOnly) {
          note.can_edit = false;
      }

      note.content = note.content || '';
      note.title = note.title || '';
  
      res.render('pages/editor', { 
        user, 
        note,
        helpers: {
          raw: function(content) { return content; }
        }
      });
    } catch (error) {
      console.error('Error fetching note:', error);
      res.status(500).send('Error fetching note');
    }
});

app.get('/notes', async (req, res) => {
  const user = req.session.user;
  try {
      
      const userNotes = await db.any(`
          SELECT DISTINCT n.id, n.title, n.username, 
                 true as can_edit,
                 'Owner' as access_type
          FROM notes n
          WHERE n.username = $1
          ORDER BY n.title`, 
          [user.username]
      );

      
      const friendsNotes = await db.any(`
          SELECT DISTINCT n.id, n.title, n.username, 
                 np.can_edit, 
                 'Shared' as access_type,
                 np.can_read
          FROM notes n
          JOIN note_permissions np ON n.id = np.note_id
          WHERE np.username = $1 AND np.can_read = true
          ORDER BY n.title`, 
          [user.username]
      );

      
      const friendCount = await db.one(`
          SELECT COUNT(*) as count
          FROM friends
          WHERE (requester = $1 OR addressee = $1)
          AND status = 'accepted'`,
          [user.username]
      );

      const pendingCount = await db.one(`
          SELECT COUNT(*) as count
          FROM friends
          WHERE addressee = $1 AND status = 'pending'`,
          [user.username]
      );

      
      res.render('pages/notes', { 
          user, 
          notes: userNotes,
          friendsNotes: friendsNotes,
          friendCount: friendCount.count,
          pendingCount: pendingCount.count
      });
  } catch (error) {
      console.error('Error fetching notes:', error);
      res.status(500).send('Error fetching notes');
  }
});



//communities endpoints start=====================
app.get('/communities', async (req, res) => {
  try {
    const { is_private, created_by } = req.query;
    const user = req.session.user;

    // Query for user's communities
    let userCommunitiesQuery = `
    SELECT 
      c.*,
      CASE WHEN c.created_by = $1 THEN true ELSE false END as is_admin
    FROM communities c
    INNER JOIN community_memberships cm 
      ON c.community_id = cm.community_id 
    WHERE cm.username = $1`;
    
    // Query for public communities the user hasn't joined
    let publicCommunitiesQuery = `
      SELECT c.*
      FROM communities c
      WHERE c.is_private = false
      AND NOT EXISTS (
        SELECT 1 
        FROM community_memberships cm 
        WHERE cm.community_id = c.community_id 
        AND cm.username = $1
      )`;

    // Execute both queries
    const [userCommunities, publicCommunities] = await Promise.all([
      db.any(userCommunitiesQuery, [user.username]),
      db.any(publicCommunitiesQuery, [user.username])
    ]);

    // Render the template with both sets of data
    res.render('pages/communities', {
      data: userCommunities,
      publicCommunities: publicCommunities,
      user: user
    });
  } catch (error) {
    console.error('Error fetching communities:', error);
    res.render('pages/communities', {
      data: [],
      publicCommunities: [],
      user: req.session.user,
      message: 'Server error while fetching communities'
    });
  }
});
// Join community route
app.post('/join-community/:id', async (req, res) => {
  try {
    const communityId = req.params.id;
    const username = req.session.user.username;

    await db.none(
      'INSERT INTO community_memberships (community_id, username) VALUES ($1, $2)',
      [communityId, username]
    );

    res.status(201).json({ success: true, message: 'Successfully joined community' });
  } catch (error) {
    console.error('Error joining community:', error);
    res.status(500).json({ success: false, error: 'Failed to join community' });
  }
});

// Leave community route
app.post('/leave-community/:id', async (req, res) => {
  try {
    const communityId = req.params.id;
    const username = req.session.user.username;

    await db.none(
      'DELETE FROM community_memberships WHERE community_id = $1 AND username = $2',
      [communityId, username]
    );

    res.sendStatus(200);
  } catch (error) {
    console.error('Error leaving community:', error);
    res.sendStatus(500);
  }
});


// create community
app.post('/create-community', async (req, res) => {
  if (!req.session.user) {
      return res.status(401).json({ success: false, error: "Unauthorized: Please log in to create a community." });
  }

  const { name, description, isPrivate } = req.body;
  const createdBy = req.session.user.username;
  
  try {
      // Log the incoming data
      console.log('Creating community with:', { name, description, isPrivate, createdBy });
      
      const accessCode = isPrivate ? crypto.randomBytes(3).toString('hex') : null;
      
      const result = await db.one(
          `INSERT INTO communities (name, description, is_private, access_code, created_by) 
           VALUES ($1, $2, $3, $4, $5) RETURNING community_id`,
          [name, description, isPrivate, accessCode, createdBy]
      );
      // Add creator as a member
      await db.none(
          `INSERT INTO community_memberships (community_id, username) 
           VALUES ($1, $2)`,
          [result.community_id, createdBy]
      );

      res.json({ 
          success: true, 
          message: 'Community created successfully',
          accessCode: accessCode
      });
  } catch (error) {
      console.error('Detailed error creating community:', error);
      res.status(500).json({ 
          success: false, 
          error: 'Failed to create community',
          details: error.message 
      });
  }
});



app.post('/join-private-community', async (req, res) => {
  if (!req.session.user) {
      return res.status(401).json({ success: false, error: "Please log in to join a community." });
  }

  const { accessCode } = req.body;
  const username = req.session.user.username;
  
  try {
      // First, find the community with this access code
      const community = await db.oneOrNone(
          'SELECT * FROM communities WHERE access_code = $1',
          [accessCode]
      );

      if (!community) {
          return res.status(404).json({ 
              success: false, 
              error: 'Invalid access code or community not found' 
          });
      }

      // Check if user is already a member
      const existingMembership = await db.oneOrNone(
          'SELECT * FROM community_memberships WHERE community_id = $1 AND username = $2',
          [community.community_id, username]
      );

      if (existingMembership) {
          return res.status(400).json({ 
              success: false, 
              error: 'You are already a member of this community' 
          });
      }

      // Add user as a member
      await db.none(
          'INSERT INTO community_memberships (community_id, username) VALUES ($1, $2)',
          [community.community_id, username]
      );

      res.json({ 
          success: true, 
          message: 'Successfully joined community',
          communityName: community.name
      });

  } catch (error) {
      console.error('Error joining community:', error);
      res.status(500).json({ 
          success: false, 
          error: 'Failed to join community',
          details: error.message 
      });
  }
});

app.post('/community/:id/leave', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Unauthorized: Please log in to leave a community.");
  }
  try {
    const communityId = req.params.id;
    const username = req.session.user.username;

    await db.none(
      `DELETE FROM community_memberships WHERE community_id = $1 AND username = $2`,
      [communityId, username]
    );

    res.redirect(`/community/${communityId}`);
  } catch (error) {
    console.error('Error leaving community:', error);
    res.redirect(`/community/${communityId}`);
  }
});

// Get a unique community page
app.get('/community/:id', async (req, res) => {
  try {
      const communityId = req.params.id;
      const username = req.session.user.username;
      const user = await db.one('SELECT * FROM users WHERE username = $1', [username]);
      messages =[];

      // Get community info and check if user is admin
      const community = await db.one(`
          SELECT 
              *,
              CASE WHEN created_by = $2 THEN true ELSE false END as "isAdmin"
          FROM communities 
          WHERE community_id = $1`, 
          [communityId, username]
      );

        // Get announcements from the new table
        const announcements = await db.any(`
          SELECT 
              id,
              title,
              content,
              created_by,
              to_char(created_at, 'MM/DD/YYYY HH12:MI AM') as created_at
          FROM community_announcements 
          WHERE community_id = $1
          ORDER BY created_at DESC`, 
          [communityId]
      );

      // Get messages
      if (community.isAdmin) {
        // Get all messages for admin grouped by user
        messages = await db.any(`
            SELECT 
                dm.*,
                u.username
            FROM direct_messages dm
            JOIN users u ON u.username = 
                CASE WHEN dm.from_user = $1 THEN dm.to_user 
                ELSE dm.from_user END
            WHERE dm.community_id = $2
            ORDER BY dm.sent_at DESC`,
            [username, communityId]
        );
    } else {
        // Get messages between user and admin
        messages = await db.any(`
            SELECT * FROM direct_messages
            WHERE community_id = $1
            AND ((from_user = $2 AND to_user = $3) 
            OR (from_user = $3 AND to_user = $2))
            ORDER BY sent_at ASC`,
            [communityId, username, community.created_by]
        );
    }


      // Get notes based on user role
      let notes, studentCopies, personalNotes, teacherNotes, members=[];
      
      if (community.isAdmin) {

          // Admin view: get shared notes and their copies
          [notes, studentCopies, members] = await Promise.all([
              // Get admin's shared notes with copy count
              db.any(`
                SELECT 
                    n.*,
                    cn.shared_at,
                    cn.is_public,
                    (
                        SELECT COUNT(*)
                        FROM notes copies
                        WHERE copies.title LIKE '%''s copy of ' || n.title
                    ) as copy_count
                FROM notes n
                JOIN community_notes cn ON n.id = cn.note_id
                WHERE cn.community_id = $1 
                AND cn.shared_by = $2
                GROUP BY n.id, n.title, n.content, n.username, cn.shared_at, cn.is_public
                ORDER BY cn.shared_at DESC`,
                [communityId, username]
            ),
              // Get student copies
              db.any(`
                SELECT 
                    n.*,
                    u.username as student_name,
                    cn.shared_at,
                    original.title as original_title
                FROM notes n
                JOIN users u ON n.username = u.username
                JOIN community_notes cn ON n.id = cn.note_id
                JOIN notes original ON n.title LIKE u.username || '''s copy of ' || original.title
                WHERE cn.community_id = $1 
                AND n.title LIKE '%''s copy of %'
                AND original.username = $2
                ORDER BY u.username, cn.shared_at DESC`,
                [communityId, username]
            ),
              db.any(`
                SELECT DISTINCT username 
                FROM community_memberships 
                WHERE community_id = $1 
                AND username != $2
                ORDER BY username`,
                [communityId, username]
            )
        ]);
      } else {
          // Student view: get personal copies and teacher notes
          [personalNotes, teacherNotes] = await Promise.all([
              // Get student's copies
              db.any(`
                  SELECT n.*, cn.shared_at
                  FROM notes n
                  JOIN community_notes cn ON n.id = cn.note_id
                  WHERE n.username = $1 
                  AND cn.community_id = $2
                  ORDER BY cn.shared_at DESC`,
                  [username, communityId]
              ),
              // Get available teacher notes
              db.any(`
                SELECT n.*, cn.shared_at, cn.shared_by,
                       EXISTS(
                           SELECT 1 FROM notes copies 
                           WHERE copies.username = $1 
                           AND copies.title = 'Copy of ' || n.title
                       ) as has_copy
                FROM notes n
                JOIN community_notes cn ON n.id = cn.note_id
                WHERE cn.community_id = $2 
                AND cn.shared_by IN (
                    SELECT created_by FROM communities WHERE community_id = $2
                )
                ORDER BY cn.shared_at DESC`,
                [username, communityId]
              )
          ]);
      }

      res.render('pages/uniqueCommunity', {
          community,
          messages,
          notes,
          members,
          studentCopies,
          personalNotes,
          teacherNotes,
          isAdmin: community.isAdmin,
          
          user: req.session.user,
          username: req.session.user.username,
          announcements,
          ai_credits: req.session.user.ai_credits,
          is_premium: req.session.user.is_premium,
          layout: 'main'  // Make sure we're using the main layout with navbar
      });
  } catch (error) {
      console.error('Error:', error);
      res.status(500).send('Server error');
  }
});
// Add endpoint for posting messages
app.post('/community/:id/message', async (req, res) => {
  if (!req.session.user) {
      return res.status(401).json({ error: "Unauthorized" });
  }

  try {
      const { content, toUser } = req.body;
      const communityId = req.params.id;
      const fromUser = req.session.user.username;


      await db.none(
        `INSERT INTO direct_messages (community_id, from_user, to_user, content)
         VALUES ($1, $2, $3, $4)`,
        [communityId, fromUser, toUser, content]
    );

      res.json({ success: true });
  } catch (error) {
      console.error('Error posting message:', error);
      res.status(500).json({ error: "Error posting message" });
  }
});
app.post('/api/community/:id/announcement', async (req, res) => {
  if (!req.session.user) {
      return res.status(401).json({ error: "Unauthorized" });
  }

  try {
      const { title, content } = req.body;
      const communityId = req.params.id;
      const username = req.session.user.username;

      // Verify user is admin
      const community = await db.one('SELECT created_by FROM communities WHERE community_id = $1', [communityId]);
      if (community.created_by !== username) {
          return res.status(403).json({ error: "Not authorized to create announcements" });
      }

      // Insert into community_announcements
      const newAnnouncement = await db.one(`
          INSERT INTO community_announcements 
          (community_id, title, content, created_by) 
          VALUES ($1, $2, $3, $4)
          RETURNING *`,
          [communityId, title, content, username]
      );

      res.json({ success: true });
  } catch (error) {
      console.error('Error creating announcement:', error);
      res.status(500).json({ error: "Server error" });
  }
});

app.get('/api/user/notes', async (req, res) => {
  if (!req.session.user) {
      return res.status(401).json({ error: "Unauthorized" });
  }

  try {
      const notes = await db.any(`
          SELECT id, title, content
          FROM notes 
          WHERE username = $1
          ORDER BY title`,
          [req.session.user.username]
      );
      res.json(notes);
  } catch (error) {
      console.error('Error fetching notes:', error);
      res.status(500).json({ error: "Failed to fetch notes" });
  }
});
// Check if copy exists
app.get('/api/community/:communityId/check-note-copy/:noteId', async (req, res) => {
  try {
      const { communityId, noteId } = req.params;
      const username = req.session.user.username;

      // Get original note info
      const originalNote = await db.one(`
          SELECT title FROM notes WHERE id = $1`,
          [noteId]
      );

      // Check for existing copy
      const copy = await db.oneOrNone(`
          SELECT id FROM notes 
          WHERE username = $1 
          AND title = $2`,
          [username, `${username}'s copy of ${originalNote.title}`]
      );

      res.json({
          hasCopy: !!copy,
          copyId: copy?.id
      });
  } catch (error) {
      console.error('Error checking note copy:', error);
      res.status(500).json({ error: 'Failed to check note copy' });
  }
});

// Create copy and share with admin
app.post('/api/community/:communityId/copy-note/:noteId', async (req, res) => {
  if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
      const { communityId, noteId } = req.params;
      const username = req.session.user.username;

      // Verify the note exists and user has access
      const noteAccess = await db.oneOrNone(`
          SELECT n.* 
          FROM notes n
          JOIN community_notes cn ON cn.note_id = n.id
          WHERE n.id = $1 AND cn.community_id = $2`,
          [noteId, communityId]
      );

      if (!noteAccess) {
          return res.status(404).json({ error: 'Note not found or access denied' });
      }

      // Get original note and community info
      const [originalNote, community] = await Promise.all([
          db.one('SELECT * FROM notes WHERE id = $1', [noteId]),
          db.one('SELECT created_by FROM communities WHERE community_id = $1', [communityId])
      ]);

      // Create copy with new title
      const newTitle = `${username}'s copy of ${originalNote.title}`;
      const newNote = await db.one(`
          INSERT INTO notes (title, content, username, category)
          VALUES ($1, $2, $3, $4)
          RETURNING id`,
          [newTitle, originalNote.content, username, originalNote.category || 'General']
      );

      // Share with community and admin
      await db.none(`
          INSERT INTO community_notes (note_id, community_id, shared_by, is_public)
          VALUES ($1, $2, $3, true)`,
          [newNote.id, communityId, username]
      );

      // Share back to admin
      await db.none(`
          INSERT INTO note_permissions (note_id, username, can_read, can_edit)
          VALUES ($1, $2, true, true)`,
          [newNote.id, community.created_by]
      );

      res.json({ 
          success: true, 
          noteId: newNote.id, 
          originalNoteId: noteId,
          communityId: communityId

      });
  } catch (error) {
      console.error('Error copying note:', error);
      res.status(500).json({ 
          error: 'Failed to create note copy',
          details: error.message 
      });
  }
});


// Fetch all community members (for modal view)
app.get('/community/:id/members', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Unauthorized: Please log in to view members.");
  }

  try {
    const communityId = req.params.id;

    const members = await db.any(
      `SELECT u.username, u.profile_picture_url, cm.joined_at, cm.is_admin
       FROM community_memberships cm
       JOIN users u ON cm.username = u.username
       WHERE cm.community_id = $1
       ORDER BY u.username ASC`,
      [communityId]
    );

    res.json(members);
  } catch (error) {
    console.error('Error fetching community members:', error);
    res.status(500).send("Server error while fetching community members.");
  }
})

//communities endpoints End =====================



app.get('/friends', async (req, res) => {
    try {
        const user = req.session.user;

        // Get pending friend requests
        const pendingRequests = await db.any(`
            SELECT id, requester, created_at 
            FROM friends 
            WHERE addressee = $1 AND status = 'pending'
            ORDER BY created_at DESC
        `, [user.username]);

        // Get accepted friends
        const friends = await db.any(`
            SELECT f.id, 
                   CASE 
                       WHEN f.requester = $1 THEN f.addressee 
                       ELSE f.requester 
                   END as friend_username
            FROM friends f
            WHERE (f.requester = $1 OR f.addressee = $1)
            AND f.status = 'accepted'
        `, [user.username]);

        res.render('pages/friends', {
            user,
            friends,
            pendingRequests,
            message: req.query.message
        });
    } catch (error) {
        console.error('Error fetching friends data:', error);
        res.render('pages/friends', {
            user: req.session.user,
            error: 'Error fetching friends data'
        });
    }
});

app.post('/send-friend-request', async (req, res) => {
    try {
        const requester = req.session.user.username;
        const { addressee } = req.body;

        // Check if addressee exists
        const addresseeExists = await db.oneOrNone('SELECT username FROM users WHERE username = $1', [addressee]);
        if (!addresseeExists) {
            return res.redirect('/friends?message=User not found');
        }

        // Check if request already exists
        const existingRequest = await db.oneOrNone(
            'SELECT * FROM friends WHERE (requester = $1 AND addressee = $2) OR (requester = $2 AND addressee = $1)',
            [requester, addressee]
        );

        if (existingRequest) {
            return res.redirect('/friends?message=Friend request already exists');
        }

        // Create friend request
        await db.none(
            'INSERT INTO friends (requester, addressee) VALUES ($1, $2)',
            [requester, addressee]
        );

        res.redirect('/friends?message=Friend request sent');
    } catch (error) {
        console.error('Error sending friend request:', error);
        res.redirect('/friends?message=Error sending friend request');
    }
});

app.post('/accept-friend-request', async (req, res) => {
    try {
        const { requestId } = req.body;
        const user = req.session.user.username;

        // Verify request exists and is addressed to current user
        const request = await db.oneOrNone(
            'SELECT * FROM friends WHERE id = $1 AND addressee = $2 AND status = $3',
            [requestId, user, 'pending']
        );

        if (!request) {
            return res.redirect('/friends?message=Invalid request');
        }

        // Accept request
        await db.none(
            'UPDATE friends SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            ['accepted', requestId]
        );

        res.redirect('/friends?message=Friend request accepted');
    } catch (error) {
        console.error('Error accepting friend request:', error);
        res.redirect('/friends?message=Error accepting friend request');
    }
});

app.post('/reject-friend-request', async (req, res) => {
    try {
        const { requestId } = req.body;
        const user = req.session.user.username;

        await db.none(
            'DELETE FROM friends WHERE id = $1 AND addressee = $2 AND status = $3',
            [requestId, user, 'pending']
        );

        res.redirect('/friends?message=Friend request rejected');
    } catch (error) {
        console.error('Error rejecting friend request:', error);
        res.redirect('/friends?message=Error rejecting friend request');
    }
});

app.post('/remove-friend', async (req, res) => {
    try {
        const { friendId } = req.body;
        const user = req.session.user.username;

        // Verify friendship exists and user is part of it
        const friendship = await db.oneOrNone(
            'SELECT * FROM friends WHERE id = $1 AND (requester = $2 OR addressee = $2) AND status = $3',
            [friendId, user, 'accepted']
        );

        if (!friendship) {
            return res.redirect('/friends?message=Invalid friendship');
        }

        // Remove friendship
        await db.none('DELETE FROM friends WHERE id = $1', [friendId]);

        res.redirect('/friends?message=Friend removed successfully');
    } catch (error) {
        console.error('Error removing friend:', error);
        res.redirect('/friends?message=Error removing friend');
    }
});

app.delete('/delete-note/:id', async (req, res) => {
    const noteId = req.params.id;
    const user = req.session.user;

    try {
        // Check if user owns the note
        const note = await db.oneOrNone(`
            SELECT n.* 
            FROM notes n
            WHERE n.id = $1 AND n.username = $2`,
            [noteId, user.username]
        );

        if (!note) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to delete this note'
            });
        }

        // Delete note permissions (due to foreign key constraint)
        await db.none('DELETE FROM note_permissions WHERE note_id = $1', [noteId]);
        // Then delete the note
        await db.none('DELETE FROM notes WHERE id = $1 AND username = $2', [noteId, user.username]);
        
        res.status(200).json({
            success: true,
            message: 'Note deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting note:', error);
        res.status(500).json({
            success: false,
            error: 'Error deleting note'
        });
    }
});


app.get('/logout', (req, res) => {
  req.session.destroy();
  res.render('pages/logout', { hideNav: true, message: 'You have been logged out successfully' });
});



app.post('/save-latex', async (req, res) => {
    const { title, content, username, category, noteId } = req.body;

    try {
        const sanitizedContent = content
            .replace(/\u2018|\u2019/g, "'")   
            .replace(/\u201C|\u201D/g, '"')   
            .replace(/\u2013|\u2014/g, '-')   
            .replace(/'/g, "\\'")             
            .replace(/"/g, '\\"');            

        // If noteId is provided, try to update that specific note
        if (noteId) {
            const existingNote = await db.oneOrNone(`
                SELECT n.*, 
                       CASE 
                         WHEN n.username = $1 THEN true
                         ELSE np.can_edit
                       END as can_edit
                FROM notes n
                LEFT JOIN note_permissions np ON n.id = np.note_id AND np.username = $1
                WHERE n.id = $2`,
                [username, noteId]
            );

            if (!existingNote) {
                return res.status(404).json({ success: false, error: 'Note not found' });
            }

            if (!existingNote.can_edit) {
                return res.status(403).json({ success: false, error: 'No permission to edit' });
            }

            await db.none(
                'UPDATE notes SET content = $1, category = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
                [sanitizedContent, category, noteId]
            );
            
            return res.status(200).json({ 
                success: true, 
                noteId: noteId,
                message: 'Note updated successfully'
            });
        }

        // If no noteId, check if user can edit an existing note with this title
        const existingNote = await db.oneOrNone(`
            SELECT n.*, 
                   CASE 
                     WHEN n.username = $1 THEN true
                     ELSE np.can_edit
                   END as can_edit
            FROM notes n
            LEFT JOIN note_permissions np ON n.id = np.note_id AND np.username = $1
            WHERE n.title = $2 AND (n.username = $1 OR np.username = $1)`,
            [username, title]
        );

        if (existingNote) {
            if (!existingNote.can_edit) {
                return res.status(403).json({ success: false, error: 'No permission to edit note with this title' });
            }

            // Update the existing note
            await db.none(
                'UPDATE notes SET content = $1, category = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
                [sanitizedContent, category, existingNote.id]
            );
            
            return res.status(200).json({ 
                success: true, 
                noteId: existingNote.id,
                message: 'Note updated successfully'
            });
        }

        // Only create a new note if no existing note was found or user has no permission to edit an existing note with this title
        const result = await db.one(
            'INSERT INTO notes (title, content, username, category) VALUES ($1, $2, $3, $4) RETURNING id',
            [title, sanitizedContent, username, category]
        );
        
        res.status(201).json({ 
            success: true, 
            noteId: result.id,
            message: 'Note created successfully'
        });
    } catch (error) {
        console.error('Error saving note:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// Route to get all notes for the logged-in user
app.get('/get-notes', async (req, res) => {
  const user = req.session.user;

  try {
    const notes = await db.any(`
      SELECT DISTINCT n.id, n.title 
      FROM notes n
      LEFT JOIN note_permissions np ON n.id = np.note_id
      WHERE n.username = $1 
      OR (np.username = $1 AND np.can_read = true)`, 
      [user.username]
    );
    res.json(notes); // Send the list of notes as JSON
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).send('Error fetching notes');
  }
});

// Route to get a specific note's content by ID
app.get('/get-note/:id', async (req, res) => {
  const noteId = req.params.id;
  const user = req.session.user;

  try {
    const note = await db.one(`
          SELECT n.*, 
                  CASE 
                    WHEN n.username = $1 THEN true
                    ELSE np.can_edit
                  END as can_edit
          FROM notes n
          LEFT JOIN note_permissions np ON n.id = np.note_id AND np.username = $1
          WHERE n.id = $2 
          AND (n.username = $1 OR np.username = $1 AND np.can_read = true)`,
      [user.username, noteId]
    );
    res.json(note);
  } catch (error) {
    console.error('Error fetching note:', error);
    res.status(500).send('Error fetching note');
  }
});

app.get('/scan', (req, res) => {
  const user = req.session.user;
  res.render('pages/scan', { user });
});


// Route to hit GPT3.5 turbo API
app.post('/process-selection', async (req, res) => {
  const { selectedHtml, latexSource, context } = req.body;
  const prompt = `
    You are an AI assistant that edits LaTeX documents based on user instructions.

    **Task**: Modify the LaTeX source code according to the user's request. Only edit the specific section corresponding to the selected HTML content. Do not change any other parts of the document.

    **Important LaTeX.js Limitations**:
    1. Do not use conditional expressions or plainTeX macros
    2. Do not use deprecated macros like eqnarray, \\it, \\sl
    3. Do not use \\raggedleft in the middle of paragraphs
    4. Do not attempt to load packages with \\usepackage
    5. Use simple | instead of \\| for absolute value bars
    6. Wrap all equations in $$ delimiters, not \\[ \\] or $ $

    **LaTeX Source Code**:
    ${latexSource}

    **Selected HTML Content**:
    ${selectedHtml}

    **User's Request**:
    ${context}

    **Instructions**:
    - Identify the LaTeX code corresponding to the selected HTML content
    - Apply the user's requested changes to that portion of the LaTeX code
    - Do not modify any other parts of the document
    - Ensure all equations use $$ delimiters
    - Use \\left| and \\right| for absolute value bars, not \\left\\| or \\right\\|
    - Return the entire updated LaTeX source code, formatted exactly as it was sent to you

    **Output**:
    [Provide only the updated LaTeX source code.]`
    try {
      const response = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'user', content: prompt },
        ],
        max_tokens: 2048,
        temperature: 0,
      });
      const updatedLatex = response.data.choices[0].message.content.trim();
   
      res.json({ updatedLatex });
    } catch (error) {
      console.error('OpenAI API error:', error);
      res.status(500).json({ error: 'Failed to process the request.' });
    }
});



// Get friends for sharing
app.get('/get-friends-for-sharing', async (req, res) => {
  const user = req.session.user;
  try {
    // Get only accepted friends for sharing
    const friends = await db.any(`
        SELECT 
            CASE 
                WHEN f.requester = $1 THEN f.addressee 
                ELSE f.requester 
            END as friend_username
        FROM friends f
        WHERE (f.requester = $1 OR f.addressee = $1)
        AND f.status = 'accepted'
        ORDER BY friend_username
    `, [user.username]);
    
    res.json(friends);
  } catch (error) {
    console.error('Error fetching friends for sharing:', error);
    res.status(500).json({ error: 'Error fetching friends list' });
  }
});

// Share note with friends
app.post('/share-note', async (req, res) => {
  const { noteId, shareWith, canEdit } = req.body;
  const user = req.session.user;

  try {
    // First verify the note exists and user owns it
    const note = await db.one(
      'SELECT * FROM notes WHERE id = $1 AND username = $2', 
      [noteId, user.username]
    );

    // Verify friendship exists and is accepted
    const friendship = await db.oneOrNone(`
        SELECT * FROM friends 
        WHERE ((requester = $1 AND addressee = $2) 
            OR (requester = $2 AND addressee = $1))
        AND status = 'accepted'`,
        [user.username, shareWith]
    );

    if (!friendship) {
      return res.status(403).json({ 
        success: false, 
        error: 'Can only share notes with accepted friends' 
      });
    }

    const existingShare = await db.oneOrNone(
      'SELECT * FROM note_permissions WHERE note_id = $1 AND username = $2',
      [noteId, shareWith]
    );

    if (existingShare) {
      await db.none(
        'UPDATE note_permissions SET can_edit = $1, updated_at = CURRENT_TIMESTAMP WHERE note_id = $2 AND username = $3',
        [canEdit, noteId, shareWith]
      );
    } else {
      await db.none(
        'INSERT INTO note_permissions (note_id, username, can_edit, can_read) VALUES ($1, $2, $3, true)',
        [noteId, shareWith, canEdit]
      );
    }

    res.status(200).json({ 
      success: true, 
      message: 'Note shared successfully'
    });
  } catch (error) {
    console.error('Error sharing note:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});
// Share note with community endpoint
app.post('/api/community/:communityId/share-note', async (req, res) => {
    try {
        const { communityId } = req.params;
        const { noteId } = req.body;
        const username = req.session.user.username;

        // Check if note already shared
        const existingShare = await db.oneOrNone(`
            SELECT * FROM community_notes 
            WHERE note_id = $1 AND community_id = $2`,
            [noteId, communityId]
        );

        if (existingShare) {
            return res.status(400).json({ 
                success: false, 
                message: 'Note already shared with this community' 
            });
        }

        // Share the note
        await db.none(`
            INSERT INTO community_notes 
            (note_id, community_id, shared_by, shared_at, is_public)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP, true)`,
            [noteId, communityId, username]
        );

        res.json({ 
            success: true, 
            message: 'Note shared successfully' 
        });
    } catch (error) {
        console.error('Error sharing note:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to share note' 
        });
    }
});

app.get('/api/community/:communityId/messages/:username', async (req, res) => {
  if (!req.session.user) {
      return res.status(401).json({ error: "Unauthorized" });
  }

  try {
      const { communityId, username } = req.params;
      const currentUser = req.session.user.username;

      const messages = await db.any(`
          SELECT * FROM direct_messages
          WHERE community_id = $1
          AND ((from_user = $2 AND to_user = $3)
          OR (from_user = $3 AND to_user = $2))
          ORDER BY sent_at ASC`,
          [communityId, currentUser, username]
      );

      res.json(messages);
  } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: "Server error" });
  }
});

// Sendmsg
app.post('/api/community/:communityId/message', async (req, res) => {
  if (!req.session.user) {
      return res.status(401).json({ error: "Unauthorized" });
  }

  try {
      const { communityId } = req.params;
      const { content, toUser } = req.body;
      const fromUser = req.session.user.username;

      await db.none(`
          INSERT INTO direct_messages 
          (community_id, from_user, to_user, content)
          VALUES ($1, $2, $3, $4)`,
          [communityId, fromUser, toUser, content]
      );

      res.json({ success: true });
  } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ error: "Server error" });
  }
});

//copies for admin
app.get('/api/community/:communityId/note/:noteId/copies', async (req, res) => {
  if (!req.session.user) {
      return res.status(401).json({ error: "Unauthorized" });
  }

  try {
      const { communityId, noteId } = req.params;
      const originalNote = await db.one('SELECT title FROM notes WHERE id = $1', [noteId]);

      const copies = await db.any(`
          SELECT 
              n.*,
              u.username as student_name,
              cn.shared_at
          FROM notes n
          JOIN users u ON n.username = u.username
          JOIN community_notes cn ON n.id = cn.note_id
          WHERE cn.community_id = $1 
          AND n.title LIKE '%''s copy of ' || $2
          ORDER BY u.username, cn.shared_at DESC`,
          [communityId, originalNote.title]
      );

      res.json(copies);
  } catch (error) {
      console.error('Error fetching copies:', error);
      res.status(500).json({ error: "Failed to fetch copies" });
  }
});
// friendship!!!
app.get('/friendship-status/:username', async (req, res) => {
  try {
    const currentUser = req.session.user.username;
    const otherUser = req.params.username;

    const friendship = await db.oneOrNone(`
      SELECT 
        id,
        requester,
        addressee,
        status,
        CASE 
          WHEN requester = $1 THEN 'sent'
          WHEN addressee = $1 THEN 'received'
        END as direction
      FROM friends 
      WHERE (requester = $1 AND addressee = $2)
        OR (requester = $2 AND addressee = $1)`,
      [currentUser, otherUser]
    );

    res.json({
      status: friendship ? friendship.status : 'none',
      direction: friendship ? friendship.direction : null,
      id: friendship ? friendship.id : null
    });
  } catch (error) {
    console.error('Error getting friendship status:', error);
    res.status(500).json({ error: 'Error getting friendship status' });
  }
});

app.get('/editor', async (req, res) => {
  const user = req.session.user;
  try {
    // Get friend count for the navbar
    const friendCount = await db.one(`
      SELECT COUNT(*) as count
      FROM friends
      WHERE (requester = $1 OR addressee = $1)
      AND status = 'accepted'`,
      [user.username]
    );

    // Get pending request count
    const pendingCount = await db.one(`
      SELECT COUNT(*) as count
      FROM friends
      WHERE addressee = $1 AND status = 'pending'`,
      [user.username]
    );

    res.render('pages/editor', { 
      user,
      friendCount: friendCount.count,
      pendingCount: pendingCount.count
    });
  } catch (error) {
    console.error('Error loading editor:', error);
    res.render('pages/editor', { user });
  }
});

app.post('/change-password', async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = req.session.user;

  try {
    // Fetch the user from the database
    const dbUser = await db.oneOrNone('SELECT * FROM users WHERE username = $1', [user.username]);
    // Verify the old password
    const passwordValid = await bcrypt.compare(oldPassword, dbUser.password);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Old password is incorrect' });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the password in the database
    await db.none('UPDATE users SET password = $1 WHERE username = $2', [hashedPassword, user.username]);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Update the notes route to include friend info
app.get('/notes', async (req, res) => {
  const user = req.session.user;
  try {
    const notes = await db.any(`
      SELECT DISTINCT n.id, n.title, n.username, 
             CASE 
               WHEN n.username = $1 THEN true
               ELSE np.can_edit
             END as can_edit,
             CASE 
               WHEN n.username = $1 THEN 'Owner'
               ELSE 'Shared'
             END as access_type,
             CASE 
               WHEN n.username = $1 THEN true
               ELSE np.can_read
             END as can_read,
             EXISTS(
               SELECT 1 FROM friends f
               WHERE ((f.requester = n.username AND f.addressee = $1)
                  OR (f.requester = $1 AND f.addressee = n.username))
               AND f.status = 'accepted'
             ) as is_friend
      FROM notes n
      LEFT JOIN note_permissions np ON n.id = np.note_id AND np.username = $1
      WHERE n.username = $1 
      OR (np.username = $1 AND np.can_read = true)
      ORDER BY n.title`, 
      [user.username]
    );

    const friendCount = await db.one(`
      SELECT COUNT(*) as count
      FROM friends
      WHERE (requester = $1 OR addressee = $1)
      AND status = 'accepted'`,
      [user.username]
    );

    const pendingCount = await db.one(`
      SELECT COUNT(*) as count
      FROM friends
      WHERE addressee = $1 AND status = 'pending'`,
      [user.username]
    );

    res.render('pages/notes', { 
      user, 
      notes,
      friendCount: friendCount.count,
      pendingCount: pendingCount.count
    });
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).send('Error fetching notes');
  }
});


async function cleanupExpiredTokens() {
  try {
    await db.none('DELETE FROM password_reset_tokens WHERE expiration_timestamp < NOW() OR used = TRUE');
  } catch (error) {
    console.error('Token cleanup error:', error);
  }
}
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);
// Run cleanup on server start
cleanupExpiredTokens();
// *****************************************************
// <!-- Section 5 : Start Server-->
// *****************************************************
// starting the server and keeping the connection open to listen for more requests

module.exports = app.listen(3000);
console.log('Server is listening on port 3000');

// Test the connection when server starts
transporter.verify(function(error, success) {
  if (error) {
    console.log('Email setup error:', error);
  } else {
    console.log('Email server is ready to send messages');
  }
});

function unescapeLatex(text) {
    if (!text) return '';
    return text
      .replace(/\\'/g, "'")    // Unescape single quotes
      .replace(/&#027;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace("&#027;&#027;", "''")
      .replace(/\\"/g, '"')    // Unescape double quotes
      .replace(/\\\\/g, '\\')  // Handle escaped backslashes
      .replace(/&quot;/g, '"') // Handle HTML entities
      .replace("&#027;", "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
}

app.get('/get-note/:id', async (req, res) => {
    const noteId = req.params.id;
    const user = req.session.user;

    try {
        const note = await db.one(`
            SELECT n.title, n.content, n.category, n.username,
                   np.can_edit, np.can_read
            FROM notes n
            LEFT JOIN note_permissions np ON n.id = np.note_id AND np.username = $1
            WHERE n.id = $2 
            AND (n.username = $1 OR np.can_read = true)`,
            [user.username, noteId]
        );
        
        // Unescape the content before sending
        note.content = unescapeLatex(note.content);
        res.json(note);
    } catch (error) {
        console.error('Error fetching note:', error);
        res.status(500).send('Error fetching note');
    }
});
app.get('/templates', async (req, res) => {
  try {
      const user = req.session.user;

      // Fetch user's own templates
      const userTemplates = await db.any(`
          SELECT t.*, true as can_edit
          FROM templates t
          WHERE t.username = $1
          ORDER BY t.title`, 
          [user.username]
      );

      // Fetch templates shared with the user
      const sharedTemplates = await db.any(`
          SELECT t.*, tp.can_edit, tp.can_read
          FROM templates t
          JOIN template_permissions tp ON t.id = tp.template_id
          WHERE tp.username = $1 AND tp.can_read = true
          ORDER BY t.title`, 
          [user.username]
      );

      res.render('pages/template', { 
          user, 
          userTemplates, 
          sharedTemplates 
      });
  } catch (error) {
      console.error('Error fetching templates:', error);
      res.status(500).send('Error fetching templates');
  }
});

app.post('/create-template', async (req, res) => {
  const { title, content, category } = req.body;
  const username = req.session.user.username;

  try {
      // Insert the template into the database
      await db.none(
          'INSERT INTO templates (title, content, category, username) VALUES ($1, $2, $3, $4)',
          [title, content, category, username]
      );

      res.json({ 
          success: true, 
          message: 'Template saved successfully' 
      });
  } catch (error) {
      console.error('Error creating template:', error);
      res.status(500).json({ 
          success: false, 
          error: 'Failed to save template' 
      });
  }
});

app.post('/edit-template/:id', async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;
  const user = req.session.user;

  try {
      // Verify user has permission to edit the template
      const template = await db.one(`
          SELECT t.*, 
                 CASE 
                   WHEN t.username = $1 THEN true
                   ELSE tp.can_edit
                 END as can_edit
          FROM templates t
          LEFT JOIN template_permissions tp ON t.id = tp.template_id
          WHERE t.id = $2`,
          [user.username, id]
      );

      if (!template.can_edit) {
          return res.status(403).json({ success: false, error: 'No permission to edit this template' });
      }

      // Update the template
      await db.none(
          'UPDATE templates SET title = $1, content = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [title, content, id]
      );

      res.json({ success: true, message: 'Template updated successfully' });
  } catch (error) {
      console.error('Error editing template:', error);
      res.status(500).json({ success: false, error: 'Failed to edit template' });
  }
});

app.delete('/delete-template/:id', async (req, res) => {
  const { id } = req.params;
  const user = req.session.user;

  try {
      // Verify user owns the template
      const template = await db.oneOrNone('SELECT * FROM templates WHERE id = $1 AND username = $2', [id, user.username]);

      if (!template) {
          return res.status(403).json({ success: false, error: 'No permission to delete this template' });
      }

      // Delete template permissions first due to foreign key constraint
      await db.none('DELETE FROM template_permissions WHERE template_id = $1', [id]);

      // Delete the template
      await db.none('DELETE FROM templates WHERE id = $1', [id]);

      res.json({ success: true, message: 'Template deleted successfully' });
  } catch (error) {
      console.error('Error deleting template:', error);
      res.status(500).json({ success: false, error: 'Failed to delete template' });
  }
});

app.post('/share-template', async (req, res) => {
  const { templateId, shareWith, canEdit } = req.body;
  const user = req.session.user;

  try {
      // Verify user owns the template
      const template = await db.one(
          'SELECT * FROM templates WHERE id = $1 AND username = $2',
          [templateId, user.username]
      );

      // Verify friendship exists
      const friendship = await db.oneOrNone(`
          SELECT * FROM friends 
          WHERE ((requester = $1 AND addressee = $2) 
              OR (requester = $2 AND addressee = $1)) 
          AND status = 'accepted'`,
          [user.username, shareWith]
      );

      if (!friendship) {
          return res.status(403).json({
              success: false,
              error: 'Can only share templates with friends'
          });
      }

      // Check if sharing already exists
      const existingShare = await db.oneOrNone('SELECT * FROM template_permissions WHERE template_id = $1 AND username = $2', [templateId, shareWith]);

      if (existingShare) {
          // Update existing permissions
          await db.none(
              'UPDATE template_permissions SET can_edit = $1, updated_at = CURRENT_TIMESTAMP WHERE template_id = $2 AND username = $3',
              [canEdit, templateId, shareWith]
          );
      } else {
          // Create new permissions
          await db.none(
              'INSERT INTO template_permissions (template_id, username, can_edit, can_read) VALUES ($1, $2, $3, true)',
              [templateId, shareWith, canEdit]
          );
      }

      res.json({ success: true, message: 'Template shared successfully' });
  } catch (error) {
      console.error('Error sharing template:', error);
      res.status(500).json({ success: false, error: 'Failed to share template' });
  }
});

app.post('/rewrite-text', async (req, res) => {
  const { text, instructions } = req.body;
  const prompt = `You are an AI assistant that edits English documents based on user instructions.

  **Task**: Convert English text into LaTeX format according to the user's instructions.

  **Important LaTeX.js Limitations**:
  1. Do not use conditional expressions or plainTeX macros
  2. Do not use deprecated macros like eqnarray, \\it, \\sl
  3. Do not use \\raggedleft in the middle of paragraphs
  4. Do not attempt to load packages with \\usepackage
  5. Use simple | instead of \\| for absolute value bars
  6. Wrap all equations in $$ delimiters, not \\[ \\] or $ $

  **English Text to Convert**:
  ${text}

  **User's Instructions**:
  ${instructions}

  **Instructions**:
  - Convert the English text into valid LaTeX format
  - All mathematical equations must be wrapped in $$ delimiters
  - Use \\left| and \\right| for absolute value bars, not \\left\\| or \\right\\|
  - Ensure the output is compatible with LaTeX.js limitations
  - Do not include \\begin{document} or \\end{document} tags
  - Do not include any preamble or package loading

  **Output**:
  [Provide only the LaTeX code.]`
    try {
      //console.log(prompt)
      const response = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'user', content: prompt },
        ],
        max_tokens: 2048,
        temperature: 0,
      });
      const updatedLatex = response.data.choices[0].message.content.trim();
   
      res.json({ updatedLatex });
    } catch (error) {
      console.error('OpenAI API error:', error);
      res.status(500).json({ error: 'Failed to process the request.' });
    }
});


async function refreshWeeklyCredits() {
  try {
      // Get all non-premium users whose credits were last reset more than 7 days ago
      const usersToReset = await db.any(`
          SELECT username 
          FROM users 
          WHERE NOT is_premium 
          AND (last_credit_reset IS NULL OR last_credit_reset < NOW() - INTERVAL '7 days')`
      );
      if (usersToReset.length > 0) {
          // Reset credits and update last_credit_reset timestamp
          await db.none(`
              UPDATE users 
              SET ai_credits = 10, 
                  last_credit_reset = NOW() 
              WHERE username = ANY($1)`, 
              [usersToReset.map(u => u.username)]
          );
          
          console.log(`Reset credits for ${usersToReset.length} users`);
      }
  } catch (error) {
      console.error('Error refreshing weekly credits:', error);
  }
}
const checkAICredits = async (req, res, next) => {
  if (!req.session.user) return next();
  
  try {
      const user = await db.one('SELECT is_premium, ai_credits, last_credit_reset FROM users WHERE username = $1', 
          [req.session.user.username]);
      
      if (user.is_premium) return next();
      
      if (user.ai_credits <= 0) {
        console.log('Sending 403 with reset:', user.last_credit_reset);
        return res.status(403).json({
            error: 'No AI credits remaining',
            message: 'Please upgrade to premium or wait for your credits to reset',
            last_credit_reset: user.last_credit_reset
        });
      }
      
      // Deduct one credit and ensure last_credit_reset is set
      await db.none(`
          UPDATE users 
          SET ai_credits = ai_credits - 1,
              last_credit_reset = COALESCE(last_credit_reset, CURRENT_TIMESTAMP)
          WHERE username = $1`, 
          [req.session.user.username]
      );
      
      // Update the session with new credit count
      req.session.user.ai_credits = user.ai_credits - 1;
      await req.session.save();
      
      next();
  } catch (error) {
      console.error('Error checking AI credits:', error);
      res.status(500).json({ error: 'Internal server error' });
  }
};

app.get('/get-user-credits', async (req, res) => {
  if (!req.session.user) {
      return res.status(401).json({ error: 'Not logged in' });
  }
  
  try {
      const user = await db.one(`
          SELECT username, ai_credits, is_premium, last_credit_reset,
                 COALESCE(last_credit_reset, CURRENT_TIMESTAMP) as effective_reset
          FROM users 
          WHERE username = $1`, 
          [req.session.user.username]
      );
      
      console.log('User credit data from DB:', user); // Debug log
      
      // Update session with latest credits
      req.session.user.ai_credits = user.ai_credits;
      req.session.user.is_premium = user.is_premium;
      await req.session.save();
      
      res.json({
          ai_credits: user.ai_credits,
          is_premium: user.is_premium,
          last_credit_reset: user.effective_reset // Use the coalesced value
      });
  } catch (error) {
      console.error('Error fetching credits:', error);
      res.status(500).json({ error: 'Internal server error' });
  }
});



app.post('/photo-to-latex', checkAICredits, async (req, res) => {
  const { photo } = req.body;
  
  try {
    const base64Image = photo.replace(/^data:image\/\w+;base64,/, '');
    
    const prompt = `You are an AI assistant that converts handwritten mathematical content into LaTeX format. Please convert the uploaded photo to LaTeX format, following these strict requirements:

1. Return ONLY the LaTeX code, with no additional explanations
2. ALL mathematical equations must be wrapped in '$$' delimiters (not \[ \] or $ $)
3. Use this exact document structure unless absolutely necessary to do otherwise:
4. WHEN WRITING ABSOLUTE VALUES, USE ONLY THE "|" SYMBOL, no slashes.

**DOCUMENT STRUCTURE**:

\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{amsfonts}

\\begin{document}
[CONVERTED CONTENT GOES HERE]
\\end{document}

4. Preserve all mathematical notation and formatting from the original image
5. Do not add any comments or explanations - only output valid LaTeX code
6. Do not include markdown code fences (\`\`\`) or language identifiers in your response
7. FOLLOW THESE IMPORTANT LATEX.JS LIMITATIONS:
  **Important LaTeX.js Limitations**:
  1. Do not use conditional expressions or plainTeX macros
  2. Do not use deprecated macros like eqnarray, \\it, \\sl
  3. Do not use \\raggedleft in the middle of paragraphs
  4. Do not attempt to load packages with \\usepackage
  5. Use simple | instead of \\| for absolute value bars
  6. Wrap all equations in $$ delimiters, not \\[ \\] or $ $`;

    const response = await openai.createChatCompletion({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 4096,
      temperature: 0.3
    });

    if (!response.data?.choices?.[0]?.message?.content) {
      throw new Error('No content in OpenAI response');
    }

    let latexCode = response.data.choices[0].message.content.trim();
    
    latexCode = latexCode.replace(/^```latex\s*/, '');
    latexCode = latexCode.replace(/^```\s*/, '');
    latexCode = latexCode.replace(/\s*```$/, '');

    //console.log('Cleaned OpenAI Response:', latexCode);

    return res.json({ 
      success: true,
      latex: latexCode 
    });

  } catch (error) {
    console.error('Error processing image:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to process image',
      details: error.message,
      ...(error.response?.data && { apiError: error.response.data })
    });
  }
});