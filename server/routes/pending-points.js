const express = require('express');
const router = express.Router();

module.exports = (db, wss) => {
  // Award pending points for write-in questions
  router.post('/award', (req, res) => {
    const { playerId, questionId, points, playerName, answer } = req.body;

    if (!playerId || !questionId || typeof points !== 'number' || !playerName || !answer) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Use INSERT OR REPLACE to handle both new and existing records
    db.addPendingPoints(playerId, questionId, points, playerName, answer, (err, pendingPoint) => {
      if (err) {
        console.error('Error setting pending points:', err);
        return res.status(500).json({ error: 'Failed to set pending points' });
      }

      // Broadcast pending points update to all WebSocket clients
      if (wss) {
        const message = JSON.stringify({
          type: 'pending_points_updated',
          playerId: playerId,
          questionId: questionId,
          points: points,
          playerName: playerName,
          answer: answer
        });
        
        wss.clients.forEach(client => {
          if (client.readyState === client.OPEN) {
            client.send(message);
          }
        });
      }

      res.json({ success: true, message: 'Pending points set', data: pendingPoint });
    });
  });

  // Get pending points for a question
  router.get('/question/:questionId', (req, res) => {
    const questionId = parseInt(req.params.questionId);

    if (isNaN(questionId)) {
      return res.status(400).json({ error: 'Invalid question ID' });
    }

    db.getPendingPointsForQuestion(questionId, (err, pendingPoints) => {
      if (err) {
        console.error('Error fetching pending points:', err);
        return res.status(500).json({ error: 'Failed to fetch pending points' });
      }
      res.json(pendingPoints);
    });
  });

  // Commit pending points for a question (when answer is revealed)
  router.post('/commit/:questionId', (req, res) => {
    const questionId = parseInt(req.params.questionId);

    if (isNaN(questionId)) {
      return res.status(400).json({ error: 'Invalid question ID' });
    }

    db.commitPendingPointsForQuestion(questionId, (err, scoreUpdates) => {
      if (err) {
        console.error('Error committing pending points:', err);
        return res.status(500).json({ error: 'Failed to commit pending points' });
      }

      // Broadcast score updates to all WebSocket clients
      if (wss && scoreUpdates.length > 0) {
        scoreUpdates.forEach(update => {
          const message = JSON.stringify({
            type: 'player_score_updated',
            playerId: update.playerId,
            score: update.newScore
          });
          
          wss.clients.forEach(client => {
            if (client.readyState === client.OPEN) {
              client.send(message);
            }
          });
        });

        // Also broadcast that pending points were committed
        const commitMessage = JSON.stringify({
          type: 'pending_points_committed',
          questionId: questionId,
          scoreUpdates: scoreUpdates
        });
        
        wss.clients.forEach(client => {
          if (client.readyState === client.OPEN) {
            client.send(commitMessage);
          }
        });
      }

      res.json({ success: true, scoreUpdates });
    });
  });

  // Clear pending points for a question
  router.delete('/question/:questionId', (req, res) => {
    const questionId = parseInt(req.params.questionId);

    if (isNaN(questionId)) {
      return res.status(400).json({ error: 'Invalid question ID' });
    }

    db.clearPendingPointsForQuestion(questionId, (err) => {
      if (err) {
        console.error('Error clearing pending points:', err);
        return res.status(500).json({ error: 'Failed to clear pending points' });
      }

      // Broadcast pending points cleared to all WebSocket clients
      if (wss) {
        const message = JSON.stringify({
          type: 'pending_points_cleared',
          questionId: questionId
        });
        
        wss.clients.forEach(client => {
          if (client.readyState === client.OPEN) {
            client.send(message);
          }
        });
      }

      res.json({ success: true });
    });
  });

  // Clear all pending points
  router.delete('/clear-all', (req, res) => {
    db.clearAllPendingPoints((err) => {
      if (err) {
        console.error('Error clearing all pending points:', err);
        return res.status(500).json({ error: 'Failed to clear all pending points' });
      }

      // Broadcast all pending points cleared to all WebSocket clients
      if (wss) {
        const message = JSON.stringify({
          type: 'all_pending_points_cleared'
        });
        
        wss.clients.forEach(client => {
          if (client.readyState === client.OPEN) {
            client.send(message);
          }
        });
      }

      res.json({ success: true });
    });
  });

  return router;
};