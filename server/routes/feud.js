const express = require('express');
const router = express.Router();

module.exports = (db, wss, gameState) => {
  // Get feud answers for a question
  router.get('/:questionId/answers', (req, res) => {
    const questionId = parseInt(req.params.questionId);

    if (isNaN(questionId)) {
      return res.status(400).json({ error: 'Invalid question ID' });
    }

    db.getFeudAnswers(questionId, (err, answers) => {
      if (err) {
        console.error('Error fetching feud answers:', err);
        return res.status(500).json({ error: 'Failed to fetch feud answers' });
      }

      res.json(answers);
    });
  });

  // Add feud answer to a question
  router.post('/:questionId/answers', (req, res) => {
    const questionId = parseInt(req.params.questionId);
    const { answerText, points, displayOrder } = req.body;

    if (isNaN(questionId)) {
      return res.status(400).json({ error: 'Invalid question ID' });
    }

    if (!answerText || answerText.trim().length === 0) {
      return res.status(400).json({ error: 'Answer text is required' });
    }

    const answer = answerText.trim();
    const answerPoints = points || 1;
    const order = displayOrder || 1;

    db.addFeudAnswer(questionId, answer, answerPoints, order, (err, feudAnswer) => {
      if (err) {
        console.error('Error adding feud answer:', err);
        return res.status(500).json({ error: 'Failed to add feud answer' });
      }

      // Broadcast feud answer added event to all WebSocket clients
      if (wss) {
        const message = JSON.stringify({
          type: 'feud_answer_added',
          questionId: questionId,
          answer: feudAnswer
        });
        
        wss.clients.forEach(client => {
          if (client.readyState === client.OPEN) {
            client.send(message);
          }
        });
      }

      res.status(201).json(feudAnswer);
    });
  });

  // Reveal specific feud answer
  router.post('/:questionId/reveal/:answerId', (req, res) => {
    const questionId = parseInt(req.params.questionId);
    const answerId = parseInt(req.params.answerId);

    if (isNaN(questionId) || isNaN(answerId)) {
      return res.status(400).json({ error: 'Invalid question ID or answer ID' });
    }

    db.revealFeudAnswer(questionId, answerId, (err) => {
      if (err) {
        console.error('Error revealing feud answer:', err);
        return res.status(500).json({ error: 'Failed to reveal feud answer' });
      }

      // Get the revealed answer for broadcast
      db.getFeudAnswers(questionId, (fetchErr, answers) => {
        if (fetchErr) {
          console.error('Error fetching feud answers for broadcast:', fetchErr);
          return res.json({ success: true });
        }

        const revealedAnswer = answers.find(a => a.id === answerId);

        // Broadcast feud answer revealed event to all WebSocket clients
        if (wss && revealedAnswer) {
          const message = JSON.stringify({
            type: 'feud_answer_revealed',
            questionId: questionId,
            answerId: answerId,
            answer: revealedAnswer
          });
          
          wss.clients.forEach(client => {
            if (client.readyState === client.OPEN) {
              client.send(message);
            }
          });
        }

        res.json({ success: true, message: 'Feud answer revealed' });
      });
    });
  });

  // Reset all feud answers (hide them)
  router.post('/:questionId/reset', (req, res) => {
    const questionId = parseInt(req.params.questionId);

    if (isNaN(questionId)) {
      return res.status(400).json({ error: 'Invalid question ID' });
    }

    db.resetFeudAnswers(questionId, (err) => {
      if (err) {
        console.error('Error resetting feud answers:', err);
        return res.status(500).json({ error: 'Failed to reset feud answers' });
      }

      // Broadcast feud answers reset event to all WebSocket clients
      if (wss) {
        const message = JSON.stringify({
          type: 'feud_answers_reset',
          questionId: questionId
        });
        
        wss.clients.forEach(client => {
          if (client.readyState === client.OPEN) {
            client.send(message);
          }
        });
      }

      res.json({ success: true, message: 'Feud answers reset' });
    });
  });

  // Delete feud answer
  router.delete('/answers/:answerId', (req, res) => {
    const answerId = parseInt(req.params.answerId);

    if (isNaN(answerId)) {
      return res.status(400).json({ error: 'Invalid answer ID' });
    }

    db.deleteFeudAnswer(answerId, (err) => {
      if (err) {
        console.error('Error deleting feud answer:', err);
        return res.status(500).json({ error: 'Failed to delete feud answer' });
      }

      // Broadcast feud answer deleted event to all WebSocket clients
      if (wss) {
        const message = JSON.stringify({
          type: 'feud_answer_deleted',
          answerId: answerId
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

  // Award points for feud answer guess
  router.post('/:questionId/award', (req, res) => {
    const questionId = parseInt(req.params.questionId);
    const { playerId, teamId, answerId, points } = req.body;

    if (isNaN(questionId)) {
      return res.status(400).json({ error: 'Invalid question ID' });
    }

    if (!playerId || isNaN(parseInt(playerId))) {
      return res.status(400).json({ error: 'Valid player ID is required' });
    }

    const playerIdInt = parseInt(playerId);
    const teamIdInt = teamId ? parseInt(teamId) : null;
    const answerIdInt = answerId ? parseInt(answerId) : null;
    const awardPoints = points || 1;

    // If team mode, award points to team; otherwise to player
    if (teamIdInt) {
      // Get current team score
      db.getTeamById(teamIdInt, (err, team) => {
        if (err) {
          console.error('Error fetching team for feud scoring:', err);
          return res.status(500).json({ error: 'Failed to award points' });
        }

        if (!team) {
          return res.status(404).json({ error: 'Team not found' });
        }

        const newScore = team.score + awardPoints;
        
        db.updateTeamScore(teamIdInt, newScore, (scoreErr) => {
          if (scoreErr) {
            console.error('Error updating team score for feud:', scoreErr);
            return res.status(500).json({ error: 'Failed to award points to team' });
          }

          // Broadcast team score update
          if (wss) {
            const message = JSON.stringify({
              type: 'feud_points_awarded',
              teamId: teamIdInt,
              playerId: playerIdInt,
              points: awardPoints,
              newScore: newScore,
              questionId: questionId,
              answerId: answerIdInt
            });
            
            wss.clients.forEach(client => {
              if (client.readyState === client.OPEN) {
                client.send(message);
              }
            });
          }

          res.json({ 
            success: true, 
            message: 'Points awarded to team',
            teamId: teamIdInt,
            newScore: newScore
          });
        });
      });
    } else {
      // Award points to individual player
      db.getAllPlayers((err, players) => {
        if (err) {
          console.error('Error fetching players for feud scoring:', err);
          return res.status(500).json({ error: 'Failed to award points' });
        }

        const player = players.find(p => p.id === playerIdInt);
        if (!player) {
          return res.status(404).json({ error: 'Player not found' });
        }

        const newScore = player.score + awardPoints;
        
        db.updatePlayerScore(playerIdInt, newScore, (scoreErr) => {
          if (scoreErr) {
            console.error('Error updating player score for feud:', scoreErr);
            return res.status(500).json({ error: 'Failed to award points to player' });
          }

          // Broadcast player score update
          if (wss) {
            const message = JSON.stringify({
              type: 'feud_points_awarded',
              playerId: playerIdInt,
              points: awardPoints,
              newScore: newScore,
              questionId: questionId,
              answerId: answerIdInt
            });
            
            wss.clients.forEach(client => {
              if (client.readyState === client.OPEN) {
                client.send(message);
              }
            });
          }

          res.json({ 
            success: true, 
            message: 'Points awarded to player',
            playerId: playerIdInt,
            newScore: newScore
          });
        });
      });
    }
  });

  // Feud Game State Management Routes
  router.post('/initialize', (req, res) => {
    const { activeTeamId, opposingTeamId } = req.body;
    
    if (!activeTeamId || !opposingTeamId) {
      return res.status(400).json({ error: 'Both activeTeamId and opposingTeamId are required' });
    }

    gameState.initializeFeudGame(parseInt(activeTeamId), parseInt(opposingTeamId));
    
    res.json({ success: true, message: 'Feud game initialized' });
  });

  router.post('/switch-teams', (req, res) => {
    gameState.switchFeudTeams();
    res.json({ success: true, message: 'Teams switched' });
  });

  router.post('/add-strike', (req, res) => {
    gameState.addFeudStrike();
    res.json({ success: true, message: 'Strike added' });
  });

  router.post('/remove-strike', (req, res) => {
    gameState.removeFeudStrike();
    res.json({ success: true, message: 'Strike removed' });
  });

  router.post('/set-phase', (req, res) => {
    const { phase } = req.body;
    
    if (!phase) {
      return res.status(400).json({ error: 'Phase is required' });
    }

    gameState.setFeudGamePhase(phase);
    res.json({ success: true, message: `Phase set to ${phase}` });
  });

  router.post('/reset', (req, res) => {
    gameState.resetFeudState();
    res.json({ success: true, message: 'Feud state reset' });
  });

  return router;
};