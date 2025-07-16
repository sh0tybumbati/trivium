const express = require('express');
const router = express.Router();

module.exports = (db, wss) => {
  // Submit buzzer response
  router.post('/buzz', (req, res) => {
    const { playerId, questionId, teamId } = req.body;
    
    if (!playerId || !questionId || isNaN(parseInt(playerId)) || isNaN(parseInt(questionId))) {
      return res.status(400).json({ error: 'Valid player ID and question ID are required' });
    }

    const playerIdInt = parseInt(playerId);
    const questionIdInt = parseInt(questionId);
    const teamIdInt = teamId ? parseInt(teamId) : null;

    db.submitBuzzerResponse(playerIdInt, teamIdInt, questionIdInt, (err, buzzerResponse) => {
      if (err) {
        console.error('Error submitting buzzer response:', err);
        return res.status(500).json({ error: 'Failed to submit buzzer response' });
      }

      // Get player and team names for broadcast
      db.getAllPlayers((playerErr, players) => {
        if (playerErr) {
          console.error('Error fetching players for buzzer broadcast:', playerErr);
          return res.json(buzzerResponse);
        }

        const player = players.find(p => p.id === playerIdInt);
        let teamName = null;
        let teamColor = null;

        if (teamIdInt) {
          db.getAllTeams((teamErr, teams) => {
            if (!teamErr) {
              const team = teams.find(t => t.id === teamIdInt);
              if (team) {
                teamName = team.name;
                teamColor = team.color;
              }
            }
            
            broadcastBuzzerResponse();
          });
        } else {
          broadcastBuzzerResponse();
        }

        function broadcastBuzzerResponse() {
          // Broadcast buzzer response to all WebSocket clients
          if (wss) {
            const message = JSON.stringify({
              type: 'buzzer_pressed',
              buzzerResponse: {
                ...buzzerResponse,
                player_name: player?.name,
                team_name: teamName,
                team_color: teamColor
              }
            });
            
            wss.clients.forEach(client => {
              if (client.readyState === client.OPEN) {
                client.send(message);
              }
            });
          }

          res.json(buzzerResponse);
        }
      });
    });
  });

  // Get buzzer responses for a question
  router.get('/responses/:questionId', (req, res) => {
    const questionId = parseInt(req.params.questionId);

    if (isNaN(questionId)) {
      return res.status(400).json({ error: 'Invalid question ID' });
    }

    db.getBuzzerResponses(questionId, (err, responses) => {
      if (err) {
        console.error('Error fetching buzzer responses:', err);
        return res.status(500).json({ error: 'Failed to fetch buzzer responses' });
      }

      res.json(responses);
    });
  });

  // Clear buzzer responses for a question
  router.delete('/clear/:questionId', (req, res) => {
    const questionId = parseInt(req.params.questionId);

    if (isNaN(questionId)) {
      return res.status(400).json({ error: 'Invalid question ID' });
    }

    db.clearBuzzerResponses(questionId, (err) => {
      if (err) {
        console.error('Error clearing buzzer responses:', err);
        return res.status(500).json({ error: 'Failed to clear buzzer responses' });
      }

      // Broadcast buzzer cleared event to all WebSocket clients
      if (wss) {
        const message = JSON.stringify({
          type: 'buzzer_cleared',
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

  // Reset buzzer for new question (alias for clear)
  router.post('/reset/:questionId', (req, res) => {
    const questionId = parseInt(req.params.questionId);

    if (isNaN(questionId)) {
      return res.status(400).json({ error: 'Invalid question ID' });
    }

    db.clearBuzzerResponses(questionId, (err) => {
      if (err) {
        console.error('Error resetting buzzer:', err);
        return res.status(500).json({ error: 'Failed to reset buzzer' });
      }

      // Broadcast buzzer reset event to all WebSocket clients
      if (wss) {
        const message = JSON.stringify({
          type: 'buzzer_reset',
          questionId: questionId
        });
        
        wss.clients.forEach(client => {
          if (client.readyState === client.OPEN) {
            client.send(message);
          }
        });
      }

      res.json({ success: true, message: 'Buzzer reset for new question' });
    });
  });

  return router;
};