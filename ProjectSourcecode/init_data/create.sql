CREATE TABLE IF NOT EXISTS users(
username VARCHAR(50) PRIMARY KEY,
email VARCHAR(50) NOT NULL,
password CHAR(60) NOT NULL,
profile_photo_url VARCHAR(255) -- URL for the friend's profile photo
);

CREATE TABLE IF NOT EXISTS notes(
id SERIAL PRIMARY KEY,
title VARCHAR(50) NOT NULL,
content TEXT NOT NULL,
username VARCHAR(50) NOT NULL REFERENCES users(username),
category VARCHAR(50) NOT NULL,
created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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

CREATE TABLE IF NOT EXISTS community_roles (
    role_id SERIAL PRIMARY KEY, -- Unique identifier for each role
    role_name VARCHAR(50) UNIQUE NOT NULL, -- Role name (e.g., "Admin", "Moderator", "Member")
    description TEXT -- Description of the role and its permissions
);

CREATE TABLE IF NOT EXISTS community_user_roles (
    community_id INT REFERENCES communities(community_id) ON DELETE CASCADE,
    username VARCHAR(50) REFERENCES users(username) ON DELETE CASCADE,
    role_id INT REFERENCES community_roles(role_id) ON DELETE SET NULL,
    PRIMARY KEY (community_id, username)
);

CREATE TABLE IF NOT EXISTS community_messages (
    message_id SERIAL PRIMARY KEY, -- Unique identifier for each message
    community_id INT REFERENCES communities(community_id) ON DELETE CASCADE, -- Links message to the community
    username VARCHAR(50) REFERENCES users(username) ON DELETE CASCADE, -- Links message to the sender
    content TEXT NOT NULL, -- The message content
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- Timestamp for when the message was sent
    edited_at TIMESTAMP WITH TIME ZONE -- Optional; to track if the message was edited
);

-- TODO: friends table


CREATE TYPE friend_status AS ENUM ('pending', 'accepted', 'rejected');

CREATE TABLE IF NOT EXISTS friends (
    id SERIAL PRIMARY KEY,
    requester VARCHAR(50) REFERENCES users(username) ON DELETE CASCADE,
    addressee VARCHAR(50) REFERENCES users(username) ON DELETE CASCADE,
    status friend_status DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(requester, addressee),
    CONSTRAINT different_users CHECK (requester <> addressee)
);

CREATE TABLE IF NOT EXISTS note_permissions (
    note_id INT REFERENCES notes(id) ON DELETE CASCADE,
    username VARCHAR(50) REFERENCES users(username) ON DELETE CASCADE,
    can_edit BOOLEAN DEFAULT FALSE,
    can_read BOOLEAN DEFAULT TRUE,
    shared_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (note_id, username)
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token VARCHAR(64) PRIMARY KEY,
    username VARCHAR(50) REFERENCES users(username),
    expiration_timestamp TIMESTAMP WITH TIME ZONE,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);