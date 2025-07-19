const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    this.db = new sqlite3.Database(path.join(__dirname, 'trivia.db'));
    this.init();
  }

  init() {
    console.log('🗄️  Initializing SQLite database...');
    
    // Use serialize to ensure all operations run in order
    this.db.serialize(() => {
      // Create all core tables first
      this.createCoreTables();
      
      // Then create additional tables that may reference core tables
      this.createAdditionalTables();
      
      // Finally add any missing columns to existing tables
      this.addMissingColumns();
      
      // Set up default data
      this.setupDefaultData();
    });
  }

  createCoreTables() {
    console.log('🏗️  Creating core tables...');
    
    // Create questions table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        question TEXT NOT NULL,
        type TEXT DEFAULT 'multiple_choice',
        options TEXT NOT NULL,
        answer TEXT,
        explanation TEXT,
        image_url TEXT,
        feud_answers TEXT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('❌ Error creating questions table:', err);
      else console.log('✅ Questions table ready');
    });

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
        selected_categories TEXT DEFAULT '[]',
        player_mode BOOLEAN DEFAULT 0,
        host_password TEXT DEFAULT NULL,
        score_multiplier INTEGER DEFAULT 10,
        timer_eats_points BOOLEAN DEFAULT 1,
        min_points_percentage INTEGER DEFAULT 25,
        auto_clear_players BOOLEAN DEFAULT 0,
        player_join_timeout INTEGER DEFAULT 300,
        hide_qr_during_game BOOLEAN DEFAULT 0,
        show_player_count BOOLEAN DEFAULT 1,
        team_mode BOOLEAN DEFAULT 0,
        buzzer_enabled BOOLEAN DEFAULT 0,
        buzzer_timeout INTEGER DEFAULT 5,
        team_size_limit INTEGER DEFAULT 4,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('❌ Error creating game_settings table:', err);
      else console.log('✅ Game settings table ready');
    });

    // Create players table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        password TEXT DEFAULT '',
        score INTEGER DEFAULT 0,
        connected BOOLEAN DEFAULT 1,
        team_id INTEGER,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('❌ Error creating players table:', err);
      else console.log('✅ Players table ready');
    });

    // Create player_answers table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS player_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        selected_answer TEXT NOT NULL,
        is_correct BOOLEAN DEFAULT NULL,
        time_remaining INTEGER DEFAULT NULL,
        time_limit INTEGER DEFAULT NULL,
        locked_score INTEGER DEFAULT NULL,
        team_id INTEGER,
        buzz_order INTEGER DEFAULT NULL,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE,
        UNIQUE(player_id, question_id)
      )
    `, (err) => {
      if (err) console.error('❌ Error creating player_answers table:', err);
      else console.log('✅ Player answers table ready');
    });

    // Create pending_points table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS pending_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        points INTEGER NOT NULL,
        player_name TEXT NOT NULL,
        answer TEXT NOT NULL,
        awarded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE,
        UNIQUE(player_id, question_id)
      )
    `, (err) => {
      if (err) console.error('❌ Error creating pending_points table:', err);
      else console.log('✅ Pending points table ready');
    });
  }

  createAdditionalTables() {
    console.log('🏗️  Creating additional tables...');

    // Create teams table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT DEFAULT '#3B82F6',
        score INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('❌ Error creating teams table:', err);
      else console.log('✅ Teams table ready');
    });

    // Create team_members table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS team_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
        FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE,
        UNIQUE(player_id)
      )
    `, (err) => {
      if (err) console.error('❌ Error creating team_members table:', err);
      else console.log('✅ Team members table ready');
    });

    // Create buzzer_responses table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS buzzer_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER NOT NULL,
        team_id INTEGER,
        question_id INTEGER NOT NULL,
        buzz_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        buzz_order INTEGER,
        FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE,
        FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE,
        UNIQUE(player_id, question_id)
      )
    `, (err) => {
      if (err) console.error('❌ Error creating buzzer_responses table:', err);
      else console.log('✅ Buzzer responses table ready');
    });

    // Create feud_answers table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS feud_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id INTEGER NOT NULL,
        answer_text TEXT NOT NULL,
        points INTEGER DEFAULT 1,
        display_order INTEGER DEFAULT 1,
        revealed BOOLEAN DEFAULT 0,
        FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('❌ Error creating feud_answers table:', err);
      else console.log('✅ Feud answers table ready');
    });
  }

  addMissingColumns() {
    // This method is for future compatibility - currently all columns are in main table creation
    console.log('✨ All columns included in main table creation');
  }

  setupDefaultData() {
    console.log('📊 Setting up default data...');
    
    // Insert default settings if none exist
    this.db.get("SELECT COUNT(*) as count FROM game_settings", (err, row) => {
      if (!err && row.count === 0) {
        this.db.run(`INSERT INTO game_settings (id) VALUES (1)`, (err) => {
          if (err) console.error('❌ Error creating default settings:', err);
          else console.log('✅ Default game settings created');
        });
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
        question: "Which is the largest ocean on Earth?",
        type: "multiple_choice",
        options: JSON.stringify(["Atlantic", "Pacific", "Indian", "Arctic"]),
        answer: "Pacific",
        explanation: "The Pacific Ocean covers about 46% of the Earth's water surface."
      },
      {
        category: "Entertainment",
        question: "Teletubies",
        type: "feud",
        options: JSON.stringify([]),
        answer: "",
        explanation: "Family Feud style question",
        feud_answers: JSON.stringify([
          { answer_text: "po", points: 1, display_order: 1, revealed: false },
          { answer_text: "dipsy", points: 1, display_order: 2, revealed: false },
          { answer_text: "lala", points: 1, display_order: 3, revealed: false },
          { answer_text: "tinkywink", points: 1, display_order: 4, revealed: false }
        ])
      }
    ];

    defaultQuestions.forEach((q, index) => {
      this.db.run(`
        INSERT INTO questions (category, question, type, options, answer, explanation, image_url, feud_answers)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [q.category, q.question, q.type, q.options, q.answer, q.explanation, q.image_url || null, q.feud_answers || null], (err) => {
        if (err) console.error(`❌ Error inserting default question ${index + 1}:`, err);
        else console.log(`✅ Default question ${index + 1} inserted`);
      });
    });
  }

  // All the existing methods from the original database.js
  // (I'll include the key ones for the current functionality)

  getAllQuestions(callback) {
    this.db.all(`
      SELECT *,
        CASE 
          WHEN feud_answers IS NOT NULL THEN 
            json(feud_answers)
          ELSE 
            NULL 
        END as feud_answers
      FROM questions 
      ORDER BY created_at DESC
    `, (err, rows) => {
      if (err) {
        callback(err, null);
        return;
      }
      
      // Parse JSON strings back to objects
      const questions = rows.map(row => ({
        ...row,
        options: JSON.parse(row.options || '[]'),
        feud_answers: row.feud_answers ? JSON.parse(row.feud_answers) : []
      }));
      
      callback(null, questions);
    });
  }

  getGameSettings(callback) {
    this.db.get("SELECT * FROM game_settings WHERE id = 1", (err, row) => {
      if (err) {
        callback(err, null);
        return;
      }
      
      if (row) {
        // Parse JSON fields
        row.selected_categories = JSON.parse(row.selected_categories || '[]');
        // Convert SQLite integers (0/1) to proper booleans
        const booleanFields = [
          'show_question_counter', 'show_wait_screen', 'timed_rounds', 'player_mode',
          'timer_eats_points', 'auto_clear_players', 'hide_qr_during_game', 
          'show_player_count', 'team_mode', 'buzzer_enabled'
        ];
        booleanFields.forEach(field => {
          if (row[field] !== undefined) {
            row[field] = Boolean(row[field]);
          }
        });
      }
      
      callback(null, row);
    });
  }

  // Feud answer methods
  addFeudAnswer(questionId, answerText, points, displayOrder, callback) {
    this.db.run(`
      INSERT INTO feud_answers (question_id, answer_text, points, display_order)
      VALUES (?, ?, ?, ?)
    `, [questionId, answerText, points || 1, displayOrder || 1], function(err) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, { 
        id: this.lastID, 
        question_id: questionId,
        answer_text: answerText, 
        points: points || 1, 
        display_order: displayOrder || 1,
        revealed: false
      });
    });
  }

  getFeudAnswers(questionId, callback) {
    this.db.all(`
      SELECT * FROM feud_answers 
      WHERE question_id = ? 
      ORDER BY display_order ASC
    `, [questionId], callback);
  }

  revealFeudAnswer(questionId, answerId, callback) {
    this.db.run(`
      UPDATE feud_answers SET revealed = 1 
      WHERE id = ? AND question_id = ?
    `, [answerId, questionId], callback);
  }

  resetFeudAnswers(questionId, callback) {
    this.db.run(`
      UPDATE feud_answers SET revealed = 0 WHERE question_id = ?
    `, [questionId], callback);
  }

  deleteFeudAnswer(answerId, callback) {
    this.db.run(`
      DELETE FROM feud_answers WHERE id = ?
    `, [answerId], callback);
  }

  // Essential methods for game functionality
  getAllPlayers(callback) {
    this.db.all(`
      SELECT p.*, t.name as team_name, t.color as team_color
      FROM players p
      LEFT JOIN teams t ON p.team_id = t.id
      ORDER BY p.score DESC, p.joined_at ASC
    `, callback);
  }

  addQuestion(questionData, callback) {
    const { category, question, type, options, answer, explanation, image_url, feud_answers } = questionData;
    this.db.run(`
      INSERT INTO questions (category, question, type, options, answer, explanation, image_url, feud_answers)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      category,
      question, 
      type || 'multiple_choice',
      JSON.stringify(options || []),
      answer || '',
      explanation || '',
      image_url || null,
      feud_answers ? JSON.stringify(feud_answers) : null
    ], function(err) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, { id: this.lastID, ...questionData });
    });
  }

  updateGameSettings(settings, callback) {
    const fields = [];
    const values = [];
    
    Object.keys(settings).forEach(key => {
      if (key !== 'id') {
        fields.push(`${key} = ?`);
        if (Array.isArray(settings[key])) {
          values.push(JSON.stringify(settings[key]));
        } else {
          values.push(settings[key]);
        }
      }
    });
    
    if (fields.length === 0) {
      return callback(null);
    }
    
    values.push(1); // WHERE id = 1
    
    this.db.run(`
      UPDATE game_settings SET ${fields.join(', ')} WHERE id = ?
    `, values, callback);
  }

  clearAllPlayerAnswers(callback) {
    this.db.run('DELETE FROM player_answers', callback);
  }

  // Teams methods
  getAllTeams(callback) {
    this.db.all(`
      SELECT t.*, 
             COUNT(tm.player_id) as member_count,
             GROUP_CONCAT(p.name) as member_names
      FROM teams t
      LEFT JOIN team_members tm ON t.id = tm.team_id
      LEFT JOIN players p ON tm.player_id = p.id
      GROUP BY t.id
      ORDER BY t.score DESC, t.created_at ASC
    `, callback);
  }

  createTeam(name, color, callback) {
    this.db.run(`
      INSERT INTO teams (name, color) VALUES (?, ?)
    `, [name, color || '#3B82F6'], function(err) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, { id: this.lastID, name, color: color || '#3B82F6', score: 0 });
    });
  }

  addPlayer(name, password, callback) {
    this.db.run(`
      INSERT INTO players (name, password) VALUES (?, ?)
    `, [name, password || ''], function(err) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, { 
        id: this.lastID, 
        name, 
        password: password || '', 
        score: 0, 
        connected: true 
      });
    });
  }

  updatePlayerScore(playerId, score, callback) {
    this.db.run(`
      UPDATE players SET score = ? WHERE id = ?
    `, [score, playerId], callback);
  }

  clearAllPlayers(callback) {
    this.db.run('DELETE FROM players', callback);
  }

  close() {
    console.log('📦 Closing database connection');
    this.db.close();
  }
}

module.exports = Database;