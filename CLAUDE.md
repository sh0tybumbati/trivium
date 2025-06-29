# Trivium - Networked Trivia System

## Current Status: Converting to Networked Architecture

### What We've Built So Far:
- React/TypeScript trivia webapp with Art Deco styling
- Three modes: Landing, Big Screen (audience display), Host (game control)
- localStorage-based sync between tabs on same device
- Customizable game title/subtitle, question counters, wait screens
- Timer controls, category selection, question management
- Export/import functionality for questions

### Current Implementation:
- **Frontend**: React with localStorage sync between browser tabs
- **Questions**: Stored locally in browser localStorage
- **Game State**: Synced via localStorage + storage events
- **Limitation**: Only works on single device, no network sync

### What We're Converting To:
- **Backend Server**: Node.js + Express + WebSocket + SQLite
- **Real-time Sync**: WebSocket for game state across network
- **Centralized Questions**: SQLite database on host machine
- **Multi-device**: Any device can connect to host's IP address
- **API**: REST endpoints for question CRUD operations

### Architecture Plan:
```
/server
  ├── package.json
  ├── server.js         # Express + WebSocket server
  ├── database.js       # SQLite setup & question queries  
  ├── gameState.js      # Game state management
  └── routes/
      ├── questions.js  # Question API endpoints
      └── game.js       # Game state API
```

### Frontend Changes Needed:
- Replace localStorage with WebSocket client
- Replace question localStorage with API calls
- Add server connection handling
- Keep existing UI/UX unchanged

### Future Feature Ideas:
- Player mode: Audience joins with phones to submit answers
- Scoring system for player mode
- Admin dashboard for multiple games

### Current Task:
Creating the backend server infrastructure to enable networked trivia hosting.