-- Inserting sample users
INSERT INTO users (username, email, password)
VALUES 
('john_doe', 'john@example.com', 'hashedpassword1'),
('jane_doe', 'jane@example.com', 'hashedpassword2'),
('alice_smith', 'alice@example.com', 'hashedpassword3'),
('bob_brown', 'bob@example.com', 'hashedpassword4'),
('carol_white', 'carol@example.com', 'hashedpassword5');

-- Inserting sample communities
INSERT INTO communities (name, description, is_private, access_code, created_by)
VALUES 
('Public Community', 'A community open to everyone.', FALSE, NULL, 'john_doe'),
('Private Community', 'A private community that requires an access code.', TRUE, 'secret123', 'jane_doe'),
('Another Public Community', 'Another public space for all.', FALSE, NULL, 'alice_smith');

-- Inserting sample friends relationships
-- john_doe is friends with jane_doe and alice_smith
-- jane_doe is friends with bob_brown
-- alice_smith is friends with carol_white
INSERT INTO friends (username, friend_username)
VALUES
('john_doe', 'jane_doe'),
('john_doe', 'alice_smith'),
('jane_doe', 'bob_brown'),
('alice_smith', 'carol_white'),
('bob_brown', 'john_doe'); -- Test circular friendship for verification

