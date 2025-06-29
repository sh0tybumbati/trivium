# Trivium Server

Networked trivia hosting server with real-time WebSocket sync and centralized SQLite database.

## Features

- **Real-time sync** between host and big screen devices via WebSocket
- **SQLite database** for centralized question storage
- **REST API** for question management (CRUD operations)
- **Game state management** with automatic timer handling
- **Multi-device support** - any device can connect via network
- **Question import/export** functionality
- **Automatic question defaults** on first startup

## Installation

1. Install dependencies:
```bash
cd server
npm install
```

2. Start the server:
```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

## Usage

1. **Start the server** on the host machine
2. **Note the network IP** displayed in console
3. **Connect devices** by visiting `http://[HOST_IP]:3001`
4. **Host device**: Use Host Mode to control the game
5. **Big screens**: Use Big Screen Mode for audience display

## API Endpoints

### Questions
- `GET /api/questions` - Get all questions
- `POST /api/questions` - Add new question
- `PUT /api/questions/:id` - Update question
- `DELETE /api/questions/:id` - Delete question
- `GET /api/questions/export` - Export questions as JSON
- `POST /api/questions/import` - Import questions from JSON

### Game Control
- `GET /api/game/state` - Get current game state
- `GET /api/game/settings` - Get game settings
- `PUT /api/game/settings` - Update game settings
- `POST /api/game/start` - Start game
- `POST /api/game/end` - End game
- `POST /api/game/next` - Next question
- `POST /api/game/previous` - Previous question
- `POST /api/game/show-question` - Show current question
- `POST /api/game/toggle-answer` - Toggle answer visibility
- `POST /api/game/start-timer` - Start timer
- `POST /api/game/stop-timer` - Stop timer
- `POST /api/game/reset-timer` - Reset timer

### Health
- `GET /api/health` - Server status and connected client count

## WebSocket Messages

### Client → Server
```json
{
  "type": "UPDATE_STATE",
  "state": { ... }
}

{
  "type": "GAME_ACTION",
  "action": "START_GAME",
  "payload": { ... }
}
```

### Server → Client
```json
{
  "type": "GAME_STATE_UPDATE", 
  "state": { ... }
}

{
  "type": "QUESTIONS_UPDATED",
  "action": "ADDED|UPDATED|DELETED|IMPORTED",
  "question": { ... }
}
```

## Database Schema

### Questions Table
- `id` - Primary key
- `category` - Question category
- `question` - Question text
- `options` - JSON array of 4 options
- `answer` - Correct answer
- `explanation` - Answer explanation
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

### Game Settings Table
- `id` - Primary key (always 1)
- `game_title` - Custom game title
- `game_subtitle` - Custom game subtitle
- `show_question_counter` - Boolean for question counters
- `show_wait_screen` - Boolean for wait screens
- `timed_rounds` - Boolean for timer usage
- `time_limit` - Seconds per question
- `question_limit` - Max questions per game
- `selected_categories` - JSON array of active categories
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

## Files

- `server.js` - Main Express + WebSocket server
- `database.js` - SQLite database management
- `gameState.js` - Real-time game state management
- `routes/questions.js` - Question API endpoints
- `routes/game.js` - Game control API endpoints
- `trivia.db` - SQLite database file (auto-created)

## Network Access

The server binds to `0.0.0.0` so it's accessible from other devices on the network. 

**Example:**
- Host machine IP: `192.168.1.100`
- Server runs on port: `3001`
- Other devices access via: `http://192.168.1.100:3001`