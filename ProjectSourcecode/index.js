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

// TODO - Include your API routes here
app.get('/', (req, res) => {
    res.redirect('/login'); //this will call the /login route in the API
});
  
app.get('/login', (req, res) => {
    res.render('pages/login');
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    // check if the user exists
    const user = await db.oneOrNone('SELECT * FROM users WHERE username = $1', [
        username,
    ]);
    if (!user) {
        res.render('pages/login', { message: 'Invalid username', error: "yes" });
        return;
    }
    // check if the password is correct
    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
        res.render('pages/login', { message: 'Invalid password', error: "yes" });
        return;
    }
    // set the session
    req.session.user = user;
    req.session.save();
    res.redirect('/editor');
        
});

const auth = (req, res, next) => {
    const publicPaths = ['/login', '/register', '/logout'];
    if (!req.session.user && !publicPaths.includes(req.path)) {
      // Default to login page.
      return res.redirect('/login');
    }
    next();
  };
  
  // Authentication Required
app.use(auth);

app.get('/register', (req, res) => {
    console.log("Register page requested");
    res.render('pages/register');
});

app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        await db.none('INSERT INTO users(username, email, password) VALUES($1, $2, $3)', [
            username,
            email,
            hashedPassword,
        ]);
        res.redirect('/login');
    } catch (error) {
        res.render('pages/register', { message: 'Username/email already exists', error: error });
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

app.get('/communities', (req, res) => {
  res.render('pages/communities');
});

app.get('/friends', async (req, res) => {
  const user = req.session.user;
  const friends = await db.any('SELECT friend_username FROM friends WHERE username = $1', [user.username]);
  res.render('pages/friends', { user, friends });
});

app.post('/add-friend', async (req, res) => {
  try {
    const { friendUsername } = req.body;
    const user = req.session.user;

    // Check if friend exists
    const friendExists = await db.oneOrNone('SELECT username FROM users WHERE username = $1', [friendUsername]);
    if (!friendExists) {
      return res.status(404).send('User not found');
    }

    // Check if friendship already exists
    const existingFriend = await db.oneOrNone(
      'SELECT * FROM friends WHERE username = $1 AND friend_username = $2',
      [user.username, friendUsername]
    );
    if (existingFriend) {
      return res.status(400).send('Friendship already exists');
    }

    await db.none('INSERT INTO friends (username, friend_username) VALUES ($1, $2)', [user.username, friendUsername]);
    res.redirect('/friends');
  } catch (error) {
    console.error('Error adding friend:', error);
    res.status(500).send('Error adding friend');
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
            return res.status(403).send('You do not have permission to delete this note');
        }

        // Delete note permissions first (due to foreign key constraint)
        await db.none('DELETE FROM note_permissions WHERE note_id = $1', [noteId]);
        // Then delete the note
        await db.none('DELETE FROM notes WHERE id = $1 AND username = $2', [noteId, user.username]);
        
        res.status(200).send('Note deleted');
    } catch (error) {
        console.error('Error deleting note:', error);
        res.status(500).send('Error deleting note');
    }
});


app.get('/logout', (req, res) => {
    req.session.destroy();

    res.render('pages/logout', { message: 'You have been logged out successfully' });
});



app.post('/save-latex', async (req, res) => {
    const { title, content, username, category, noteId } = req.body;

    try {
        // Sanitize the content before saving
        const sanitizedContent = content
            .replace(/\u2018|\u2019/g, "'")   // Smart quotes
            .replace(/\u201C|\u201D/g, '"')   // Smart double quotes
            .replace(/\u2013|\u2014/g, '-')   // Em and en dashes
            .replace(/'/g, "\\'")             // Escape single quotes/apostrophes
            .replace(/"/g, '\\"');            // Escape double quotes

        let existingNote;
        if (noteId) {
            // Check permissions if editing existing note
            existingNote = await db.oneOrNone(`
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
        } else {
            // Check for existing note with same title by same user
            existingNote = await db.oneOrNone(
                'SELECT * FROM notes WHERE title = $1 AND username = $2',
                [title, username]
            );
        }

        let resultNoteId;

        if (existingNote) {
            // Update existing note
            await db.none(
                'UPDATE notes SET content = $1, category = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
                [sanitizedContent, category, existingNote.id]
            );
            resultNoteId = existingNote.id;
        } else {
            // Create new note
            const result = await db.one(
                'INSERT INTO notes (title, content, username, category) VALUES ($1, $2, $3, $4) RETURNING id',
                [title, sanitizedContent, username, category]
            );
            resultNoteId = result.id;
        }

        res.status(200).json({ success: true, noteId: resultNoteId });
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

//communities page endpoints
// GET /communities - Retrieve a list of communities, with optional filters for privacy and creator
app.get('/communities', async (req, res) => {
  const { is_private, created_by } = req.query;

  try {
      // Base query to select all communities
      let query = 'SELECT * FROM communities';
      const queryParams = [];

      // Apply filters if provided in the query string
      if (is_private !== undefined) {
          queryParams.push(is_private === 'true');
          query += ` WHERE is_private = $${queryParams.length}`;
      }

      if (created_by) {
          queryParams.push(created_by);
          query += queryParams.length === 1 ? ' WHERE' : ' AND';
          query += ` created_by = $${queryParams.length}`;
      }

      console.log('Executing query:', query, 'with parameters:', queryParams); // Log query and params for debugging

      // Execute the query with applied parameters
      const communities = await db.any(query, queryParams);
      res.status(200).json({
          success: true,
          data: communities
      });
  } catch (error) {
      console.error('Error fetching communities:', error);
      res.status(500).json({
          success: false,
          message: 'Server error while fetching communities'
      });
  }
});

// Get friends for sharing
app.get('/get-friends-for-sharing', async (req, res) => {
  const user = req.session.user;
  try {
    const friends = await db.any(
      'SELECT friend_username FROM friends WHERE username = $1',
      [user.username]
    );
    res.json(friends);
  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).send('Error fetching friends');
  }
});

// Share note with friends
app.post('/share-note', async (req, res) => {
  const { noteId, shareWith, canEdit } = req.body;
  const user = req.session.user;

  try {
    // First verify the user owns the note
    const note = await db.one('SELECT * FROM notes WHERE id = $1 AND username = $2', 
      [noteId, user.username]);

    // Insert sharing permissions
    await db.none(
      'INSERT INTO note_permissions (note_id, username, can_edit, can_read) VALUES ($1, $2, $3, $4)',
      [noteId, shareWith, canEdit, true]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error sharing note:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});



// *****************************************************
// <!-- Section 5 : Start Server-->
// *****************************************************
// starting the server and keeping the connection open to listen for more requests
app.listen(3000);
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