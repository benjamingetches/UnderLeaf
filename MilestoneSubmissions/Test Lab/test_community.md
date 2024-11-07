# User Acceptance Test Plan: Community Features

## Test Environment
- **Environment**: Local development environment (localhost:3000)
- **Browser**: Latest versions of Chrome, Firefox and Safari
- **Database**: PostgreSQL database with test data
- **Test Users**: Minimum 3 test accounts required for community testing

### Test Data Setup
1. Test User Accounts:
   - User1: username="testuser1", password="testpass1", email="test1@test.com"
   - User2: username="testuser2", password="testpass2", email="test2@test.com" 
   - User3: username="testuser3", password="testpass3", email="test3@test.com"

2. Sample Notes:
   ```
   Title: "Calculus Notes"
   Content: "# Derivatives\n## Power Rule\n..."
   Category: "Math"
   ```
   ```
   Title: "Chemistry Notes" 
   Content: "# Chemical Bonds\n## Ionic Bonds\n..."
   Category: "Science"
   ```

### Test Cases

#### TC1: Public Note Discovery
**Description**: Test ability to discover and view public notes from other users

**Steps**:
1. Login as User1
2. Create note and mark as public
3. Login as User2 
4. Navigate to community page
5. Search for User1's note
6. Open and view the note

**Expected Results**:
- Public note appears in community search results
- Note content viewable by User2
- Note metadata (author, category) displayed correctly
- Read-only access enforced

#### TC2: Note Rating System
**Description**: Test the note rating and feedback functionality

**Steps**:
1. Login as User1
2. Create and publish public note
3. Login as User2
4. Find and open User1's note
5. Rate note (1-5 stars)
6. Add written feedback
7. Submit rating/feedback
8. Login as User1 to view received feedback

**Expected Results**:
- Rating submission successful
- Average rating updates correctly
- Feedback visible to note author
- Rating analytics visible on community dashboard

#### TC3: Category-based Note Discovery
**Description**: Test note categorization and filtering

**Steps**:
1. Login as User1, User2, User3
2. Each user creates notes in different categories
3. Navigate to community page
4. Test category filters
5. Test combined category + search filters
6. Verify note listing order

**Expected Results**:
- Notes properly categorized
- Category filters work correctly
- Search within categories functions
- Notes sorted by relevance/rating
- Category statistics accurate

### Test Participants
- **Primary Testers**: Development team members
- **Secondary Testers**: 3-4 students from target user group
- **Test Coordinator**: Project manager

### Success Criteria
1. All test cases pass successfully
2. Community features perform consistently
3. Note discovery works efficiently
4. Rating system functions accurately
5. User interface is intuitive
6. Performance meets requirements

### Test Schedule
- **Duration**: 3 days
- **Day 1**: Execute TC1
- **Day 2**: Execute TC2
- **Day 3**: Execute TC3 and regression testing

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
- Community features working as designed
