const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

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
        password TEXT NOT NULL,
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
        time_remaining INTEGER DEFAULT NULL,
        time_limit INTEGER DEFAULT NULL,
        locked_score INTEGER DEFAULT NULL,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE,
        UNIQUE(player_id, question_id)
      )
    `);

    // Create pending_points table for write-in questions
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

    // Add host_password column to existing game_settings table if it doesn't exist
    this.db.run(`
      ALTER TABLE game_settings ADD COLUMN host_password TEXT DEFAULT NULL
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding host_password column:', err);
      }
    });

    // Add score_multiplier column to existing game_settings table if it doesn't exist
    this.db.run(`
      ALTER TABLE game_settings ADD COLUMN score_multiplier INTEGER DEFAULT 10
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding score_multiplier column:', err);
      }
    });

    // Add timer_eats_points column to existing game_settings table if it doesn't exist
    this.db.run(`
      ALTER TABLE game_settings ADD COLUMN timer_eats_points BOOLEAN DEFAULT 0
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding timer_eats_points column:', err);
      }
    });

    // Add min_points_percentage column to existing game_settings table if it doesn't exist
    this.db.run(`
      ALTER TABLE game_settings ADD COLUMN min_points_percentage INTEGER DEFAULT 25
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding min_points_percentage column:', err);
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

    // Add password column to existing players table if it doesn't exist
    this.db.run(`
      ALTER TABLE players ADD COLUMN password TEXT DEFAULT ''
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding password column:', err);
      }
    });

    // Add time_remaining column to existing player_answers table if it doesn't exist
    this.db.run(`
      ALTER TABLE player_answers ADD COLUMN time_remaining INTEGER DEFAULT NULL
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding time_remaining column:', err);
      }
    });

    // Add time_limit column to existing player_answers table if it doesn't exist
    this.db.run(`
      ALTER TABLE player_answers ADD COLUMN time_limit INTEGER DEFAULT NULL
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding time_limit column:', err);
      }
    });

    // Add locked_score column to existing player_answers table if it doesn't exist
    this.db.run(`
      ALTER TABLE player_answers ADD COLUMN locked_score INTEGER DEFAULT NULL
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding locked_score column:', err);
      }
    });

    // Add unique constraint to pending_points table if it doesn't exist
    this.db.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_points_unique 
      ON pending_points (player_id, question_id)
    `, (err) => {
      if (err) {
        console.error('Error adding unique constraint to pending_points:', err);
      }
    });

    // Add hide_qr_during_game column to existing game_settings table if it doesn't exist
    this.db.run(`
      ALTER TABLE game_settings ADD COLUMN hide_qr_during_game BOOLEAN DEFAULT 1
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding hide_qr_during_game column:', err);
      }
    });

    // Add auto_clear_players column to existing game_settings table if it doesn't exist
    this.db.run(`
      ALTER TABLE game_settings ADD COLUMN auto_clear_players BOOLEAN DEFAULT 1
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding auto_clear_players column:', err);
      }
    });

    // Add player_join_timeout column to existing game_settings table if it doesn't exist
    this.db.run(`
      ALTER TABLE game_settings ADD COLUMN player_join_timeout INTEGER DEFAULT 60
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding player_join_timeout column:', err);
      }
    });

    // Add show_player_count column to existing game_settings table if it doesn't exist
    this.db.run(`
      ALTER TABLE game_settings ADD COLUMN show_player_count BOOLEAN DEFAULT 1
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding show_player_count column:', err);
      }
    });

    // Create teams table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT DEFAULT '#3B82F6',
        score INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create team_members table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS team_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
        FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE,
        UNIQUE(player_id) -- Each player can only be on one team
      )
    `);

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
    `);

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
    `);

    // Add team_id column to existing players table if it doesn't exist
    this.db.run(`
      ALTER TABLE players ADD COLUMN team_id INTEGER REFERENCES teams(id)
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding team_id column to players:', err);
      }
    });

    // Add team_id column to existing player_answers table if it doesn't exist
    this.db.run(`
      ALTER TABLE player_answers ADD COLUMN team_id INTEGER REFERENCES teams(id)
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding team_id column to player_answers:', err);
      }
    });

    // Add buzz_order column to existing player_answers table if it doesn't exist
    this.db.run(`
      ALTER TABLE player_answers ADD COLUMN buzz_order INTEGER DEFAULT NULL
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding buzz_order column to player_answers:', err);
      }
    });

    // Add team_mode column to existing game_settings table if it doesn't exist
    this.db.run(`
      ALTER TABLE game_settings ADD COLUMN team_mode BOOLEAN DEFAULT 0
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding team_mode column:', err);
      }
    });

    // Add buzzer_enabled column to existing game_settings table if it doesn't exist
    this.db.run(`
      ALTER TABLE game_settings ADD COLUMN buzzer_enabled BOOLEAN DEFAULT 0
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding buzzer_enabled column:', err);
      }
    });

    // Add buzzer_timeout column to existing game_settings table if it doesn't exist
    this.db.run(`
      ALTER TABLE game_settings ADD COLUMN buzzer_timeout INTEGER DEFAULT 5
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding buzzer_timeout column:', err);
      }
    });

    // Add team_size_limit column to existing game_settings table if it doesn't exist
    this.db.run(`
      ALTER TABLE game_settings ADD COLUMN team_size_limit INTEGER DEFAULT 4
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding team_size_limit column:', err);
      }
    });

    // Add feud_answers column to existing questions table for storing feud answers if it doesn't exist
    this.db.run(`
      ALTER TABLE questions ADD COLUMN feud_answers TEXT DEFAULT NULL
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding feud_answers column:', err);
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
      SELECT id, category, question, type, options, answer, explanation, image_url, feud_answers, created_at, updated_at 
      FROM questions ORDER BY created_at DESC
    `, (err, rows) => {
      if (err) {
        callback(err, null);
        return;
      }
      
      // Parse JSON options and feud_answers for each question
      const questions = rows.map(row => ({
        ...row,
        options: JSON.parse(row.options),
        feud_answers: row.feud_answers ? JSON.parse(row.feud_answers) : []
      }));
      
      callback(null, questions);
    });
  }

  addQuestion(question, callback) {
    const { category, question: text, type, options, answer, explanation, image_url, feud_answers } = question;
    
    this.db.run(`
      INSERT INTO questions (category, question, type, options, answer, explanation, image_url, feud_answers)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [category, text, type || 'multiple_choice', JSON.stringify(options), answer, explanation, image_url, JSON.stringify(feud_answers || [])], function(err) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, { id: this.lastID, ...question });
    });
  }

  updateQuestion(id, question, callback) {
    const { category, question: text, type, options, answer, explanation, image_url, feud_answers } = question;
    
    this.db.run(`
      UPDATE questions 
      SET category = ?, question = ?, type = ?, options = ?, answer = ?, explanation = ?, image_url = ?, feud_answers = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [category, text, type || 'multiple_choice', JSON.stringify(options), answer, explanation, image_url, JSON.stringify(feud_answers || []), id], function(err) {
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
        row.timer_eats_points = !!row.timer_eats_points;
        row.hide_qr_during_game = !!row.hide_qr_during_game;
        row.auto_clear_players = !!row.auto_clear_players;
        row.show_player_count = !!row.show_player_count;
        row.team_mode = !!row.team_mode;
        row.buzzer_enabled = !!row.buzzer_enabled;
      }
      
      callback(null, row);
    });
  }

  updateGameSettings(settings, callback) {
    // First get existing settings, then merge with new settings
    this.getGameSettings((err, existingSettings) => {
      if (err) {
        return callback(err);
      }

      // Merge existing settings with new partial settings
      const mergedSettings = {
        ...existingSettings,
        ...settings
      };

      const {
        game_title,
        game_subtitle, 
        show_question_counter,
        show_wait_screen,
        timed_rounds,
        time_limit,
        question_limit,
        selected_categories,
        player_mode,
        host_password,
        score_multiplier,
        timer_eats_points,
        min_points_percentage,
        hide_qr_during_game,
        auto_clear_players,
        player_join_timeout,
        show_player_count,
        team_mode,
        buzzer_enabled,
        buzzer_timeout,
        team_size_limit
      } = mergedSettings;

      this.db.run(`
        UPDATE game_settings 
        SET game_title = ?, game_subtitle = ?, show_question_counter = ?, 
            show_wait_screen = ?, timed_rounds = ?, time_limit = ?, 
            question_limit = ?, selected_categories = ?, player_mode = ?, 
            host_password = ?, score_multiplier = ?, timer_eats_points = ?, 
            min_points_percentage = ?, hide_qr_during_game = ?, auto_clear_players = ?, 
            player_join_timeout = ?, show_player_count = ?, team_mode = ?, 
            buzzer_enabled = ?, buzzer_timeout = ?, team_size_limit = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `, [
        game_title, game_subtitle, show_question_counter, 
        show_wait_screen, timed_rounds, time_limit, 
        question_limit, JSON.stringify(selected_categories), player_mode,
        host_password, score_multiplier, timer_eats_points, min_points_percentage, hide_qr_during_game,
        auto_clear_players, player_join_timeout, show_player_count, team_mode,
        buzzer_enabled, buzzer_timeout, team_size_limit
      ], function(err) {
        if (err) {
          callback(err);
          return;
        }
        callback(null);
      });
    });
  }

  validateHostPassword(password, callback) {
    this.db.get(`
      SELECT host_password FROM game_settings WHERE id = 1
    `, (err, row) => {
      if (err) {
        callback(err, false);
        return;
      }
      
      if (!row) {
        callback(new Error('Game settings not found'), false);
        return;
      }
      
      // If no password is set, allow access
      if (!row.host_password) {
        callback(null, true);
        return;
      }
      
      // Check if provided password matches
      const isValid = password === row.host_password;
      callback(null, isValid);
    });
  }

  // Player methods
  getAllPlayers(callback) {
    this.db.all(`
      SELECT id, name, score, connected, joined_at, last_seen 
      FROM players ORDER BY score DESC, joined_at ASC
    `, callback);
  }

  addPlayer(name, password, callback) {
    // Hash the password
    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) {
        callback(err, null);
        return;
      }
      
      this.db.run(`
        INSERT INTO players (name, password) VALUES (?, ?)
      `, [name, hashedPassword], function(err) {
        if (err) {
          callback(err, null);
          return;
        }
        callback(null, { id: this.lastID, name, score: 0, connected: 1 });
      });
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

  authenticatePlayer(name, password, callback) {
    this.db.get(`
      SELECT id, name, password, score, connected, joined_at, last_seen 
      FROM players WHERE name = ?
    `, [name], (err, row) => {
      if (err) {
        callback(err, null);
        return;
      }
      
      if (!row) {
        callback(null, null); // Player not found
        return;
      }
      
      // Compare password
      bcrypt.compare(password, row.password, (err, isMatch) => {
        if (err) {
          callback(err, null);
          return;
        }
        
        if (isMatch) {
          // Remove password from returned data
          const { password: _, ...playerData } = row;
          callback(null, playerData);
        } else {
          callback(null, null); // Invalid password
        }
      });
    });
  }

  changePlayerPassword(playerId, oldPassword, newPassword, callback) {
    // First verify the old password
    this.db.get(`
      SELECT password FROM players WHERE id = ?
    `, [playerId], (err, row) => {
      if (err) {
        callback(err, false);
        return;
      }
      
      if (!row) {
        callback(new Error('Player not found'), false);
        return;
      }
      
      // Verify old password
      bcrypt.compare(oldPassword, row.password, (err, isMatch) => {
        if (err) {
          callback(err, false);
          return;
        }
        
        if (!isMatch) {
          callback(new Error('Current password is incorrect'), false);
          return;
        }
        
        // Hash new password and update
        bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
          if (err) {
            callback(err, false);
            return;
          }
          
          this.db.run(`
            UPDATE players 
            SET password = ?, last_seen = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [hashedPassword, playerId], function(err) {
            if (err) {
              callback(err, false);
              return;
            }
            callback(null, true);
          });
        });
      });
    });
  }

  resetPlayerPassword(playerId, newPassword, callback) {
    // Hash new password
    bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
      if (err) {
        callback(err, false);
        return;
      }
      
      this.db.run(`
        UPDATE players 
        SET password = ?, last_seen = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [hashedPassword, playerId], function(err) {
        if (err) {
          callback(err, false);
          return;
        }
        callback(null, true);
      });
    });
  }

  // Player answer methods
  submitPlayerAnswer(playerId, questionId, selectedAnswer, timeRemaining = null, timeLimit = null, callback) {
    // Handle backward compatibility
    if (typeof timeRemaining === 'function') {
      callback = timeRemaining;
      timeRemaining = null;
      timeLimit = null;
    }
    
    this.db.run(`
      INSERT OR REPLACE INTO player_answers (player_id, question_id, selected_answer, time_remaining, time_limit, submitted_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [playerId, questionId, selectedAnswer, timeRemaining, timeLimit], callback);
  }

  submitPlayerAnswerWithCorrectness(playerId, questionId, selectedAnswer, isCorrect, timeRemaining = null, timeLimit = null, lockedScore = null, callback) {
    // Handle backward compatibility
    if (typeof timeRemaining === 'function') {
      callback = timeRemaining;
      timeRemaining = null;
      timeLimit = null;
      lockedScore = null;
    } else if (typeof timeLimit === 'function') {
      callback = timeLimit;
      timeLimit = null;
      lockedScore = null;
    } else if (typeof lockedScore === 'function') {
      callback = lockedScore;
      lockedScore = null;
    }
    
    this.db.run(`
      INSERT OR REPLACE INTO player_answers (player_id, question_id, selected_answer, is_correct, time_remaining, time_limit, locked_score, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [playerId, questionId, selectedAnswer, isCorrect, timeRemaining, timeLimit, lockedScore], callback);
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
  scoreCorrectAnswersForQuestion(questionId, callback) {
    // First get the score multiplier from game settings
    this.getGameSettings((err, settings) => {
      if (err) {
        return callback(err);
      }

      const scoreMultiplier = settings?.score_multiplier || 10;
      const timerEatsPoints = settings?.timer_eats_points || false;
      const minPointsPercentage = settings?.min_points_percentage || 25;

      // Get all correct answers for this question
      console.log(`🔍 Looking for correct answers for question ID: ${questionId}`);
      this.db.all(`
        SELECT pa.player_id, p.score as current_score, pa.time_remaining, pa.time_limit, pa.locked_score
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
          let pointsAwarded;

          // Use locked score if available (Timer Eats Points mode)
          if (answer.locked_score !== null) {
            pointsAwarded = answer.locked_score;
            console.log(`🔒 Using locked score for player ${answer.player_id}: ${pointsAwarded} points`);
          } else {
            // Calculate score normally
            pointsAwarded = scoreMultiplier;
            
            // Apply timer-based scoring if enabled and timing data available
            if (timerEatsPoints && answer.time_remaining !== null && answer.time_limit !== null && answer.time_limit > 0) {
              const timeRatio = answer.time_remaining / answer.time_limit;
              const minRatio = minPointsPercentage / 100;
              const finalRatio = Math.max(minRatio, timeRatio);
              pointsAwarded = Math.round(scoreMultiplier * finalRatio);
            }
          }

          const newScore = answer.current_score + pointsAwarded;
          
          this.updatePlayerScore(answer.player_id, newScore, (err) => {
            if (!err) {
              scoreUpdates.push({
                playerId: answer.player_id,
                newScore: newScore,
                pointsAwarded: pointsAwarded
              });
            }
            
            completed++;
            if (completed === correctAnswers.length) {
              callback(null, scoreUpdates);
            }
          });
        });
      });
    });
  }

  // Pending points methods for write-in questions
  addPendingPoints(playerId, questionId, points, playerName, answer, callback) {
    this.db.run(`
      INSERT OR REPLACE INTO pending_points (player_id, question_id, points, player_name, answer, awarded_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [playerId, questionId, points, playerName, answer], function(err) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, { id: this.lastID, playerId, questionId, points, playerName, answer });
    });
  }

  updatePendingPoints(playerId, questionId, points, callback) {
    this.db.get(`
      SELECT * FROM pending_points WHERE player_id = ? AND question_id = ?
    `, [playerId, questionId], (err, existing) => {
      if (err) {
        return callback(err);
      }

      if (existing) {
        // Update existing pending points (add to existing)
        this.db.run(`
          UPDATE pending_points SET points = points + ?, awarded_at = CURRENT_TIMESTAMP
          WHERE player_id = ? AND question_id = ?
        `, [points, playerId, questionId], callback);
      } else {
        callback(new Error('No pending points found for this player and question'));
      }
    });
  }

  setPendingPoints(playerId, questionId, points, callback) {
    this.db.get(`
      SELECT * FROM pending_points WHERE player_id = ? AND question_id = ?
    `, [playerId, questionId], (err, existing) => {
      if (err) {
        return callback(err);
      }

      if (existing) {
        // Set/replace existing pending points
        this.db.run(`
          UPDATE pending_points SET points = ?, awarded_at = CURRENT_TIMESTAMP
          WHERE player_id = ? AND question_id = ?
        `, [points, playerId, questionId], callback);
      } else {
        callback(new Error('No pending points found for this player and question'));
      }
    });
  }

  getPendingPointsForQuestion(questionId, callback) {
    this.db.all(`
      SELECT * FROM pending_points WHERE question_id = ? ORDER BY awarded_at ASC
    `, [questionId], callback);
  }

  commitPendingPointsForQuestion(questionId, callback) {
    // Get all pending points for this question
    this.db.all(`
      SELECT pp.*, p.score as current_score
      FROM pending_points pp
      JOIN players p ON pp.player_id = p.id
      WHERE pp.question_id = ?
    `, [questionId], (err, pendingPoints) => {
      if (err) {
        return callback(err);
      }

      if (pendingPoints.length === 0) {
        return callback(null, []);
      }

      // Update player scores and remove pending points
      let completed = 0;
      const scoreUpdates = [];

      pendingPoints.forEach(pending => {
        const newScore = pending.current_score + pending.points;
        
        this.updatePlayerScore(pending.player_id, newScore, (err) => {
          if (!err) {
            scoreUpdates.push({
              playerId: pending.player_id,
              newScore: newScore,
              pointsAwarded: pending.points
            });
          }
          
          completed++;
          if (completed === pendingPoints.length) {
            // Remove all pending points for this question
            this.db.run(`
              DELETE FROM pending_points WHERE question_id = ?
            `, [questionId], (err) => {
              if (err) {
                console.error('Error removing pending points:', err);
              }
              callback(null, scoreUpdates);
            });
          }
        });
      });
    });
  }

  clearPendingPointsForQuestion(questionId, callback) {
    this.db.run(`
      DELETE FROM pending_points WHERE question_id = ?
    `, [questionId], callback);
  }

  clearAllPendingPoints(callback) {
    this.db.run(`
      DELETE FROM pending_points
    `, callback);
  }

  // Team management methods
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

  getTeamById(teamId, callback) {
    this.db.get(`
      SELECT t.*, 
             COUNT(tm.player_id) as member_count,
             GROUP_CONCAT(p.name) as member_names
      FROM teams t
      LEFT JOIN team_members tm ON t.id = tm.team_id
      LEFT JOIN players p ON tm.player_id = p.id
      WHERE t.id = ?
      GROUP BY t.id
    `, [teamId], callback);
  }

  joinTeam(playerId, teamId, callback) {
    // Check team size limit first
    this.getGameSettings((err, settings) => {
      if (err) return callback(err);
      
      const teamSizeLimit = settings?.team_size_limit || 4;
      
      // Count current team members
      this.db.get(`
        SELECT COUNT(*) as count FROM team_members WHERE team_id = ?
      `, [teamId], (err, row) => {
        if (err) return callback(err);
        
        if (row.count >= teamSizeLimit) {
          return callback(new Error('Team is full'));
        }
        
        // Remove player from any existing team first
        this.db.run(`
          DELETE FROM team_members WHERE player_id = ?
        `, [playerId], (err) => {
          if (err) return callback(err);
          
          // Add player to new team
          this.db.run(`
            INSERT INTO team_members (team_id, player_id) VALUES (?, ?)
          `, [teamId, playerId], (err) => {
            if (err) return callback(err);
            
            // Update player's team_id
            this.db.run(`
              UPDATE players SET team_id = ? WHERE id = ?
            `, [teamId, playerId], callback);
          });
        });
      });
    });
  }

  leaveTeam(playerId, callback) {
    // Remove from team_members
    this.db.run(`
      DELETE FROM team_members WHERE player_id = ?
    `, [playerId], (err) => {
      if (err) return callback(err);
      
      // Clear player's team_id
      this.db.run(`
        UPDATE players SET team_id = NULL WHERE id = ?
      `, [playerId], callback);
    });
  }

  updateTeamScore(teamId, score, callback) {
    this.db.run(`
      UPDATE teams SET score = ? WHERE id = ?
    `, [score, teamId], callback);
  }

  deleteTeam(teamId, callback) {
    // This will cascade delete team_members due to foreign key constraint
    this.db.run(`
      UPDATE players SET team_id = NULL WHERE team_id = ?
    `, [teamId], (err) => {
      if (err) return callback(err);
      
      this.db.run(`
        DELETE FROM teams WHERE id = ?
      `, [teamId], callback);
    });
  }

  clearAllTeams(callback) {
    this.db.run(`
      UPDATE players SET team_id = NULL WHERE team_id IS NOT NULL
    `, (err) => {
      if (err) return callback(err);
      
      this.db.run(`
        DELETE FROM teams
      `, callback);
    });
  }

  // Buzzer methods
  submitBuzzerResponse(playerId, teamId, questionId, callback) {
    // Get current buzz count for ordering
    this.db.get(`
      SELECT COUNT(*) as count FROM buzzer_responses WHERE question_id = ?
    `, [questionId], (err, row) => {
      if (err) return callback(err);
      
      const buzzOrder = (row.count || 0) + 1;
      
      this.db.run(`
        INSERT OR REPLACE INTO buzzer_responses (player_id, team_id, question_id, buzz_order, buzz_time)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [playerId, teamId, questionId, buzzOrder], function(err) {
        if (err) {
          callback(err, null);
          return;
        }
        callback(null, { 
          id: this.lastID, 
          player_id: playerId, 
          team_id: teamId, 
          question_id: questionId, 
          buzz_order: buzzOrder,
          buzz_time: new Date().toISOString()
        });
      });
    });
  }

  getBuzzerResponses(questionId, callback) {
    this.db.all(`
      SELECT br.*, p.name as player_name, t.name as team_name, t.color as team_color
      FROM buzzer_responses br
      LEFT JOIN players p ON br.player_id = p.id
      LEFT JOIN teams t ON br.team_id = t.id
      WHERE br.question_id = ?
      ORDER BY br.buzz_order ASC
    `, [questionId], callback);
  }

  clearBuzzerResponses(questionId, callback) {
    this.db.run(`
      DELETE FROM buzzer_responses WHERE question_id = ?
    `, [questionId], callback);
  }

  // Feud question methods
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
        questionId, 
        answerText, 
        points: points || 1, 
        displayOrder: displayOrder || 1,
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

  close() {
    this.db.close();
  }
}

module.exports = Database;