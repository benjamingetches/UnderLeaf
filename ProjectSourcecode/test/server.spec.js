// ********************** Initialize server **********************************

const server = require('../index'); //TODO: Make sure the path to your index.js is correctly added

// ********************** Import Libraries ***********************************

const chai = require('chai'); // Chai HTTP provides an interface for live integration testing of the API's.
const chaiHttp = require('chai-http');
chai.should();
chai.use(chaiHttp);
const {assert, expect} = chai;

// ********************** DEFAULT WELCOME TESTCASE ****************************




describe('Server!', () => {
  // Sample test case given to test / endpoint.
  it('Returns the default welcome message', done => {
    chai
      .request(server)
      .get('/welcome')
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.body.status).to.equals('success');
        assert.strictEqual(res.body.message, 'Welcome!');
        done();
      });
  });
});

// *********************** TODO: WRITE 2 UNIT TESTCASES **************************

// ********************************************************************************

// Example Positive Testcase :
// API: /add_user
// Input: {id: 5, name: 'John Doe', dob: '2020-02-20'}
// Expect: res.status == 200 and res.body.message == 'Success'
// Result: This test case should pass and return a status 200 along with a "Success" message.
// Explanation: The testcase will call the /add_user API with the following input
// and expects the API to return a status of 200 along with the "Success" message.

describe('Testing Add User API', () => {
    it('positive : /register', done => {
      chai
        .request(server)
        .post('/register')
        .send({username: 'testuser123', email: 'testuser123@test.com', password: 'testpassword123'})
        .end((err, res) => {
          expect(res).to.have.status(200);
          expect(res).to.redirectTo(/\/login/);  // Check for redirect to login
          done();
        });
    });
    it('negative : /register - duplicate username', done => {
        // First register a user
        chai
            .request(server)
            .post('/register')
            .send({username: 'testuser6', email: 'testuser6@test.com', password: 'testpassword6'})
            .end(() => {
                // Try to register same username again
                chai
                    .request(server)
                    .post('/register')
                    .send({username: 'testuser6', email: 'different@test.com', password: 'testpassword6'})
                    .end((err, res) => {
                        expect(res).to.have.status(409);
                        expect(res.text).to.include('Username/email already exists');
                        done();
                    });
            });
    });
});

describe('Testing Login API', () => {
    it('positive: /login - successful login', done => {
        // First register a test user
        chai
            .request(server)
            .post('/register')
            .send({username: '1234test', email: '1234logintest@test.com', password: '1234testpass1234'})
            .end(() => {
                // Then try to login with that user
                chai
                    .request(server)
                    .post('/login')
                    .send({username: '1234test', password: '1234testpass1234'})
                    .end((err, res) => {
                        expect(res).to.have.status(200);
                        expect(res).to.redirectTo(/\/editor/);  // Check for redirect to editor
                        done();
                    });
            });
    });

    it('negative: /login - invalid password', done => {
        chai
            .request(server)
            .post('/login')
            .send({username: 'logintest', password: 'wrongpassword'})
            .end((err, res) => {
                expect(res).to.have.status(401);
                done();
            });
    });
});


describe('Testing Logout API', () => {
        it('positive: /logout - successful logout', done => {
            // Register and login a user first
            chai
                .request(server)
                .post('/register')
                .send({ username: 'logoutuser', email: 'logout@test.com', password: 'testlogout123' })
                .end(() => {
                    chai
                        .request(server)
                        .post('/login')
                        .send({ username: 'logoutuser', password: 'testlogout123' })
                        .end(() => {
                            // Logout the user
                            chai
                                .request(server)
                                .get('/logout')
                                .end((err, res) => {
                                    expect(res).to.have.status(200); // Expecting a 200 status
                                    expect(res.text).to.include('You have been logged out successfully'); // Check for confirmation message
                                    done();
                                });
                        });
                });
        });
    
        it('negative: /logout - logout without being logged in', done => {
            // Attempt to logout without a session
            chai
                .request(server)
                .get('/logout')
                .end((err, res) => {
                    expect(res).to.have.status(200); // Still returns 200 since no redirect or error handling for unauthorized logout
                    expect(res.text).to.include('You have been logged out successfully'); // Same message as when logged out
                    done();
                });
        });
    });


    describe('Friend Request API Tests', () => {
        let agent;
    
        // Generate unique usernames for each test run
        const uniqueId = Date.now();
        const testuser1 = `testuser1_${uniqueId}`;
        const testuser2 = `testuser2_${uniqueId}`;
    
        beforeEach((done) => {
            agent = chai.request.agent(server);
            // First create and login testuser1
            agent
                .post('/register')
                .send({
                    username: testuser1,
                    email: `${testuser1}@test.com`,
                    password: 'testpass1'
                })
                .end(() => {
                    agent
                        .post('/login')
                        .send({
                            username: testuser1,
                            password: 'testpass1'
                        })
                        .end(() => {
                            done();
                        });
                });
        });
    
        afterEach(async () => {
            await agent.close();
        });
        it('positive: sending a friend request', (done) => {
            // Create testuser2
            agent
                .post('/register')
                .send({
                    username: testuser2,
                    email: `${testuser2}@test.com`,
                    password: 'testpass2'
                })
                .end(() => {
                    // Login back as testuser1
                    agent
                        .post('/login')
                        .send({
                            username: testuser1,
                            password: 'testpass1'
                        })
                        .end(() => {
                            // Send friend request and do not follow redirects automatically
                            agent
                                .post('/send-friend-request')
                                .redirects(0)
                                .send({ addressee: testuser2 })
                                .end((err, res) => {
                                    expect(res).to.have.status(302); // Expecting redirect
                                    const decodedLocation = decodeURIComponent(res.header.location);
                                    expect(decodedLocation).to.match(/\/friends\?message=Friend request sent$/);
                                    done();
                                });
                        });
                });
        });
        
        it('negative: sending friend request to non-existent user', (done) => {
            // Attempt to send friend request to a user who doesn't exist
            agent
                .post('/send-friend-request')
                .redirects(0)
                .send({ addressee: `nonexistentuser_${uniqueId}` })
                .end((err, res) => {
                    expect(res).to.have.status(302); // Expecting redirect
                    const decodedLocation = decodeURIComponent(res.header.location);
                    expect(decodedLocation).to.match(/\/friends\?message=User not found$/);
                    done();
                });
        });

});


