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
const axios = require('axios'); // To make HTTP requests from our server. We'll learn more about it in Part C.
const crypto = require('crypto');

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
    }
  }
});


// database configuration
const dbConfig = {
  host: 'db', // the database server
  port: 5432, // the database port
  database: process.env.POSTGRES_DB, // the database name
  user: process.env.POSTGRES_USER, // the user account to connect with
  password: process.env.POSTGRES_PASSWORD, // the password of the user account
};

const db = pgp(dbConfig);

// Update this line if it exists, or add it if it doesn't
app.use(express.static(path.join(__dirname, 'public')));

// test your database
db.connect()
  .then(obj => {
    console.log('Database connection successful'); // you can view this message in the docker compose logs
    // console.log the db schema to test the connection
    obj.done(); // success, release the connection;
  })
  .catch(error => {
    console.log('ERROR:', error.message || error);
  });

// *****************************************************
// <!-- Section 3 : App Settings -->
// *****************************************************

// Register `hbs` as our view engine using its bound `engine()` function.
app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.json()); // specify the usage of JSON for parsing request body.

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
  apiKey: process.env.API_KEY, // Ensure you secure this key
});
const openai = new OpenAIApi(configuration);


// *****************************************************
// <!-- Section 4 : API Routes -->
// *****************************************************

app.get('/welcome', (req, res) => {
  res.status(200).json({status: 'success', message: 'Welcome!'});
});

// Add these before any middleware or routes
app.use((req, res, next) => {
    console.log('Incoming request:', {
        path: req.path,
        method: req.method,
        session: req.session,
        body: req.method === 'POST' ? req.body : undefined
    });
    next();
});

const auth = (req, res, next) => {
    console.log('Auth middleware:', {
        path: req.path,
        isAuthenticated: !!req.session.user,
        publicPath: ['/login', '/register', '/logout', '/auth'].includes(req.path)
    });
    
    const publicPaths = ['/login', '/register', '/logout'];
    if (!req.session.user && !publicPaths.includes(req.path)) {
        console.log('Redirecting to login - unauthorized access');
        return res.redirect('/login');
    }
    next();
};

// Authentication middleware
app.use(auth);

// Then define your routes
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
                isRegister: false
            });
        }
        
        const passwordValid = await bcrypt.compare(password, user.password);
        if (!passwordValid) {
            return res.status(401).render('pages/auth', { 
                message: 'Invalid password',
                isRegister: false
            });
        }
        
        req.session.user = user;
        req.session.save();
        res.status(200).redirect('/editor');
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).render('pages/auth', { 
            loginError: 'An error occurred during login',
            isRegister: false
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
            isRegister: true
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
            AND (n.username = $1 OR np.username = $1)`,
            [user.username, noteId]
        );
        console.log('Note found:', note); // Add this for debugging
        res.render('pages/editor', { user, note });
    } catch (error) {
        console.error('Error fetching note:', error);
        res.status(500).send('Error fetching note');
    }
});

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
                   END as can_read
            FROM notes n
            LEFT JOIN note_permissions np ON n.id = np.note_id AND np.username = $1
            WHERE n.username = $1 
            OR (np.username = $1 AND np.can_read = true)
            ORDER BY n.title`, 
            [user.username]
        );
        console.log('Notes found:', notes); // Add this for debugging
        res.render('pages/notes', { user, notes });
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

    // Base query to select communities and check membership
    let query = `
      SELECT c.*, 
             CASE WHEN cm.username IS NOT NULL THEN true ELSE false END as is_member
      FROM communities c
      LEFT JOIN community_memberships cm ON c.community_id = cm.community_id 
        AND cm.username = $1`;
    
    const queryParams = [user.username];
    let paramCount = 1;

    if (is_private !== undefined) {
      paramCount++;
      queryParams.push(is_private === 'true');
      query += ` WHERE c.is_private = $${paramCount}`;
    }

    if (created_by) {
      paramCount++;
      queryParams.push(created_by);
      query += queryParams.length === 2 ? ' WHERE' : ' AND';
      query += ` c.created_by = $${paramCount}`;
    }

    // Fetch communities from the database
    const communities = await db.any(query, queryParams);

    // Render the template with user data included
    res.render('pages/communities', {
      data: communities,
      user: user
    });
  } catch (error) {
    console.error('Error fetching communities:', error);
    res.render('pages/communities', {
      data: [],
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

app.post('/create-community', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Unauthorized: Please log in to create a community.");
  }

  try {
    const { name, description, is_private } = req.body;
    const created_by = req.session.user.username;

    // If the community is private, use the provided access code or generate one
    const access_code = is_private === 'true' ? req.body.access_code || null : null;

    // Insert the new community into the database
    const result = await db.one(
      `INSERT INTO communities (name, description, is_private, access_code, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING community_id`,
      [name, description, is_private === 'true', access_code, created_by]
    );

    // Redirect to the new community’s page
    console.log("New community created with ID:", result.community_id);
    res.redirect(`/community/${result.community_id}`);

  } catch (error) {
    console.error('Error creating community:', error);

    // Render error message if an error occurs
    res.render('pages/communities', {
      error: 'There was an error creating the community. Please try again.',
      user: req.session.user,
      formData: { name, description, is_private }
    });
  }
});


app.post('/community/:id/join', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Unauthorized: Please log in to join a community.");
  }
  try {
    const communityId = req.params.id;
    const username = req.session.user.username;

    await db.none(
      `INSERT INTO community_memberships (community_id, username) VALUES ($1, $2)`,
      [communityId, username]
    );

    res.redirect(`/community/${communityId}`);
  } catch (error) {
    console.error('Error joining community:', error);
    res.redirect(`/community/${communityId}`);
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
  if (!req.session.user) {
    return res.status(401).send("Unauthorized: Please log in to view this community.");
  }

  try {
    const communityId = req.params.id;
    const user = req.session.user;

    // Fetch community details
    const community = await db.oneOrNone(
      `SELECT * FROM communities WHERE community_id = $1`,
      [communityId]
    );

    // Fetch community members
    const members = await db.any(
      `SELECT u.username, cm.is_admin 
       FROM community_memberships cm
       JOIN users u ON cm.username = u.username
       WHERE cm.community_id = $1`,
      [communityId]
    );

    // Fetch recent chat messages (last 20 messages)
    const messages = await db.any(
      `SELECT m.message_id, m.username, m.content, m.sent_at, u.profile_picture_url
       FROM community_messages m
       JOIN users u ON m.username = u.username
       WHERE m.community_id = $1
       ORDER BY m.sent_at DESC
       LIMIT 20`,
      [communityId]
    );

    // Render the unique community page with the community data, members, and messages
    res.render('pages/uniqueCommunity', {
      community,
      members,
      messages,
      user: user
    });
  } catch (error) {
    console.error('Error fetching community page:', error);
    res.status(500).send("Server error while fetching the community.");
  }
});

