# User Acceptance Test Plan: Note Collaboration Feature

## Feature: Note Sharing and Collaborative Editing

### Test Environment
- **Environment**: Local development environment (localhost:3000)
- **Browser**: Latest versions of Chrome, Firefox and Safari
- **Database**: PostgreSQL database with test data
- **Test Users**: Minimum 2 test accounts required for collaboration testing

### Test Data Setup
1. Test User Accounts:
   - User1: username="testuser1", password="testpass1", email="test1@test.com"
   - User2: username="testuser2", password="testpass2", email="test2@test.com"

2. Sample Note Content:
   ```
   Title: "Physics Notes"
   Content: "# Introduction to Physics\n## Newton's Laws\n1. First Law..."
   Category: "Science"
   ```

### Test Cases

#### TC1: Share Note with Edit Permissions
**Description**: Test sharing a note with another user with edit permissions

**Steps**:
1. Login as User1
2. Create a new note with the sample content
3. Click share button for the created note
4. Enter User2's username
5. Select "Can Edit" permission
6. Click "Share" button

**Expected Results**:
- Success message appears confirming note was shared
- Note appears in User2's shared notes list
- Database shows correct permission entry for User2

#### TC2: Collaborative Editing
**Description**: Test simultaneous editing capabilities

**Steps**:
1. Login as User1 in Browser 1
2. Login as User2 in Browser 2
3. Both users open the shared note
4. User1 adds content at the top
5. User2 adds content at the bottom
6. Both users save changes

**Expected Results**:
- Both users can see each other's changes
- No content is lost or overwritten
- Final note contains both users' additions

#### TC3: Permission Revocation
**Description**: Test removing share permissions

**Steps**:
1. Login as User1
2. Navigate to note sharing settings
3. Remove User2's access
4. Login as User2
5. Attempt to access the previously shared note

**Expected Results**:
- User2 can no longer access the note
- Note disappears from User2's shared notes list
- Appropriate error/notification shown to User2

### Test Participants
- **Primary Testers**: Development team members
- **Secondary Testers**: 2-3 students/users not involved in development
- **Test Coordinator**: Project manager/team lead

### Success Criteria
1. All test cases pass successfully
2. No data loss during collaborative editing
3. Permissions system works as intended
4. User interface provides clear feedback
5. Feature works consistently across different browsers

### Test Schedule
- **Duration**: 2 days
- **Day 1**: Execute TC1 and TC2
- **Day 2**: Execute TC3 and regression testing

### Bug Reporting
Bugs will be documented with:
- Test case reference
- Steps to reproduce
- Expected vs actual results
- Screenshots/recordings
- Browser/environment details

### Sign-off Criteria
- All test cases executed successfully
- No high-priority bugs remaining
- Performance meets requirements
- All testers approve functionality
