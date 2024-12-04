CREATE TABLE IF NOT EXISTS users(
username VARCHAR(50) PRIMARY KEY,
email VARCHAR(50) NOT NULL,
password CHAR(60) NOT NULL,
profile_photo_url VARCHAR(255), -- URL for the friend's profile photo
is_premium BOOLEAN DEFAULT FALSE,
ai_credits INTEGER DEFAULT 10,
last_credit_reset TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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

CREATE TABLE IF NOT EXISTS templates(
id SERIAL PRIMARY KEY,
title VARCHAR(50) NOT NULL,
content TEXT NOT NULL,
username VARCHAR(50) NOT NULL REFERENCES users(username),
category VARCHAR(50) NOT NULL,
created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS template_permissions (
    template_id INT REFERENCES templates(id) ON DELETE CASCADE,
    username VARCHAR(50) REFERENCES users(username) ON DELETE CASCADE,
    can_edit BOOLEAN DEFAULT FALSE,
    can_read BOOLEAN DEFAULT TRUE,
    shared_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (template_id, username)
);

-- TODO: communities table
CREATE TABLE IF NOT EXISTS communities (
    community_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL, 
    description TEXT, 
    Community_picture_url VARCHAR(255), 
    is_private BOOLEAN DEFAULT FALSE, --  public or private 
    access_code VARCHAR(50), 
    created_by VARCHAR(50) REFERENCES users(username) ON DELETE SET NULL, -- Links community to its creator
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP 
);

CREATE TABLE IF NOT EXISTS community_roles (
    role_id SERIAL PRIMARY KEY, 
    role_name VARCHAR(50) UNIQUE NOT NULL, 
    description TEXT 
);

CREATE TABLE IF NOT EXISTS community_memberships (
    community_id INTEGER REFERENCES communities(community_id) ON DELETE CASCADE,
    username VARCHAR(50) REFERENCES users(username) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (community_id, username)
);

CREATE TABLE IF NOT EXISTS community_messages (
    message_id SERIAL PRIMARY KEY, 
    community_id INT REFERENCES communities(community_id) ON DELETE CASCADE, -- Links message to the community
    username VARCHAR(50) REFERENCES users(username) ON DELETE CASCADE, -- Links message to the sender
    content TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
    title VARCHAR(255) NOT NULL
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


CREATE TABLE IF NOT EXISTS community_notes (
    community_id INTEGER REFERENCES communities(community_id) ON DELETE CASCADE,
    note_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
    shared_by VARCHAR(50) REFERENCES users(username) ON DELETE CASCADE,
    is_public BOOLEAN DEFAULT FALSE,
    shared_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (community_id, note_id)
);
CREATE TABLE IF NOT EXISTS community_announcements (
    id SERIAL PRIMARY KEY,
    community_id INTEGER REFERENCES communities(community_id),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_by VARCHAR(50) REFERENCES users(username),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- changed mesdsages and announcements 
CREATE TABLE IF NOT EXISTS direct_messages (
    id SERIAL PRIMARY KEY,
    community_id INTEGER REFERENCES communities(community_id),
    from_user VARCHAR(50) REFERENCES users(username),
    to_user VARCHAR(50) REFERENCES users(username),
    content TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN DEFAULT FALSE
);