// Post a message to community chat
app.post('/community/:id/chat', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Unauthorized: Please log in to send messages.");
  }

  try {
    const communityId = req.params.id;
    const username = req.session.user.username;
    const content = req.body.content;

    await db.none(
      `INSERT INTO community_messages (community_id, username, content)
       VALUES ($1, $2, $3)`,
      [communityId, username, content]
    );

    res.sendStatus(200);
  } catch (error) {
    console.error('Error posting message:', error);
    res.status(500).send("Server error while posting the message.");
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

        // Delete note permissions first (due to foreign key constraint)
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
      SELECT n.title, n.content, n.category, n.username,
             np.can_edit, np.can_read
      FROM notes n
      LEFT JOIN note_permissions np ON n.id = np.note_id AND np.username = $1
      WHERE n.id = $2 
      AND (n.username = $1 OR np.can_read = true)`,
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

// TODO: Implement image processing logic using process_to_lines.py
// app.post('/process-scan', async (req, res) => {
//   try {
//       // TODO: Implement image processing logic using process_to_lines.py
      //res.json({ success: true, message: 'Image processed successfully' });
  //} catch (error) {
      //console.error('Error processing image:', error);
     // res.status(500).json({ success: false, message: 'Error processing image' });
  //}
//});
// Route to hit GPT3.5 turbo API
app.post('/process-selection', async (req, res) => {
  const { selectedHtml, latexSource, context } = req.body;
  const prompt = `
    You are an AI assistant that edits LaTeX documents based on user instructions.

    **Task**: Modify the LaTeX source code according to the user's request. Only edit the specific section corresponding to the selected HTML content. Do not change any other parts of the document.

    **LaTeX Source Code**:
    ${latexSource}

    **Selected HTML Content**:
    ${selectedHtml}

    **User's Request**:
    ${context}

    **Instructions**:
    - Identify the LaTeX code corresponding to the selected HTML content.
    - Apply the user's requested changes to that portion of the LaTeX code.
    - Do not modify any other parts of the document.
    - Return the entire updated LaTeX source code, formatted exactly as it was sent to you.

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

    // Check if sharing already exists
    const existingShare = await db.oneOrNone(
      'SELECT * FROM note_permissions WHERE note_id = $1 AND username = $2',
      [noteId, shareWith]
    );

    if (existingShare) {
      // Update existing permissions
      await db.none(
        'UPDATE note_permissions SET can_edit = $1, updated_at = CURRENT_TIMESTAMP WHERE note_id = $2 AND username = $3',
        [canEdit, noteId, shareWith]
      );
    } else {
      // Create new permission
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

// Add a route to get friendship status
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

// Update the editor route to include friend status
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

    // Get friend count and pending count for navbar
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

// *****************************************************
// <!-- Section 5 : Start Server-->
// *****************************************************
// starting the server and keeping the connection open to listen for more requests
module.exports = app.listen(3000);
console.log('Server is listening on port 3000');

// Add this helper function at the top of your file
function unescapeLatex(text) {
    if (!text) return '';
    return text
        .replace(/\\'/g, "'")    // Unescape single quotes
        .replace(/\\"/g, '"')    // Unescape double quotes
        .replace(/\\\\/g, '\\'); // Handle escaped backslashes
}

// Then update your get-note route
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


// CHRIS
app.post('/rewrite-text', async (req, res) => {
  const { text } = req.body;
  const prompt = `
    ...
    `
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