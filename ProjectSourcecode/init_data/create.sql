CREATE TABLE IF NOT EXISTS users(
username VARCHAR(50) PRIMARY KEY,
profile_photo_url VARCHAR(255); -- profile photo url
email VARCHAR(50) NOT NULL,
password CHAR(60) NOT NULL
);

CREATE TABLE IF NOT EXISTS notes(
id SERIAL PRIMARY KEY,
title VARCHAR(50) NOT NULL,
content TEXT NOT NULL,
username VARCHAR(50) NOT NULL,
category VARCHAR(50) NOT NULL
);


CREATE TABLE IF NOT EXISTS communities (
    community_id SERIAL PRIMARY KEY, -- ID of the communtiy 
    name VARCHAR(30) NOT NULL, -- name of community 
    description VARCHAR(255), -- description of community
    community_photo_url VARCHAR(255); -- profile photo url
    number_of_members INTEGER -- # Of members
    created_by INTEGER NOT NULL,  -- ID of the user who created the community
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Date community was created
    privacy_status VARCHAR(10) DEFAULT 'Public',  -- e.g., Public, Private, Secret
    FOREIGN KEY (created_by) REFERENCES users(user_id)  -- assuming users table exists
    
);

CREATE TABLE IF NOT EXISTS friends (
    user1 VARCHAR(50),-- user 1 
    user2 VARCHAR(50), -- user 2 
    status VARCHAR(20) DEFAULT 'pending', -- status of friends request
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- time of which friend request was requested 
    accepted_at TIMESTAMP NULL, -- time of which friend request was accepted
    PRIMARY KEY (user1, user2), -- establishes a unique id between user1 and user 2 frienship
    FOREIGN KEY (user1) REFERENCES users(username) ON DELETE CASCADE,-- delete from is account is deleted 
    FOREIGN KEY (user2) REFERENCES users(username) ON DELETE CASCADE -- delete from is account is deleted 
);

CREATE TABLE IF NOT EXISTS community_members (
    community_id INTEGER NOT NULL,--id of community Joined 
    user_id INTEGER NOT NULL, --
    role VARCHAR(20) DEFAULT 'Member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (community_id, user_id),
    FOREIGN KEY (community_id) REFERENCES communities(community_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);


