class GameState {
  constructor() {
    this.state = {
      gameStarted: false,
      firstQuestionStarted: false,
      currentSlide: 0,
      showAnswer: false,
      timer: 30,
      isTimerRunning: false,
      // Settings will be loaded from database
      selectedCategories: [],
      questionLimit: null,
      timeLimit: 30,
      timedRounds: true,
      gameTitle: 'TRIVIA NIGHT',
      gameSubtitle: 'Get Ready to Play!',
      showQuestionCounter: false,
      showWaitScreen: true,
      playerMode: false,
      includedQuestions: [],  // Playlist of question IDs in order
      
      // Family Feud game state
      feudState: {
        activeTeam: null,           // ID of team currently answering
        opposingTeam: null,         // ID of opposing team
        gamePhase: 'setup',         // 'setup', 'face-off', 'team-play', 'steal'
        teamAnswerCount: 0,         // How many team members have answered
        maxAnswersPerTeam: 3,       // Before switching to other team
        strikes: 0,                 // Current strike count
        buzzerOrder: [],            // Array of player IDs in buzz order for current team
        currentBuzzerIndex: 0,      // Which team member should buzz next
        lastAnswerCorrect: null     // Track if last answer was correct/wrong
      }
    };
    
    this.clients = new Set();
    this.timerInterval = null;
  }

  // Client management
  addClient(ws) {
    this.clients.add(ws);
    // Send current state to new client
    this.sendToClient(ws, {
      type: 'GAME_STATE_UPDATE',
      state: this.state
    });
  }

  removeClient(ws) {
    this.clients.delete(ws);
  }

  // State management
  updateState(newState) {
    // Debug what's causing timer state changes
    if (newState.isTimerRunning !== undefined) {
      console.log('🔍 Timer state change:', newState.isTimerRunning, 'from updateState:', JSON.stringify(newState));
      console.trace('Call stack:');
    }
    
    this.state = { ...this.state, ...newState };
    this.broadcastState();
    
    // Handle timer logic
    if (newState.isTimerRunning !== undefined) {
      if (newState.isTimerRunning) {
        this.startTimer();
      } else {
        this.stopTimer();
      }
    }
  }

  getState() {
    return { ...this.state };
  }

  // Settings management
  updateSettings(settings) {
    console.log('📥 Received settings update:', settings);
    console.log('📊 Current state before update:', {
      timedRounds: this.state.timedRounds,
      showWaitScreen: this.state.showWaitScreen
    });
    
    const settingsToUpdate = {
      gameTitle: settings.game_title,
      gameSubtitle: settings.game_subtitle,
      showQuestionCounter: settings.show_question_counter,
      showWaitScreen: settings.show_wait_screen,
      timedRounds: settings.timed_rounds,
      timeLimit: settings.time_limit || this.state.timeLimit || 30,
      questionLimit: settings.question_limit,
      selectedCategories: settings.selected_categories,
      playerMode: settings.player_mode
    };
    
    console.log('📋 Applying settings update:', settingsToUpdate);
    this.updateState(settingsToUpdate);
  }

  // Timer management
  startTimer() {
    console.log('🕒 Starting timer, current time:', this.state.timer);
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    
    this.timerInterval = setInterval(() => {
      if (this.state.timer > 0) {
        console.log('⏰ Timer tick:', this.state.timer - 1);
        // Update timer without triggering timer logic to avoid recursion
        this.state = { ...this.state, timer: this.state.timer - 1 };
        this.broadcastState();
      } else {
        console.log('⏰ Timer finished');
        this.updateState({ isTimerRunning: false });
        this.stopTimer();
      }
    }, 1000);
  }

