// backend/routes/students.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { verifyAdmin } = require('./auth');

// Get all students
router.get('/', async (req, res) => {
  try {
    const [students] = await db.query('SELECT * FROM students ORDER BY name');
    res.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Get students by sport (excluding already assigned ones)
router.get('/by-sport/:sport', async (req, res) => {
  try {
    const { sport } = req.params;
    const query = `
      SELECT s.* FROM students s
      WHERE s.${sport} = TRUE
      AND s.id NOT IN (
        SELECT student_id FROM team_members WHERE sport = ?
      )
      ORDER BY s.name
    `;
    const [students] = await db.query(query, [sport]);
    res.json(students);
  } catch (error) {
    console.error('Error fetching students by sport:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Register new student (admin only)
router.post('/', async (req, res) => {
  try {
    const {
      name,
      roll_number,
      email,
      phone,
      cricket,
      throwball,
      kho_kho,
      badminton_doubles,
      relay,
      tug_of_war
    } = req.body;

    const query = `
      INSERT INTO students 
      (name, roll_number, email, phone, cricket, throwball, kho_kho, badminton_doubles, relay, tug_of_war)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.query(query, [
      name,
      roll_number,
      email || null,
      phone || null,
      cricket || false,
      throwball || false,
      kho_kho || false,
      badminton_doubles || false,
      relay || false,
      tug_of_war || false
    ]);

    res.json({
      success: true,
      id: result.insertId,
      message: 'Student registered successfully'
    });
  } catch (error) {
    console.error('Error registering student:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Roll number already exists' });
    } else {
      res.status(500).json({ error: 'Failed to register student' });
    }
  }
});

// Update student
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      roll_number,
      email,
      phone,
      cricket,
      throwball,
      kho_kho,
      badminton_doubles,
      relay,
      tug_of_war
    } = req.body;

    const query = `
      UPDATE students SET
      name = ?, roll_number = ?, email = ?, phone = ?,
      cricket = ?, throwball = ?, kho_kho = ?,
      badminton_doubles = ?, relay = ?, tug_of_war = ?
      WHERE id = ?
    `;

    await db.query(query, [
      name,
      roll_number,
      email,
      phone,
      cricket,
      throwball,
      kho_kho,
      badminton_doubles,
      relay,
      tug_of_war,
      id
    ]);

    res.json({ success: true, message: 'Student updated successfully' });
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(500).json({ error: 'Failed to update student' });
  }
});

// Delete student
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM students WHERE id = ?', [id]);
    res.json({ success: true, message: 'Student deleted successfully' });
  } catch (error) {
    console.error('Error deleting student:', error);
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

module.exports = router;