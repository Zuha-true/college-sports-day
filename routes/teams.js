// backend/routes/teams.js
const express = require('express');
const router = express.Router();
const db = require('../database');

// Get all teams for a sport
router.get('/:sport', async (req, res) => {
  try {
    const { sport } = req.params;
    
    const query = `
      SELECT t.*, 
        GROUP_CONCAT(CONCAT(s.name, '|', s.id) SEPARATOR ',') as members
      FROM teams t
      LEFT JOIN team_members tm ON t.id = tm.team_id
      LEFT JOIN students s ON tm.student_id = s.id
      WHERE t.sport = ?
      GROUP BY t.id
      ORDER BY t.created_at
    `;
    
    const [teams] = await db.query(query, [sport]);
    
    // Parse members
    const teamsWithMembers = teams.map(team => ({
      ...team,
      members: team.members ? team.members.split(',').map(m => {
        const [name, id] = m.split('|');
        return { id: parseInt(id), name };
      }) : []
    }));
    
    res.json(teamsWithMembers);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// Create new team
router.post('/', async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { team_name, sport, members } = req.body;
    
    // ADDED: Check if students are already assigned (WITH LOCKING)
    if (members && members.length > 0) {
      const [existingAssignments] = await connection.query(
        `SELECT student_id FROM team_members 
         WHERE student_id IN (?) AND sport = ? 
         FOR UPDATE`, // Locks these rows
        [members, sport]
      );
      
      if (existingAssignments.length > 0) {
        await connection.rollback();
        return res.status(400).json({ 
          error: 'One or more students are already assigned to another team. Please refresh and try again.'
        });
      }
    }
    
    // ADDED: Check if team name exists
    const [existingTeams] = await connection.query(
      'SELECT id FROM teams WHERE team_name = ? AND sport = ? FOR UPDATE',
      [team_name, sport]
    );
    
    if (existingTeams.length > 0) {
      await connection.rollback();
      return res.status(400).json({ 
        error: 'Team name already exists for this sport' 
      });
    }
    
    // Insert team
    const [teamResult] = await connection.query(
      'INSERT INTO teams (team_name, sport) VALUES (?, ?)',
      [team_name, sport]
    );
    
    const teamId = teamResult.insertId;
    
    // Insert team members
    if (members && members.length > 0) {
      const memberValues = members.map(studentId => [teamId, studentId, sport]);
      await connection.query(
        'INSERT INTO team_members (team_id, student_id, sport) VALUES ?',
        [memberValues]
      );
    }
    
    await connection.commit();
    
    res.json({
      success: true,
      id: teamId,
      message: 'Team created successfully'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating team:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ 
        error: 'Conflict: Student already assigned or team name exists. Please refresh and try again.' 
      });
    } else if (error.code === 'ER_LOCK_WAIT_TIMEOUT') {
      res.status(503).json({ 
        error: 'Server busy. Please wait a moment and try again.' 
      });
    } else {
      res.status(500).json({ error: 'Failed to create team' });
    }
  } finally {
    connection.release();
  }
});

// Delete team
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM teams WHERE id = ?', [id]);
    res.json({ success: true, message: 'Team deleted successfully' });
  } catch (error) {
    console.error('Error deleting team:', error);
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

// Update team
router.put('/:id', async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    const { team_name, members, sport } = req.body;
    
    // Update team name
    await connection.query(
      'UPDATE teams SET team_name = ? WHERE id = ?',
      [team_name, id]
    );
    
    // Delete existing members
    await connection.query('DELETE FROM team_members WHERE team_id = ?', [id]);
    
    // Insert new members
    if (members && members.length > 0) {
      const memberValues = members.map(studentId => [id, studentId, sport]);
      await connection.query(
        'INSERT INTO team_members (team_id, student_id, sport) VALUES ?',
        [memberValues]
      );
    }
    
    await connection.commit();
    
    res.json({ success: true, message: 'Team updated successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating team:', error);
    res.status(500).json({ error: 'Failed to update team' });
  } finally {
    connection.release();
  }
});

module.exports = router;