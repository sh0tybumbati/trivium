const express = require('express');
const router = express.Router();

module.exports = (db, gameState) => {
  // Get all questions
  router.get('/', (req, res) => {
    db.getAllQuestions((err, questions) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch questions' });
      }
      res.json(questions);
    });
  });

  // Add new question
  router.post('/', (req, res) => {
    console.log('Received question data:', req.body);
    const { category, question, type, options, answer, explanation, image_url } = req.body;
    
    console.log('Validation check:', { 
      category: category, 
      question: question,
      categoryCheck: !!category,
      questionCheck: !!question 
    });
    
    if (!category || !question) {
      console.log('Validation failed: Missing required fields');
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // For multiple choice, answer is required and options must be provided
    if (type === 'multiple_choice' && (!answer || !options)) {
      return res.status(400).json({ error: 'Multiple choice questions require answer and options' });
    }

    if (type === 'multiple_choice' && (!Array.isArray(options) || options.length !== 4)) {
      return res.status(400).json({ error: 'Multiple choice questions must have 4 options' });
    }

    const newQuestion = { category, question, type, options, answer, explanation, image_url };

    db.addQuestion(newQuestion, (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to add question' });
      }
      
      // Notify all clients that questions have been updated
      gameState.broadcast({
        type: 'QUESTIONS_UPDATED',
        action: 'ADDED',
        question: result
      });
      
      res.status(201).json(result);
    });
  });

  // Update question
  router.put('/:id', (req, res) => {
    const { id } = req.params;
    const { category, question, type, options, answer, explanation, image_url } = req.body;
    
    if (!category || !question) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // For multiple choice, answer is required and options must be provided
    if (type === 'multiple_choice' && (!answer || !options)) {
      return res.status(400).json({ error: 'Multiple choice questions require answer and options' });
    }

    if (type === 'multiple_choice' && (!Array.isArray(options) || options.length !== 4)) {
      return res.status(400).json({ error: 'Multiple choice questions must have 4 options' });
    }

    const updatedQuestion = { category, question, type, options, answer, explanation, image_url };

    db.updateQuestion(id, updatedQuestion, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to update question' });
      }
      
      // Notify all clients that questions have been updated
      gameState.broadcast({
        type: 'QUESTIONS_UPDATED',
        action: 'UPDATED',
        questionId: id,
        question: updatedQuestion
      });
      
      res.json({ message: 'Question updated successfully' });
    });
  });

  // Delete question
  router.delete('/:id', (req, res) => {
    const { id } = req.params;

    db.deleteQuestion(id, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to delete question' });
      }
      
      // Notify all clients that questions have been updated
      gameState.broadcast({
        type: 'QUESTIONS_UPDATED',
        action: 'DELETED',
        questionId: id
      });
      
      res.json({ message: 'Question deleted successfully' });
    });
  });

  // Export questions
  router.get('/export', (req, res) => {
    db.getAllQuestions((err, questions) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to export questions' });
      }
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="trivia-questions.json"');
      res.send(JSON.stringify(questions, null, 2));
    });
  });

  // Import questions
  router.post('/import', (req, res) => {
    const { questions, mode = 'replace' } = req.body;
    
    if (!Array.isArray(questions)) {
      return res.status(400).json({ error: 'Questions must be an array' });
    }

    // Validate question format
    for (const q of questions) {
      if (!q.category || !q.question || !q.options || !q.answer) {
        return res.status(400).json({ error: 'Invalid question format' });
      }
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        return res.status(400).json({ error: 'Each question must have exactly 4 options' });
      }
    }

    if (mode === 'replace') {
      // Clear existing questions first
      db.db.run('DELETE FROM questions', (err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to clear existing questions' });
        }
        importQuestions();
      });
    } else {
      importQuestions();
    }

    function importQuestions() {
      let completed = 0;
      let errors = [];

      if (questions.length === 0) {
        return res.json({ message: 'No questions to import', imported: 0 });
      }

      questions.forEach((question, index) => {
        db.addQuestion(question, (err) => {
          completed++;
          if (err) {
            errors.push(`Question ${index + 1}: ${err.message}`);
          }

          if (completed === questions.length) {
            // Notify all clients that questions have been updated
            gameState.broadcast({
              type: 'QUESTIONS_UPDATED',
              action: 'IMPORTED',
              count: questions.length - errors.length
            });

            if (errors.length > 0) {
              res.status(207).json({
                message: `Imported ${questions.length - errors.length}/${questions.length} questions`,
                imported: questions.length - errors.length,
                errors: errors
              });
            } else {
              res.json({
                message: `Successfully imported ${questions.length} questions`,
                imported: questions.length
              });
            }
          }
        });
      });
    }
  });

  return router;
};