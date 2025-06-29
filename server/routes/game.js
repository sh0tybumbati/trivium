const express = require('express');
const router = express.Router();

module.exports = (db, gameState) => {
  // Get current game state
  router.get('/state', (req, res) => {
    res.json(gameState.getState());
  });

  // Get game settings
  router.get('/settings', (req, res) => {
    db.getGameSettings((err, settings) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch game settings' });
      }
      res.json(settings || {});
    });
  });

  // Update game settings
  router.put('/settings', (req, res) => {
    const settings = req.body;
    
    db.updateGameSettings(settings, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to update game settings' });
      }
      
      // Update game state with new settings
      gameState.updateSettings(settings);
      
      res.json({ message: 'Settings updated successfully' });
    });
  });

  // Game control endpoints
  router.post('/start', (req, res) => {
    gameState.startGame();
    res.json({ message: 'Game started' });
  });

  router.post('/end', (req, res) => {
    gameState.endGame();
    res.json({ message: 'Game ended' });
  });

  router.post('/next', (req, res) => {
    gameState.nextSlide();
    res.json({ message: 'Next question' });
  });

  router.post('/previous', (req, res) => {
    gameState.prevSlide();
    res.json({ message: 'Previous question' });
  });

  router.post('/show-question', (req, res) => {
    gameState.showQuestion();
    res.json({ message: 'Question shown' });
  });

  router.post('/toggle-answer', (req, res) => {
    gameState.toggleAnswer();
    res.json({ message: 'Answer toggled' });
  });

  router.post('/start-timer', (req, res) => {
    gameState.updateState({ 
      isTimerRunning: true,
      firstQuestionStarted: true
    });
    res.json({ message: 'Timer started' });
  });

  router.post('/stop-timer', (req, res) => {
    gameState.updateState({ isTimerRunning: false });
    res.json({ message: 'Timer stopped' });
  });

  router.post('/reset-timer', (req, res) => {
    gameState.resetTimer();
    res.json({ message: 'Timer reset' });
  });

  // Update specific state properties
  router.patch('/state', (req, res) => {
    const updates = req.body;
    gameState.updateState(updates);
    res.json({ message: 'State updated', state: gameState.getState() });
  });

  return router;
};