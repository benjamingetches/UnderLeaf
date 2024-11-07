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


