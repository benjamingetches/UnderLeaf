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
    const note = await db.one('SELECT * FROM notes WHERE id = $1 AND username = $2', [noteId, user.username]);
    console.log(note); // Check if note is being fetched correctly
    res.render('pages/editor', { user, note }); // Make sure 'note' is passed to the template
  } catch (error) {
    console.error('Error fetching note:', error);
    res.status(500).send('Error fetching note');
  }
});

app.get('/notes', async (req, res) => {
    // get the user from the session, get their notes, pass as context to the page
    const user = req.session.user;
    const notes = await db.any('SELECT id, title FROM notes WHERE username = $1', [
        user.username,
    ]);
    res.render('pages/notes', { user, notes });
});

app.delete('/delete-note/:id', async (req, res) => {
  const noteId = req.params.id;
  const user = req.session.user;

  try {
    // Ensure the note belongs to the user
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
  const { title, content, username, category } = req.body;

  try {
    // Check if a note with the same title and username exists
    const existingNote = await db.oneOrNone(
      'SELECT id FROM notes WHERE title = $1 AND username = $2',
      [title, username]
    );

    if (existingNote) {
      // Update the existing note
      await db.none(
        'UPDATE notes SET content = $1, category = $2 WHERE id = $3',
        [content, category, existingNote.id]
      );
    } else {
      // Insert a new note
      await db.none(
        'INSERT INTO notes (title, content, username, category) VALUES ($1, $2, $3, $4)',
        [title, content, username, category]
      );
    }

    res.status(200).send('Note saved');
  } catch (error) {
    console.error('Error saving note:', error);
    res.status(500).send('Error saving note');
  }
});


// Route to get all notes for the logged-in user
app.get('/get-notes', async (req, res) => {
  const user = req.session.user;

  try {
    const notes = await db.any('SELECT id, title FROM notes WHERE username = $1', [user.username]);
    res.json(notes); // Send the list of notes as JSON
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).send('Error fetching notes');
  }
});

// Route to get a specific note's content by ID
app.get('/get-note/:id', async (req, res) => {
  const noteId = req.params.id;

  try {
    const note = await db.one('SELECT title, content FROM notes WHERE id = $1', [noteId]);
    res.json(note); // Send the note content and title as JSON
  } catch (error) {
    console.error('Error fetching note:', error);
    res.status(500).send('Error fetching note');
  }
});


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


// *****************************************************
// <!-- Section 5 : Start Server-->
// *****************************************************
// starting the server and keeping the connection open to listen for more requests
app.listen(3000);
console.log('Server is listening on port 3000');