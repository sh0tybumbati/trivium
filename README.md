# Trivium - Networked Trivia System

A professional trivia hosting system with Art Deco styling, real-time multi-device sync, and centralized question management.

## Features

🎯 **Multi-Device Hosting**
- Host controls from any device
- Multiple big screens supported
- Real-time WebSocket synchronization
- Network-based question sharing

🎨 **Great Gatsby Art Deco Design**
- Gold, black, and emerald color scheme
- Geometric patterns and elegant typography
- Professional presentation quality

🎮 **Game Management**
- Customizable game title and subtitle
- Timer controls (enable/disable, custom durations)
- Category-based question filtering
- Question limit settings
- Wait screens between questions

📊 **Question Management**
- Centralized SQLite database
- Import/export functionality
- Real-time question sync across devices
- Full CRUD operations via web interface

⚡ **Real-Time Sync**
- WebSocket-based communication
- Instant updates across all connected devices
- Automatic reconnection handling
- Server-authoritative game state

## Architecture

### Frontend (React + TypeScript)
- **Landing Mode**: Choose between Host or Big Screen
- **Host Mode**: Full game control and question management
- **Big Screen Mode**: Clean audience display for projection

### Backend (Node.js + WebSocket + SQLite)
- **WebSocket Server**: Real-time state synchronization
- **REST API**: Question and settings management
- **SQLite Database**: Centralized question storage
- **Static Serving**: Serves the React app

## Quick Start

### 1. Install Dependencies
```bash
# Frontend
npm install

# Backend  
cd server
npm install
```

### 2. Build Frontend
```bash
npm run build
```

### 3. Start Server
```bash
cd server
npm start
```

### 4. Access the System
- **Host machine**: http://localhost:3001
- **Other devices**: http://[HOST_IP]:3001

## Development

### Frontend Development
```bash
npm run dev  # Vite dev server on port 5173
```

### Backend Development
```bash
cd server
npm run dev  # Nodemon auto-restart
```

## Usage

1. **Start the server** on the host machine
2. **Note the IP address** shown in the console
3. **Connect host device** - choose "Host Mode"
4. **Connect big screens** - choose "Big Screen Mode" 
5. **Customize settings** in Host Mode (title, categories, etc.)
6. **Start the game** and control from Host Mode
7. **All devices sync automatically** via WebSocket

## Configuration

### Game Settings (Host Mode)
- **Game Title**: Custom title displayed everywhere
- **Game Subtitle**: Custom subtitle for waiting screens  
- **Question Info**: Show/hide question and category counts
- **Wait Screen**: Enable/disable trophy screen between questions
- **Timer Settings**: Enable/disable timer, set duration per question
- **Question Limit**: Limit number of questions per game
- **Categories**: Select which categories to include

### Network Access
The server automatically detects and displays network access information:
```
🚀 Trivium server running on http://0.0.0.0:3001
📱 Local access: http://localhost:3001
🌐 Network access: http://[YOUR_IP]:3001
```

## API Documentation

See `/server/README.md` for complete API documentation.

## File Structure

```
/Trivium
├── src/                  # React frontend source
├── dist/                 # Built frontend files  
├── server/               # Node.js backend
│   ├── server.js         # Main server
│   ├── database.js       # SQLite management
│   ├── gameState.js      # Real-time state
│   ├── routes/           # API endpoints
│   └── trivia.db         # SQLite database
├── package.json          # Frontend dependencies
└── README.md             # This file
```

## Technology Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Backend**: Node.js, Express, WebSocket (ws)
- **Database**: SQLite3
- **Styling**: Tailwind CSS with custom Art Deco theme
- **Icons**: Lucide React

## Future Features

- **Player Mode**: Audience participation via mobile devices
- **Scoring System**: Track player scores and leaderboards  
- **Team Mode**: Team-based gameplay
- **Admin Dashboard**: Advanced game management
- **Cloud Sync**: Optional cloud backup and sharing