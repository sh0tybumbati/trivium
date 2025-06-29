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
      showWaitScreen: true
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
      selectedCategories: settings.selected_categories
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
    const shouldShowQuestion = !this.state.showWaitScreen;
    const shouldStartTimer = shouldShowQuestion && this.state.timedRounds;
    
    // Reset timer FIRST to set correct time
    this.resetTimer();
    
    // Then update state (including starting timer if needed)
    this.updateState({
      currentSlide: this.state.currentSlide + 1,
      showAnswer: false,
      firstQuestionStarted: shouldShowQuestion,
      isTimerRunning: shouldStartTimer
    });
  }

  prevSlide() {
    const shouldShowQuestion = !this.state.showWaitScreen;
    const shouldStartTimer = shouldShowQuestion && this.state.timedRounds;
    
    // Reset timer FIRST to set correct time
    this.resetTimer();
    
    // Then update state (including starting timer if needed)
    this.updateState({
      currentSlide: Math.max(0, this.state.currentSlide - 1),
      showAnswer: false,
      firstQuestionStarted: shouldShowQuestion,
      isTimerRunning: shouldStartTimer
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
}

module.exports = GameState;