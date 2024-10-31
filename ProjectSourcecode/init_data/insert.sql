-- Inserting users to create communities
INSERT INTO users (username, email, password)
VALUES 
('john_doe', 'john@example.com', 'hashedpassword1'),
('jane_doe', 'jane@example.com', 'hashedpassword2');

-- Inserting sample communities
INSERT INTO communities (name, description, profile_picture_url, is_private, access_code, created_by)
VALUES 
('Public Community', 'A community open to everyone.', 'http://example.com/public.jpg', FALSE, NULL, 'john_doe'),
('Private Community', 'A private community that requires an access code.', 'http://example.com/private.jpg', TRUE, 'secret123', 'jane_doe'),
('Another Public Community', 'Another public space for all.', 'http://example.com/public2.jpg', FALSE, NULL, 'john_doe');
