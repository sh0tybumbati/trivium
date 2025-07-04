const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    this.db = new sqlite3.Database(path.join(__dirname, 'trivia.db'));
    this.init();
  }

  init() {
    // Create questions table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        question TEXT NOT NULL,
        type TEXT DEFAULT 'multiple_choice', -- 'multiple_choice' or 'write_in'
        options TEXT NOT NULL, -- JSON array
        answer TEXT,
        explanation TEXT,
        image_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create game_settings table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS game_settings (
        id INTEGER PRIMARY KEY,
        game_title TEXT DEFAULT 'TRIVIA NIGHT',
        game_subtitle TEXT DEFAULT 'Get Ready to Play!',
        show_question_counter BOOLEAN DEFAULT 0,
        show_wait_screen BOOLEAN DEFAULT 1,
        timed_rounds BOOLEAN DEFAULT 1,
        time_limit INTEGER DEFAULT 30,
        question_limit INTEGER DEFAULT NULL,
        selected_categories TEXT DEFAULT '[]', -- JSON array
        player_mode BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create players table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        score INTEGER DEFAULT 0,
        connected BOOLEAN DEFAULT 1,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create player_answers table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS player_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        selected_answer TEXT NOT NULL,
        is_correct BOOLEAN DEFAULT NULL,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE,
        UNIQUE(player_id, question_id)
      )
    `);

    // Add type column to existing questions table if it doesn't exist
    this.db.run(`
      ALTER TABLE questions ADD COLUMN type TEXT DEFAULT 'multiple_choice'
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding type column:', err);
      }
    });

    // Add player_mode column to existing game_settings table if it doesn't exist
    this.db.run(`
      ALTER TABLE game_settings ADD COLUMN player_mode BOOLEAN DEFAULT 0
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding player_mode column:', err);
      }
    });

    // Add image_url column to existing questions table if it doesn't exist
    this.db.run(`
      ALTER TABLE questions ADD COLUMN image_url TEXT
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding image_url column:', err);
      }
    });

    // Fix any existing questions with NULL type values
    this.db.run(`
      UPDATE questions SET type = 'multiple_choice' WHERE type IS NULL OR type = ''
    `, (err) => {
      if (err) {
        console.error('Error fixing question types:', err);
      }
    });

    // Insert default settings if none exist
    this.db.get("SELECT COUNT(*) as count FROM game_settings", (err, row) => {
      if (!err && row.count === 0) {
        this.db.run(`
          INSERT INTO game_settings (id) VALUES (1)
        `);
      }
    });

    // Insert default questions if none exist
    this.db.get("SELECT COUNT(*) as count FROM questions", (err, row) => {
      if (!err && row.count === 0) {
        this.insertDefaultQuestions();
      }
    });
  }

  insertDefaultQuestions() {
    const defaultQuestions = [
      {
        category: "Science",
        question: "What is the chemical symbol for gold?",
        type: "multiple_choice",
        options: JSON.stringify(["Au", "Ag", "Go", "Gd"]),
        answer: "Au",
        explanation: "Gold's chemical symbol 'Au' comes from the Latin word 'aurum'."
      },
      {
        category: "Geography", 
        question: "Which country has the most time zones?",
        type: "multiple_choice",
        options: JSON.stringify(["Russia", "United States", "China", "France"]),
        answer: "France",
        explanation: "France has 12 time zones due to its overseas territories, more than any other country."
      },
      {
        category: "History",
        question: "In which year did the Berlin Wall fall?",
        type: "multiple_choice",
        options: JSON.stringify(["1987", "1989", "1991", "1993"]),
        answer: "1989",
        explanation: "The Berlin Wall fell on November 9, 1989, marking the beginning of German reunification."
      },
      {
        category: "Sports",
        question: "How many players are on a basketball team on the court at one time?",
        type: "multiple_choice",
        options: JSON.stringify(["4", "5", "6", "7"]),
        answer: "5",
        explanation: "Each basketball team has 5 players on the court: point guard, shooting guard, small forward, power forward, and center."
      },
      {
        category: "Entertainment",
        question: "Which movie won the Academy Award for Best Picture in 2020?",
        type: "multiple_choice",
        options: JSON.stringify(["1917", "Joker", "Parasite", "Once Upon a Time in Hollywood"]),
        answer: "Parasite",
        explanation: "Parasite made history as the first non-English language film to win Best Picture."
      },
      {
        category: "General Knowledge",
        question: "What is the tallest mountain in the world?",
        type: "write_in",
        options: JSON.stringify([]),
        answer: "Mount Everest",
        explanation: "Mount Everest stands at 29,032 feet (8,849 meters) above sea level.",
        image_url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=400&fit=crop"
      }
    ];

    const stmt = this.db.prepare(`
      INSERT INTO questions (category, question, type, options, answer, explanation, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    defaultQuestions.forEach(q => {
      stmt.run(q.category, q.question, q.type, q.options, q.answer, q.explanation, q.image_url || null);
    });

    stmt.finalize();
  }

  // Question methods
  getAllQuestions(callback) {
    this.db.all(`
      SELECT id, category, question, type, options, answer, explanation, image_url, created_at, updated_at 
      FROM questions ORDER BY created_at DESC
    `, (err, rows) => {
      if (err) {
        callback(err, null);
        return;
      }
      
      // Parse JSON options for each question
      const questions = rows.map(row => ({
        ...row,
        options: JSON.parse(row.options)
      }));
      
      callback(null, questions);
    });
  }

  addQuestion(question, callback) {
    const { category, question: text, type, options, answer, explanation, image_url } = question;
    
    this.db.run(`
      INSERT INTO questions (category, question, type, options, answer, explanation, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [category, text, type || 'multiple_choice', JSON.stringify(options), answer, explanation, image_url], function(err) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, { id: this.lastID, ...question });
    });
  }

  updateQuestion(id, question, callback) {
    const { category, question: text, type, options, answer, explanation, image_url } = question;
    
    this.db.run(`
      UPDATE questions 
      SET category = ?, question = ?, type = ?, options = ?, answer = ?, explanation = ?, image_url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [category, text, type || 'multiple_choice', JSON.stringify(options), answer, explanation, image_url, id], function(err) {
      if (err) {
        callback(err);
        return;
      }
      callback(null);
    });
  }

  deleteQuestion(id, callback) {
    this.db.run("DELETE FROM questions WHERE id = ?", [id], function(err) {
      if (err) {
        callback(err);
        return;
      }
      callback(null);
    });
  }

  // Game settings methods
  getGameSettings(callback) {
    this.db.get(`
      SELECT * FROM game_settings WHERE id = 1
    `, (err, row) => {
      if (err) {
        callback(err, null);
        return;
      }
      
      if (row) {
        row.selected_categories = JSON.parse(row.selected_categories);
        // Convert SQLite integer booleans to JavaScript booleans
        row.show_question_counter = !!row.show_question_counter;
        row.show_wait_screen = !!row.show_wait_screen;
        row.timed_rounds = !!row.timed_rounds;
        row.player_mode = !!row.player_mode;
      }
      
      callback(null, row);
    });
  }

  updateGameSettings(settings, callback) {
    const {
      game_title,
      game_subtitle, 
      show_question_counter,
      show_wait_screen,
      timed_rounds,
      time_limit,
      question_limit,
      selected_categories,
      player_mode
    } = settings;

    this.db.run(`
      UPDATE game_settings 
      SET game_title = ?, game_subtitle = ?, show_question_counter = ?, 
          show_wait_screen = ?, timed_rounds = ?, time_limit = ?, 
          question_limit = ?, selected_categories = ?, player_mode = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `, [
      game_title, game_subtitle, show_question_counter, 
      show_wait_screen, timed_rounds, time_limit, 
      question_limit, JSON.stringify(selected_categories), player_mode
    ], function(err) {
      if (err) {
        callback(err);
        return;
      }
      callback(null);
    });
  }

  // Player methods
  getAllPlayers(callback) {
    this.db.all(`
      SELECT id, name, score, connected, joined_at, last_seen 
      FROM players ORDER BY score DESC, joined_at ASC
    `, callback);
  }

  addPlayer(name, callback) {
    this.db.run(`
      INSERT INTO players (name) VALUES (?)
    `, [name], function(err) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, { id: this.lastID, name, score: 0, connected: 1 });
    });
  }

  updatePlayerScore(playerId, score, callback) {
    this.db.run(`
      UPDATE players 
      SET score = ?, last_seen = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [score, playerId], callback);
  }

  updatePlayerConnection(playerId, connected, callback) {
    this.db.run(`
      UPDATE players 
      SET connected = ?, last_seen = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [connected, playerId], callback);
  }

  clearAllPlayers(callback) {
    this.db.run("DELETE FROM players", callback);
  }

  getPlayerByName(name, callback) {
    this.db.get(`
      SELECT id, name, score, connected, joined_at, last_seen 
      FROM players WHERE name = ?
    `, [name], callback);
  }

  // Player answer methods
  submitPlayerAnswer(playerId, questionId, selectedAnswer, callback) {
    this.db.run(`
      INSERT OR REPLACE INTO player_answers (player_id, question_id, selected_answer, submitted_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `, [playerId, questionId, selectedAnswer], callback);
  }

  submitPlayerAnswerWithCorrectness(playerId, questionId, selectedAnswer, isCorrect, callback) {
    this.db.run(`
      INSERT OR REPLACE INTO player_answers (player_id, question_id, selected_answer, is_correct, submitted_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [playerId, questionId, selectedAnswer, isCorrect], callback);
  }

  getPlayerAnswer(playerId, questionId, callback) {
    this.db.get(`
      SELECT * FROM player_answers 
      WHERE player_id = ? AND question_id = ?
    `, [playerId, questionId], callback);
  }

  getQuestionAnswers(questionId, callback) {
    this.db.all(`
      SELECT pa.*, p.name as player_name
      FROM player_answers pa
      JOIN players p ON pa.player_id = p.id
      WHERE pa.question_id = ?
      ORDER BY pa.submitted_at ASC
    `, [questionId], callback);
  }

  getAllAnswersForCurrentQuestion(questionId, callback) {
    this.db.all(`
      SELECT p.id, p.name, pa.selected_answer, pa.submitted_at
      FROM players p
      LEFT JOIN player_answers pa ON p.id = pa.player_id AND pa.question_id = ?
      WHERE p.connected = 1
      ORDER BY p.name ASC
    `, [questionId], callback);
  }

  clearPlayerAnswers(questionId, callback) {
    this.db.run(`
      DELETE FROM player_answers WHERE question_id = ?
    `, [questionId], callback);
  }

  clearAllPlayerAnswers(callback) {
    this.db.run(`
      DELETE FROM player_answers
    `, callback);
  }

  // Score all correct answers for a specific question
  scoreCorrectAnswersForQuestion(questionId, pointsPerCorrect, callback) {
    // Get all correct answers for this question
    this.db.all(`
      SELECT pa.player_id, p.score as current_score
      FROM player_answers pa
      JOIN players p ON pa.player_id = p.id
      WHERE pa.question_id = ? AND pa.is_correct = 1
    `, [questionId], (err, correctAnswers) => {
      if (err) {
        return callback(err);
      }

      if (correctAnswers.length === 0) {
        return callback(null, []);
      }

      // Update scores for all players who answered correctly
      let completed = 0;
      const scoreUpdates = [];

      correctAnswers.forEach(answer => {
        const newScore = answer.current_score + pointsPerCorrect;
        
        this.updatePlayerScore(answer.player_id, newScore, (err) => {
          if (!err) {
            scoreUpdates.push({
              playerId: answer.player_id,
              newScore: newScore,
              pointsAwarded: pointsPerCorrect
            });
          }
          
          completed++;
          if (completed === correctAnswers.length) {
            callback(null, scoreUpdates);
          }
        });
      });
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = Database;