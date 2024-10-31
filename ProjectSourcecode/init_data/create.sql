CREATE TABLE IF NOT EXISTS users(
username VARCHAR(50) PRIMARY KEY,
email VARCHAR(50) NOT NULL,
password CHAR(60) NOT NULL
profile_photo_url VARCHAR(255), -- URL for the friend's profile photo
);

CREATE TABLE IF NOT EXISTS notes(
id SERIAL PRIMARY KEY,
title VARCHAR(50) NOT NULL,
content TEXT NOT NULL,
username VARCHAR(50) NOT NULL,
category VARCHAR(50) NOT NULL
);

-- TODO: communities table
CREATE TABLE IF NOT EXISTS communities (
    community_id SERIAL PRIMARY KEY, -- unique id of identification for the communtiy
    name VARCHAR(100) NOT NULL, -- name of the communtiy
    description TEXT, -- The description of the community 
    Community_picture_url VARCHAR(255), -- community picture
    is_private BOOLEAN DEFAULT FALSE, -- whether the communtiy is public or private 
    access_code VARCHAR(50), -- Optional; used only if is_private = TRUE
    created_by VARCHAR(50) REFERENCES users(username) ON DELETE SET NULL, -- Links community to its creator
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP -- Tracks community creation date
);

CREATE TABLE IF NOT EXISTS community_memberships (
    community_id INT REFERENCES communities(community_id) ON DELETE CASCADE, -- foreign key to link this table to community table
    username VARCHAR(50) REFERENCES users(username) ON DELETE CASCADE, -- foreign key to link 
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- Tracks when user joined the community
    is_admin BOOLEAN DEFAULT FALSE, -- Indicates if the user is an admin of the community
    PRIMARY KEY (community_id, username) -- Ensures unique membership entries per community
);


-- TODO: friends table

CREATE TABLE IF NOT EXISTS friends (
    username VARCHAR(50) REFERENCES users(username) ON DELETE CASCADE, -- Establishes a foreign key relationships with users tabel
    friend_username VARCHAR(50) REFERENCES users(username) ON DELETE CASCADE, -- Establishes a foreign key relationships with users tabel
    status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending', -- Tracks friend request status
    request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- Tracks the date the request was made
    PRIMARY KEY (username, friend_username), -- Ensures unique friend relationships
    CONSTRAINT fk_user_friends CHECK (username <> friend_username) -- Prevents users from friending themselves
);


