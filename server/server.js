const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const Database = require('./database');
const GameState = require('./gameState');

// Initialize database and game state
const db = new Database();
const gameState = new GameState();

// Create Express app
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../dist')));

// API Routes (except players - initialized after WebSocket server)
app.use('/api/questions', require('./routes/questions')(db, gameState));
app.use('/api/game', require('./routes/game')(db, gameState));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    clients: gameState.clients.size
  });
});

// Network info endpoint for QR code generation
app.get('/api/network', (req, res) => {
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  
  // Find the primary network interface (non-internal IPv4)
  let networkIP = 'localhost';
  
  for (const interfaceName in networkInterfaces) {
    const addresses = networkInterfaces[interfaceName];
    for (const addr of addresses) {
      // Look for IPv4, non-internal addresses
      if (addr.family === 'IPv4' && !addr.internal) {
        networkIP = addr.address;
        break;
      }
    }
    if (networkIP !== 'localhost') break;
  }
  
  res.json({
    networkIP,
    frontendPort: 5173, // Default Vite dev server port
    backendPort: 3001,
    hostname: os.hostname()
  });
});

// Test route
app.get('/test', (req, res) => {
  res.sendFile(path.join(__dirname, '../test.html'));
});

// WebSocket server
const wss = new WebSocket.Server({ server });

// Initialize players and answers routes now that WebSocket server is available
app.use('/api/players', require('./routes/players')(db, wss));
app.use('/api/answers', require('./routes/answers')(db, wss));

// Serve React app for all other routes (must be last)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

wss.on('connection', (ws) => {
  console.log('Client connected');
  
  // Add client to game state
  gameState.addClient(ws);
  
  // Load and send game settings
  db.getGameSettings((err, settings) => {
    if (!err && settings) {
      gameState.updateSettings(settings);
    }
  });

  // Handle client messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received message:', data);
      
      switch (data.type) {
        case 'PING':
          ws.send(JSON.stringify({ type: 'PONG' }));
          break;
          
        case 'UPDATE_STATE':
          gameState.updateState(data.state);
          break;
          
        case 'GAME_ACTION':
          handleGameAction(data.action, data.payload);
          break;
          
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });

  // Handle client disconnect
  ws.on('close', () => {
    console.log('Client disconnected');
    gameState.removeClient(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    gameState.removeClient(ws);
  });
});

// Helper function to get current question ID
function getCurrentQuestionId() {
  const state = gameState.getState();
  if (!state.gameStarted || !state.firstQuestionStarted) {
    return null;
  }
  
  // We need to get the filtered questions to find the current one
  // For now, we'll need to fetch questions and apply the same filtering logic
  // This is a simplified version - in a real scenario, we'd want to cache this
  return new Promise((resolve) => {
    db.getAllQuestions((err, questions) => {
      if (err || !questions) {
        console.error('Failed to get questions for scoring:', err);
        return resolve(null);
      }
      
      // Apply same filtering logic as frontend
      let filtered = questions;
      if (state.selectedCategories && state.selectedCategories.length > 0) {
        filtered = questions.filter(q => state.selectedCategories.includes(q.category));
      }
      if (state.questionLimit && state.questionLimit > 0) {
        filtered = filtered.slice(0, state.questionLimit);
      }
      
      const currentQuestion = filtered[state.currentSlide];
      resolve(currentQuestion ? currentQuestion.id : null);
    });
  });
}

// Helper function to score a question and broadcast updates
function scoreQuestionAndBroadcast(questionIdPromise) {
  // Handle both direct ID and Promise
  Promise.resolve(questionIdPromise).then(questionId => {
    if (!questionId) return;
    
    console.log(`🏆 Scoring question ${questionId}...`);
    
    db.scoreCorrectAnswersForQuestion(questionId, 1, (err, scoreUpdates) => {
      if (err) {
        console.error('Failed to score correct answers:', err);
        return;
      }
      
      if (scoreUpdates.length > 0) {
        console.log(`✅ Awarded points to ${scoreUpdates.length} players`);
        
        // Broadcast score updates to all clients
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
      } else {
        console.log('📝 No correct answers to score for this question');
      }
    });
  });
}

function handleGameAction(action, payload) {
  console.log('🎮 Handling game action:', action, payload);
  switch (action) {
    case 'START_GAME':
      // Clear all previous answers when starting a new game
      db.clearAllPlayerAnswers((err) => {
        if (err) {
          console.error('Failed to clear player answers on game start:', err);
        } else {
          console.log('Cleared all player answers for new game');
          // Broadcast that all answers were cleared
          gameState.broadcast({
            type: 'all_answers_cleared',
            payload: { reason: 'game_start' }
          });
        }
      });
      gameState.startGame();
      break;
    case 'END_GAME':
      // Clear all answers when ending the game
      db.clearAllPlayerAnswers((err) => {
        if (err) {
          console.error('Failed to clear player answers on game end:', err);
        } else {
          console.log('Cleared all player answers on game end');
          // Broadcast that all answers were cleared
          gameState.broadcast({
            type: 'all_answers_cleared',
            payload: { reason: 'game_end' }
          });
        }
      });
      gameState.endGame();
      break;
    case 'NEXT_SLIDE':
      // Score current question before moving to next (if not already scored)
      scoreQuestionAndBroadcast(getCurrentQuestionId());
      gameState.nextSlide();
      break;
    case 'PREV_SLIDE':
      gameState.prevSlide();
      break;
    case 'SHOW_QUESTION':
      gameState.showQuestion();
      break;
    case 'TOGGLE_ANSWER':
      // Score correct answers when revealing the answer (if not already scored)
      if (!gameState.getState().showAnswer) {
        scoreQuestionAndBroadcast(getCurrentQuestionId());
      }
      gameState.toggleAnswer();
      break;
    case 'START_TIMER':
      gameState.updateState({ 
        isTimerRunning: true,
        firstQuestionStarted: true
      });
      break;
    case 'STOP_TIMER':
      gameState.updateState({ isTimerRunning: false });
      break;
    case 'RESET_TIMER':
      gameState.resetTimer();
      break;
    case 'TOGGLE_LEADERBOARD':
      gameState.updateState({ 
        showLeaderboard: !gameState.getState().showLeaderboard 
      });
      break;
    case 'RESET_QUESTION':
      gameState.updateState({ 
        firstQuestionStarted: false,
        showAnswer: false,
        isTimerRunning: false
      });
      gameState.resetTimer();
      break;
    case 'UPDATE_SETTINGS':
      // Update database settings
      db.updateGameSettings(payload, (err) => {
        if (!err) {
          gameState.updateSettings(payload);
        }
      });
      break;
    default:
      console.log('Unknown game action:', action);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  
  // Close WebSocket connections
  wss.clients.forEach((client) => {
    client.close();
  });
  
  // Close database
  db.close();
  
  // Close server
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Trivium server running on http://0.0.0.0:${PORT}`);
  console.log(`📱 Local access: http://localhost:${PORT}`);
  console.log(`🌐 Network access: http://[YOUR_IP]:${PORT}`);
  console.log(`💾 Database: SQLite`);
  console.log(`🔗 WebSocket: Active`);
});