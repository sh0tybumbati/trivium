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
        options TEXT NOT NULL, -- JSON array
        answer TEXT NOT NULL,
        explanation TEXT,
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

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
        options: JSON.stringify(["Au", "Ag", "Go", "Gd"]),
        answer: "Au",
        explanation: "Gold's chemical symbol 'Au' comes from the Latin word 'aurum'."
      },
      {
        category: "Geography", 
        question: "Which country has the most time zones?",
        options: JSON.stringify(["Russia", "United States", "China", "France"]),
        answer: "France",
        explanation: "France has 12 time zones due to its overseas territories, more than any other country."
      },
      {
        category: "History",
        question: "In which year did the Berlin Wall fall?",
        options: JSON.stringify(["1987", "1989", "1991", "1993"]),
        answer: "1989",
        explanation: "The Berlin Wall fell on November 9, 1989, marking the beginning of German reunification."
      },
      {
        category: "Sports",
        question: "How many players are on a basketball team on the court at one time?",
        options: JSON.stringify(["4", "5", "6", "7"]),
        answer: "5",
        explanation: "Each basketball team has 5 players on the court: point guard, shooting guard, small forward, power forward, and center."
      },
      {
        category: "Entertainment",
        question: "Which movie won the Academy Award for Best Picture in 2020?",
        options: JSON.stringify(["1917", "Joker", "Parasite", "Once Upon a Time in Hollywood"]),
        answer: "Parasite",
        explanation: "Parasite made history as the first non-English language film to win Best Picture."
      }
    ];

    const stmt = this.db.prepare(`
      INSERT INTO questions (category, question, options, answer, explanation)
      VALUES (?, ?, ?, ?, ?)
    `);

    defaultQuestions.forEach(q => {
      stmt.run(q.category, q.question, q.options, q.answer, q.explanation);
    });

    stmt.finalize();
  }

  // Question methods
  getAllQuestions(callback) {
    this.db.all(`
      SELECT id, category, question, options, answer, explanation, created_at, updated_at 
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
    const { category, question: text, options, answer, explanation } = question;
    
    this.db.run(`
      INSERT INTO questions (category, question, options, answer, explanation)
      VALUES (?, ?, ?, ?, ?)
    `, [category, text, JSON.stringify(options), answer, explanation], function(err) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, { id: this.lastID, ...question });
    });
  }

  updateQuestion(id, question, callback) {
    const { category, question: text, options, answer, explanation } = question;
    
    this.db.run(`
      UPDATE questions 
      SET category = ?, question = ?, options = ?, answer = ?, explanation = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [category, text, JSON.stringify(options), answer, explanation, id], function(err) {
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
      selected_categories
    } = settings;

    this.db.run(`
      UPDATE game_settings 
      SET game_title = ?, game_subtitle = ?, show_question_counter = ?, 
          show_wait_screen = ?, timed_rounds = ?, time_limit = ?, 
          question_limit = ?, selected_categories = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `, [
      game_title, game_subtitle, show_question_counter, 
      show_wait_screen, timed_rounds, time_limit, 
      question_limit, JSON.stringify(selected_categories)
    ], function(err) {
      if (err) {
        callback(err);
        return;
      }
      callback(null);
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = Database;