  stopTimer() {
    console.log('🛑 Stopping timer');
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  resetTimer() {
    this.stopTimer();
    const timeLimit = this.state.timeLimit || 30;
    console.log('🔄 Reset timer to:', timeLimit, '(timeLimit was:', this.state.timeLimit, ')');
    this.updateState({ 
      timer: timeLimit, 
      isTimerRunning: false 
    });
  }

  // Game flow methods
  startGame() {
    this.updateState({
      gameStarted: true,
      firstQuestionStarted: false,
      currentSlide: 0,
      showAnswer: false
    });
    this.resetTimer();
  }

  endGame() {
    this.updateState({
      gameStarted: false,
      firstQuestionStarted: false,
      currentSlide: 0,
      showAnswer: false
    });
    this.resetTimer();
  }

  nextSlide() {
    // Reset timer FIRST to set correct time
    this.resetTimer();
    
    // Then update state - don't automatically show question, let host control it
    this.updateState({
      currentSlide: this.state.currentSlide + 1,
      showAnswer: false,
      firstQuestionStarted: false,
      isTimerRunning: false
    });
  }

  prevSlide() {
    // Reset timer FIRST to set correct time
    this.resetTimer();
    
    // Then update state - don't automatically show question, let host control it
    this.updateState({
      currentSlide: Math.max(0, this.state.currentSlide - 1),
      showAnswer: false,
      firstQuestionStarted: false,
      isTimerRunning: false
    });
  }

  showQuestion() {
    this.updateState({ firstQuestionStarted: true });
  }

  toggleAnswer() {
    this.updateState({ 
      showAnswer: !this.state.showAnswer,
      isTimerRunning: false
    });
  }

  // Communication
  broadcastState() {
    const message = {
      type: 'GAME_STATE_UPDATE',
      state: this.state
    };
    
    this.clients.forEach(client => {
      this.sendToClient(client, message);
    });
  }

  sendToClient(ws, message) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending message to client:', error);
        this.removeClient(ws);
      }
    }
  }

  broadcast(message) {
    this.clients.forEach(client => {
      this.sendToClient(client, message);
    });
  }

  // Family Feud State Management
  initializeFeudGame(activeTeamId, opposingTeamId) {
    this.updateState({
      feudState: {
        ...this.state.feudState,
        activeTeam: activeTeamId,
        opposingTeam: opposingTeamId,
        gamePhase: 'face-off',
        teamAnswerCount: 0,
        strikes: 0,
        buzzerOrder: [],
        currentBuzzerIndex: 0,
        lastAnswerCorrect: null
      }
    });
    
    this.broadcast({
      type: 'feud_game_initialized',
      activeTeam: activeTeamId,
      opposingTeam: opposingTeamId
    });
  }

  switchFeudTeams() {
    const currentActive = this.state.feudState.activeTeam;
    const currentOpposing = this.state.feudState.opposingTeam;
    
    this.updateState({
      feudState: {
        ...this.state.feudState,
        activeTeam: currentOpposing,
        opposingTeam: currentActive,
        teamAnswerCount: 0,
        buzzerOrder: [],
        currentBuzzerIndex: 0,
        gamePhase: 'team-play'
      }
    });
    
    this.broadcast({
      type: 'feud_teams_switched',
      newActiveTeam: currentOpposing,
      newOpposingTeam: currentActive
    });
  }

  addFeudStrike() {
    const newStrikes = this.state.feudState.strikes + 1;
    this.updateState({
      feudState: {
        ...this.state.feudState,
        strikes: newStrikes
      }
    });
    
    // If 3 strikes, switch teams
    if (newStrikes >= 3) {
      this.switchFeudTeams();
    }
    
    this.broadcast({
      type: 'feud_strike_added',
      strikes: newStrikes,
      teamsSwitch: newStrikes >= 3
    });
  }

  removeFeudStrike() {
    const newStrikes = Math.max(0, this.state.feudState.strikes - 1);
    this.updateState({
      feudState: {
        ...this.state.feudState,
        strikes: newStrikes
      }
    });
    
    this.broadcast({
      type: 'feud_strike_removed',
      strikes: newStrikes
    });
  }

  setFeudGamePhase(phase) {
    this.updateState({
      feudState: {
        ...this.state.feudState,
        gamePhase: phase
      }
    });
    
    this.broadcast({
      type: 'feud_phase_changed',
      phase: phase
    });
  }

  addPlayerToBuzzerOrder(playerId) {
    const currentOrder = [...this.state.feudState.buzzerOrder];
    if (!currentOrder.includes(playerId)) {
      currentOrder.push(playerId);
      
      this.updateState({
        feudState: {
          ...this.state.feudState,
          buzzerOrder: currentOrder
        }
      });
      
      this.broadcast({
        type: 'feud_buzzer_order_updated',
        buzzerOrder: currentOrder
      });
    }
  }

  getNextPlayerInBuzzerOrder() {
    const { buzzerOrder, currentBuzzerIndex } = this.state.feudState;
    if (buzzerOrder.length === 0) return null;
    
    return buzzerOrder[currentBuzzerIndex % buzzerOrder.length];
  }

  advanceBuzzerOrder() {
    this.updateState({
      feudState: {
        ...this.state.feudState,
        currentBuzzerIndex: this.state.feudState.currentBuzzerIndex + 1,
        teamAnswerCount: this.state.feudState.teamAnswerCount + 1
      }
    });
  }

  resetFeudState() {
    this.updateState({
      feudState: {
        activeTeam: null,
        opposingTeam: null,
        gamePhase: 'setup',
        teamAnswerCount: 0,
        maxAnswersPerTeam: 3,
        strikes: 0,
        buzzerOrder: [],
        currentBuzzerIndex: 0,
        lastAnswerCorrect: null
      }
    });
    
    this.broadcast({
      type: 'feud_state_reset'
    });
  }
}

module.exports = GameState;