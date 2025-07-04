const express = require('express');
const router = express.Router();

module.exports = (db, wss) => {
  // Submit or update player answer
  router.post('/submit', (req, res) => {
    const { playerId, questionId, selectedAnswer } = req.body;

    if (!playerId || !questionId || !selectedAnswer) {
      return res.status(400).json({ 
        error: 'Missing required fields: playerId, questionId, selectedAnswer' 
      });
    }

    // First, get the question to check if answer is correct
    db.db.get('SELECT * FROM questions WHERE id = ?', [questionId], (err, question) => {
      if (err) {
        console.error('Error fetching question for scoring:', err);
        return res.status(500).json({ error: 'Failed to fetch question' });
      }

      if (!question) {
        return res.status(404).json({ error: 'Question not found' });
      }

      // Determine if answer is correct (for multiple choice questions)
      const isCorrect = question.type === 'multiple_choice' ? selectedAnswer === question.answer : null;
      
      // Submit the answer with correctness info
      db.submitPlayerAnswerWithCorrectness(playerId, questionId, selectedAnswer, isCorrect, (err) => {
        if (err) {
          console.error('Error submitting player answer:', err);
          return res.status(500).json({ error: 'Failed to submit answer' });
        }

        if (isCorrect !== null) {
          console.log(`📝 Player ${playerId} answered ${isCorrect ? 'correctly' : 'incorrectly'} - scoring will happen when answer is revealed`);
        }

        // Broadcast answer submission to all clients
        const message = JSON.stringify({
          type: 'player_answer_submitted',
          payload: { playerId, questionId, selectedAnswer, timestamp: new Date().toISOString() }
        });

        wss.clients.forEach(client => {
          if (client.readyState === client.OPEN) {
            client.send(message);
          }
        });

        res.json({ success: true });
      });
    });
  });

  // Get all answers for a specific question (host view)
  router.get('/question/:questionId', (req, res) => {
    const questionId = parseInt(req.params.questionId);

    if (!questionId) {
      return res.status(400).json({ error: 'Invalid question ID' });
    }

    db.getAllAnswersForCurrentQuestion(questionId, (err, answers) => {
      if (err) {
        console.error('Error fetching question answers:', err);
        return res.status(500).json({ error: 'Failed to fetch answers' });
      }

      res.json(answers || []);
    });
  });

  // Get specific player's answer for a question
  router.get('/player/:playerId/question/:questionId', (req, res) => {
    const playerId = parseInt(req.params.playerId);
    const questionId = parseInt(req.params.questionId);

    if (!playerId || !questionId) {
      return res.status(400).json({ error: 'Invalid player ID or question ID' });
    }

    db.getPlayerAnswer(playerId, questionId, (err, answer) => {
      if (err) {
        console.error('Error fetching player answer:', err);
        return res.status(500).json({ error: 'Failed to fetch answer' });
      }

      res.json(answer || null);
    });
  });

  // Clear all answers for a question (host only)
  router.delete('/question/:questionId', (req, res) => {
    const questionId = parseInt(req.params.questionId);

    if (!questionId) {
      return res.status(400).json({ error: 'Invalid question ID' });
    }

    db.clearPlayerAnswers(questionId, (err) => {
      if (err) {
        console.error('Error clearing player answers:', err);
        return res.status(500).json({ error: 'Failed to clear answers' });
      }

      // Broadcast answers cleared to all clients
      const message = JSON.stringify({
        type: 'answers_cleared',
        payload: { questionId }
      });

      wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
          client.send(message);
        }
      });

      res.json({ success: true });
    });
  });

  return router;
};