describe('Testing Communities Page API', () => {
    let agent;
    const uniqueId = Date.now();
    const testuser = `communityuser_${uniqueId}`;

    beforeEach((done) => {
        agent = chai.request.agent(server);
        // Register and login the test user
        agent
            .post('/register')
            .send({
                username: testuser,
                email: `${testuser}@test.com`,
                password: 'testpass123'
            })
            .end(() => {
                agent
                    .post('/login')
                    .send({
                        username: testuser,
                        password: 'testpass123'
                    })
                    .end(() => {
                        done();
                    });
            });
    });

    afterEach(async () => {
        await agent.close();
    });

    it('positive: /communities - successfully loads communities page after login', done => {
        agent
            .get('/communities')
            .end((err, res) => {
                expect(res).to.have.status(200);
                expect(res.text).to.include('Communities');
                done();
            });
    });

    // The negative test case remains largely the same
    it('negative: /communities - fails to load communities page without login', done => {
        chai
            .request(server)
            .get('/communities')
            .end((err, res) => {
                expect(res).to.have.status(200);
                expect(res.text).to.include('Login');
                done();
            });
    });
});


describe('Testing Save Note API', () => {
    let agent;
    const uniqueId = Date.now();
    const testuser = `noteuser_${uniqueId}`;
    const testuser2 = `noteuser2_${uniqueId}`;

    beforeEach((done) => {
        agent = chai.request.agent(server);
        // Register and login the test user
        agent
            .post('/register')
            .send({
                username: testuser,
                email: `${testuser}@test.com`,
                password: 'testpass123'
            })
            .end(() => {
                agent
                    .post('/login')
                    .send({
                        username: testuser,
                        password: 'testpass123'
                    })
                    .end(() => {
                        done();
                    });
            });
    });

    afterEach(async () => {
        await agent.close();
    });

    it('positive: /save-latex - successfully creates new note', done => {
        const noteData = {
            title: `Test Note ${uniqueId}`,
            content: 'Test content with some $\\LaTeX$ math',
            username: testuser,
            category: 'test'
        };

        agent
            .post('/save-latex')
            .send(noteData)
            .end((err, res) => {
                expect(res).to.have.status(201);
                expect(res.body.success).to.be.true;
                expect(res.body).to.have.property('noteId');
                expect(res.body.message).to.equal('Note created successfully');
                done();
            });
    });

    it('positive: /save-latex - successfully updates existing note', done => {
        const noteData = {
            title: `Test Note Update ${uniqueId}`,
            content: 'Initial content',
            username: testuser,
            category: 'test'
        };

        // First create a note
        agent
            .post('/save-latex')
            .send(noteData)
            .end((err, res) => {
                const noteId = res.body.noteId;
                
                // Then update it
                const updatedData = {
                    ...noteData,
                    content: 'Updated content',
                    noteId: noteId
                };

                agent
                    .post('/save-latex')
                    .send(updatedData)
                    .end((err, res) => {
                        expect(res).to.have.status(200);
                        expect(res.body.success).to.be.true;
                        expect(res.body.message).to.equal('Note updated successfully');
                        expect(res.body.noteId).to.equal(noteId);
                        done();
                    });
            });
    });

    it('negative: /save-latex - fails to update note without permission', done => {
        // First create a note with testuser
        const noteData = {
            title: `Test Note Permission ${uniqueId}`,
            content: 'Initial content',
            username: testuser,
            category: 'test'
        };

        agent
            .post('/save-latex')
            .send(noteData)
            .end((err, res) => {
                const noteId = res.body.noteId;
                
                // Create and login as second user
                const agent2 = chai.request.agent(server);
                agent2
                    .post('/register')
                    .send({
                        username: testuser2,
                        email: `${testuser2}@test.com`,
                        password: 'testpass123'
                    })
                    .end(() => {
                        agent2
                            .post('/login')
                            .send({
                                username: testuser2,
                                password: 'testpass123'
                            })
                            .end(() => {
                                // Try to update first user's note
                                const unauthorizedUpdate = {
                                    ...noteData,
                                    username: testuser2,
                                    noteId: noteId,
                                    content: 'Unauthorized update'
                                };

                                agent2
                                    .post('/save-latex')
                                    .send(unauthorizedUpdate)
                                    .end((err, res) => {
                                        expect(res).to.have.status(403);
                                        expect(res.body.success).to.be.false;
                                        expect(res.body.error).to.equal('No permission to edit');
                                        agent2.close();
                                        done();
                                    });
                            });
                    });
            });
    });
});
