// backend/routes/brackets.js
const express = require('express');
const router = express.Router();
const db = require('../database');

// Get bracket for a sport
router.get('/:sport', async (req, res) => {
  try {
    const { sport } = req.params;
    
    const query = `
      SELECT m.*,
        t1.team_name as team1_name,
        t2.team_name as team2_name,
        tw.team_name as winner_name
      FROM matches m
      LEFT JOIN teams t1 ON m.team1_id = t1.id
      LEFT JOIN teams t2 ON m.team2_id = t2.id
      LEFT JOIN teams tw ON m.winner_id = tw.id
      WHERE m.sport = ?
      ORDER BY m.round, m.match_number
    `;
    
    const [matches] = await db.query(query, [sport]);
    res.json(matches);
  } catch (error) {
    console.error('Error fetching bracket:', error);
    res.status(500).json({ error: 'Failed to fetch bracket' });
  }
});

// Generate bracket from teams
router.post('/generate/:sport', async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { sport } = req.params;
    
    // Get all teams for the sport
    const [teams] = await connection.query(
      'SELECT id, team_name FROM teams WHERE sport = ? ORDER BY id',
      [sport]
    );
    
    if (teams.length < 2) {
      throw new Error('Need at least 2 teams to generate bracket');
    }
    
    // Delete existing matches for this sport
    await connection.query('DELETE FROM matches WHERE sport = ?', [sport]);
    
    // Generate first round matches
    const numTeams = teams.length;
    let matchNumber = 1;
    
    for (let i = 0; i < numTeams; i += 2) {
      const team1 = teams[i];
      const team2 = teams[i + 1] || null;
      
      await connection.query(
        'INSERT INTO matches (sport, round, match_number, team1_id, team2_id) VALUES (?, 1, ?, ?, ?)',
        [sport, matchNumber, team1.id, team2 ? team2.id : null]
      );
      
      matchNumber++;
    }
    
    await connection.commit();
    
    res.json({
      success: true,
      message: 'Bracket generated successfully'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error generating bracket:', error);
    res.status(500).json({ error: error.message || 'Failed to generate bracket' });
  } finally {
    connection.release();
  }
});

// Update match result
router.put('/match/:id', async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    const { winner_id } = req.body;
    
    // Update match
    await connection.query(
      'UPDATE matches SET winner_id = ?, is_completed = TRUE WHERE id = ?',
      [winner_id, id]
    );
    
    // Get match details
    const [matches] = await connection.query(
      'SELECT * FROM matches WHERE id = ?',
      [id]
    );
    
    const match = matches[0];
    
    // Check if we need to create next round match
    const [roundMatches] = await connection.query(
      'SELECT COUNT(*) as total FROM matches WHERE sport = ? AND round = ?',
      [match.sport, match.round]
    );
    
    const [completedMatches] = await connection.query(
      'SELECT COUNT(*) as completed FROM matches WHERE sport = ? AND round = ? AND is_completed = TRUE',
      [match.sport, match.round]
    );
    
    // If all matches in current round are complete, generate next round
    if (completedMatches[0].completed === roundMatches[0].total && roundMatches[0].total > 1) {
      const [winners] = await connection.query(
        'SELECT winner_id FROM matches WHERE sport = ? AND round = ? AND is_completed = TRUE ORDER BY match_number',
        [match.sport, match.round]
      );
      
      let matchNumber = 1;
      for (let i = 0; i < winners.length; i += 2) {
        const team1 = winners[i].winner_id;
        const team2 = winners[i + 1] ? winners[i + 1].winner_id : null;
        
        await connection.query(
          'INSERT INTO matches (sport, round, match_number, team1_id, team2_id) VALUES (?, ?, ?, ?, ?)',
          [match.sport, match.round + 1, matchNumber, team1, team2]
        );
        
        matchNumber++;
      }
    }
    
    await connection.commit();
    
    res.json({
      success: true,
      message: 'Match updated successfully'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating match:', error);
    res.status(500).json({ error: 'Failed to update match' });
  } finally {
    connection.release();
  }
});

// Reset bracket
router.delete('/:sport', async (req, res) => {
  try {
    const { sport } = req.params;
    await db.query('DELETE FROM matches WHERE sport = ?', [sport]);
    res.json({ success: true, message: 'Bracket reset successfully' });
  } catch (error) {
    console.error('Error resetting bracket:', error);
    res.status(500).json({ error: 'Failed to reset bracket' });
  }
});

module.exports = router;