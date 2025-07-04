import { useState, useEffect, useCallback } from 'react';
import apiService, { Question, GameSettings, GameState, Player } from '../services/api';
import websocketService from '../services/websocket';

interface UseNetworkedGameReturn {
  // State
  questions: Question[];
  players: Player[];
  gameState: GameState;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  // Question management
  addQuestion: (question: Omit<Question, 'id'>) => Promise<void>;
  updateQuestion: (id: number, question: Omit<Question, 'id'>) => Promise<void>;
  deleteQuestion: (id: number) => Promise<void>;
  exportQuestions: () => Promise<void>;
  importQuestions: (questions: Question[]) => Promise<void>;
  refreshQuestions: () => Promise<void>;

  // Game control (Host mode only)
  startGame: () => void;
  endGame: () => void;
  nextSlide: () => void;
  prevSlide: () => void;
  showQuestion: () => void;
  toggleAnswer: () => void;
  startTimer: () => void;
  stopTimer: () => void;
  resetTimer: () => void;
  toggleLeaderboard: () => void;

  // Settings
  updateSettings: (settings: Partial<GameSettings>) => Promise<void>;

  // Player management (Host mode only)
  refreshPlayers: () => Promise<void>;
  clearAllPlayers: () => Promise<void>;
  resetPlayerScore: (playerId: number) => Promise<void>;
  resetAllPlayerScores: () => Promise<void>;

  // Answer management
  submitAnswer: (playerId: number, questionId: number, selectedAnswer: string) => Promise<void>;
  getPlayerAnswer: (playerId: number, questionId: number) => Promise<any>;
  getQuestionAnswers: (questionId: number) => Promise<any[]>;
  clearQuestionAnswers: (questionId: number) => Promise<void>;

  // Awarded answers
  awardPoints: (playerId: number, questionId: number, points: number, playerName: string, answer: string) => Promise<void>;
  getAwardedAnswers: (questionId?: number) => any;

  // Utility
  getFilteredQuestions: () => Question[];
  getAvailableCategories: () => string[];
}

const initialGameState: GameState = {
  gameStarted: false,
  firstQuestionStarted: false,
  currentSlide: 0,
  showAnswer: false,
  timer: 30,
  isTimerRunning: false,
  selectedCategories: [],
  questionLimit: null,
  timeLimit: 30,
  timedRounds: true,
  gameTitle: 'TRIVIA NIGHT',
  gameSubtitle: 'Get Ready to Play!',
  showQuestionCounter: false,
  showWaitScreen: true,
  playerMode: false,
  showLeaderboard: false,
};

export const useNetworkedGame = (appMode: 'landing' | 'bigscreen' | 'host' | 'guest'): UseNetworkedGameReturn => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questionAnswers, setQuestionAnswers] = useState<{[key: number]: any[]}>({});
  // Load awarded answers from localStorage on init
  const [awardedAnswers, setAwardedAnswers] = useState<{[questionId: number]: {playerId: number, playerName: string, answer: string, points: number}[]}>(() => {
    try {
      const saved = localStorage.getItem('trivium-awarded-answers');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Initialize connection and load data
  useEffect(() => {
    const initializeData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Load questions and game state
        const promises = [
          apiService.getQuestions(),
          apiService.getGameState()
        ];

        // Load players data for host mode
        if (appMode === 'host') {
          promises.push(apiService.getPlayers());
        }

        const results = await Promise.all(promises);
        const [questionsData, stateData, playersData] = results;

        setQuestions(questionsData || []);
        setGameState(stateData || initialGameState);
        if (appMode === 'host' && playersData) {
          setPlayers(playersData as Player[]);
          console.log('🎯 Auto-loaded players for host mode:', playersData.length);
        }
      } catch (err) {
        console.error('Failed to initialize data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
        // Set safe defaults even on error
        setQuestions([]);
        setGameState(initialGameState);
      } finally {
        setIsLoading(false);
      }
    };

    initializeData();

    // Set up WebSocket event listeners
    const unsubscribeConnection = websocketService.onConnection((connected) => {
      setIsConnected(connected);
      
      // Auto-refresh data when connection is restored
      if (connected) {
        console.log('🔗 WebSocket reconnected - auto-refreshing data');
        if (appMode === 'host') {
          console.log('🔄 Auto-refreshing players due to reconnection');
          refreshPlayers();
        }
      }
    });
    const unsubscribeStateUpdate = websocketService.onStateUpdate((newState) => {
      // Clear answer state when game starts or ends
      setGameState(prevState => {
        if (newState.gameStarted !== prevState.gameStarted) {
          // Game state changed - clear all local answer data
          setQuestionAnswers({});
          console.log('Game state changed - cleared hook answer data');
          
          // Clear awarded answers when game starts/ends
          setAwardedAnswers({});
          localStorage.removeItem('trivium-awarded-answers');
          console.log('Game state changed - cleared awarded answers');
        }
        return newState;
      });
    });
    const unsubscribeQuestionsUpdate = websocketService.onQuestionsUpdate((action, data) => {
      console.log('Questions updated:', action, data);
      // Refresh questions when they're updated on the server
      refreshQuestions();
    });
    const unsubscribePlayersUpdate = websocketService.onPlayersUpdate((action, data) => {
      console.log('👥 Players updated:', action, data, 'appMode:', appMode);
      // Refresh players when they're updated on the server (host mode only)
      if (appMode === 'host') {
        console.log('🔄 Auto-refreshing players due to WebSocket update');
        refreshPlayers();
      }
    });
    const unsubscribeAnswersUpdate = websocketService.onAnswersUpdate((action, data) => {
      console.log('🎯 Hook received answer update:', action, data, 'appMode:', appMode);
      
      if (action === 'all_answers_cleared') {
        // Clear all answer data when all answers are cleared
        setQuestionAnswers({});
        console.log('🧹 Cleared all answer data from hook');
      } else if (action === 'player_answer_submitted') {
        console.log('📋 Answer submitted - gameState.gameStarted:', gameState.gameStarted, 'appMode:', appMode);
        if (data?.questionId) {
          console.log('🔄 Refreshing answers for submitted question:', data.questionId);
          refreshQuestionAnswers(data.questionId);
          
          // Also refresh current question if it's different (for immediate display)
          if (gameState.gameStarted) {
            const currentQuestion = getFilteredQuestions()[gameState.currentSlide];
            console.log('🎯 Current question:', currentQuestion?.id, 'submitted for:', data?.questionId);
            if (currentQuestion?.id && currentQuestion.id !== data.questionId) {
              console.log('🔄 Also refreshing current question:', currentQuestion.id);
              refreshQuestionAnswers(currentQuestion.id);
            }
          }
        }
      } else if (action === 'answers_cleared' && data?.questionId) {
        // Clear answers for specific question
        setQuestionAnswers(prev => {
          const updated = { ...prev };
          delete updated[data.questionId];
          return updated;
        });
      }
    });

    return () => {
      unsubscribeConnection();
      unsubscribeStateUpdate();
      unsubscribeQuestionsUpdate();
      unsubscribePlayersUpdate();
      unsubscribeAnswersUpdate();
    };
  }, []);

  // Listen for localStorage changes (awarded answers sync between tabs)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'trivium-awarded-answers' && e.newValue) {
        try {
          const newAwardedAnswers = JSON.parse(e.newValue);
          console.log('📨 Received awarded answers from localStorage:', newAwardedAnswers);
          setAwardedAnswers(newAwardedAnswers);
        } catch (error) {
          console.error('Failed to parse awarded answers from localStorage:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);


  // Question management functions
  const refreshQuestions = useCallback(async () => {
    try {
      const questionsData = await apiService.getQuestions();
      setQuestions(questionsData);
    } catch (err) {
      console.error('Failed to refresh questions:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh questions');
    }
  }, []);

  const addQuestion = useCallback(async (question: Omit<Question, 'id'>) => {
    try {
      await apiService.addQuestion(question);
      // Questions will be refreshed via WebSocket notification
    } catch (err) {
      console.error('Failed to add question:', err);
      setError(err instanceof Error ? err.message : 'Failed to add question');
      throw err;
    }
  }, []);

  const updateQuestion = useCallback(async (id: number, question: Omit<Question, 'id'>) => {
    try {
      await apiService.updateQuestion(id, question);
      // Questions will be refreshed via WebSocket notification
    } catch (err) {
      console.error('Failed to update question:', err);
      setError(err instanceof Error ? err.message : 'Failed to update question');
      throw err;
    }
  }, []);

  const deleteQuestion = useCallback(async (id: number) => {
    try {
      await apiService.deleteQuestion(id);
      // Questions will be refreshed via WebSocket notification
    } catch (err) {
      console.error('Failed to delete question:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete question');
      throw err;
    }
  }, []);

  const exportQuestions = useCallback(async () => {
    try {
      const blob = await apiService.exportQuestions();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'trivia-questions.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export questions:', err);
      setError(err instanceof Error ? err.message : 'Failed to export questions');
      throw err;
    }
  }, []);

  const importQuestions = useCallback(async (questionsToImport: Question[]) => {
    try {
      await apiService.importQuestions(questionsToImport, 'replace');
      // Questions will be refreshed via WebSocket notification
    } catch (err) {
      console.error('Failed to import questions:', err);
      setError(err instanceof Error ? err.message : 'Failed to import questions');
      throw err;
    }
  }, []);

  // Player management functions (Host mode only)
  const refreshPlayers = useCallback(async () => {
    if (appMode === 'host') {
      try {
        const playersData = await apiService.getPlayers();
        setPlayers(playersData);
      } catch (err) {
        console.error('Failed to refresh players:', err);
        setError(err instanceof Error ? err.message : 'Failed to refresh players');
      }
    }
  }, [appMode]);

  const clearAllPlayers = useCallback(async () => {
    if (appMode === 'host') {
      try {
        await apiService.clearAllPlayers();
        setPlayers([]);
      } catch (err) {
        console.error('Failed to clear players:', err);
        setError(err instanceof Error ? err.message : 'Failed to clear players');
        throw err;
      }
    }
  }, [appMode]);

  const resetPlayerScore = useCallback(async (playerId: number) => {
    if (appMode === 'host') {
      try {
        await apiService.resetPlayerScore(playerId);
        // Player scores will be updated via WebSocket
      } catch (err) {
        console.error('Failed to reset player score:', err);
        setError(err instanceof Error ? err.message : 'Failed to reset player score');
        throw err;
      }
    }
  }, [appMode]);

  const resetAllPlayerScores = useCallback(async () => {
    if (appMode === 'host') {
      try {
        await apiService.resetAllPlayerScores();
        // Player scores will be updated via WebSocket
      } catch (err) {
        console.error('Failed to reset all player scores:', err);
        setError(err instanceof Error ? err.message : 'Failed to reset all player scores');
        throw err;
      }
    }
  }, [appMode]);

  // Answer management functions
  const submitAnswer = useCallback(async (playerId: number, questionId: number, selectedAnswer: string) => {
    try {
      await apiService.submitAnswer(playerId, questionId, selectedAnswer);
    } catch (err) {
      console.error('Failed to submit answer:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit answer');
      throw err;
    }
  }, []);

  const getPlayerAnswer = useCallback(async (playerId: number, questionId: number) => {
    try {
      return await apiService.getPlayerAnswer(playerId, questionId);
    } catch (err) {
      console.error('Failed to get player answer:', err);
      setError(err instanceof Error ? err.message : 'Failed to get player answer');
      throw err;
    }
  }, []);

  const getQuestionAnswers = useCallback(async (questionId: number) => {
    try {
      return await apiService.getQuestionAnswers(questionId);
    } catch (err) {
      console.error('Failed to get question answers:', err);
      setError(err instanceof Error ? err.message : 'Failed to get question answers');
      return [];
    }
  }, []);

  const refreshQuestionAnswers = useCallback(async (questionId: number) => {
    try {
      const answers = await apiService.getQuestionAnswers(questionId);
      setQuestionAnswers(prev => ({ ...prev, [questionId]: answers }));
    } catch (err) {
      console.error('Failed to refresh question answers:', err);
    }
  }, []);

  const clearQuestionAnswers = useCallback(async (questionId: number) => {
    if (appMode === 'host') {
      try {
        await apiService.clearQuestionAnswers(questionId);
        setQuestionAnswers(prev => ({ ...prev, [questionId]: [] }));
      } catch (err) {
        console.error('Failed to clear question answers:', err);
        setError(err instanceof Error ? err.message : 'Failed to clear question answers');
        throw err;
      }
    }
  }, [appMode]);

  // Awarded answers management
  const awardPoints = useCallback(async (playerId: number, questionId: number, points: number, playerName: string, answer: string) => {
    console.log('🏆 Hook awardPoints called:', { playerId, questionId, points, playerName, answer, appMode });
    if (appMode === 'host') {
      try {
        // Update player score in database
        const player = players.find(p => p.id === playerId);
        if (player) {
          await apiService.updatePlayerScore(playerId, player.score + points);
          
          // Update awarded answers state
          setAwardedAnswers(prev => {
            console.log('🔄 Updating awardedAnswers, previous state:', prev);
            const existingAwards = prev[questionId] || [];
            const existingAward = existingAwards.find(award => award.playerId === playerId);
            
            let newState;
            if (existingAward) {
              // Update existing award with additional points
              newState = {
                ...prev,
                [questionId]: prev[questionId].map(award => 
                  award.playerId === playerId 
                    ? { ...award, points: award.points + points }
                    : award
                )
              };
            } else {
              // Add new awarded answer
              newState = {
                ...prev,
                [questionId]: [
                  ...(prev[questionId] || []),
                  { playerId, playerName, answer, points }
                ]
              };
            }
            console.log('✅ New awardedAnswers state:', newState);
            // Save to localStorage for persistence across modes
            localStorage.setItem('trivium-awarded-answers', JSON.stringify(newState));
            return newState;
          });
        }
      } catch (err) {
        console.error('Failed to award points:', err);
        setError(err instanceof Error ? err.message : 'Failed to award points');
        throw err;
      }
    }
  }, [appMode, players]);

  const getAwardedAnswers = useCallback((questionId?: number) => {
    console.log('📖 getAwardedAnswers called:', { questionId, awardedAnswers });
    if (!questionId) {
      return awardedAnswers;
    }
    return awardedAnswers[questionId] || [];
  }, [awardedAnswers]);

  // Game control functions (Host mode only)
  const startGame = useCallback(() => {
    if (appMode === 'host') {
      websocketService.sendGameAction('START_GAME');
    }
  }, [appMode]);

  const endGame = useCallback(() => {
    if (appMode === 'host') {
      websocketService.sendGameAction('END_GAME');
    }
  }, [appMode]);

  const nextSlide = useCallback(() => {
    if (appMode === 'host') {
      websocketService.sendGameAction('NEXT_SLIDE');
    }
  }, [appMode]);

  const prevSlide = useCallback(() => {
    if (appMode === 'host') {
      websocketService.sendGameAction('PREV_SLIDE');
    }
  }, [appMode]);

  const showQuestion = useCallback(() => {
    if (appMode === 'host') {
      websocketService.sendGameAction('SHOW_QUESTION');
    }
  }, [appMode]);

  const toggleAnswer = useCallback(() => {
    if (appMode === 'host') {
      websocketService.sendGameAction('TOGGLE_ANSWER');
    }
  }, [appMode]);

  const startTimer = useCallback(() => {
    if (appMode === 'host') {
      websocketService.sendGameAction('START_TIMER');
    }
  }, [appMode]);

  const stopTimer = useCallback(() => {
    if (appMode === 'host') {
      websocketService.sendGameAction('STOP_TIMER');
    }
  }, [appMode]);

  const resetTimer = useCallback(() => {
    if (appMode === 'host') {
      websocketService.sendGameAction('RESET_TIMER');
    }
  }, [appMode]);

  const toggleLeaderboard = useCallback(() => {
    if (appMode === 'host') {
      websocketService.sendGameAction('TOGGLE_LEADERBOARD');
    }
  }, [appMode]);

  // Settings management
  const updateSettings = useCallback(async (settings: Partial<GameSettings>) => {
    try {
      if (appMode === 'host') {
        await apiService.updateGameSettings(settings);
        // Game state will be updated via WebSocket
      }
    } catch (err) {
      console.error('Failed to update settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to update settings');
      throw err;
    }
  }, [appMode]);

  // Utility functions
  const getFilteredQuestions = useCallback(() => {
    if (!questions || !Array.isArray(questions)) {
      return [];
    }
    
    const selectedCategories = gameState?.selectedCategories || [];
    let filtered = selectedCategories.length === 0 
      ? questions 
      : questions.filter(q => selectedCategories.includes(q.category));
    
    if (gameState?.questionLimit && gameState.questionLimit > 0) {
      filtered = filtered.slice(0, gameState.questionLimit);
    }
    
    return filtered;
  }, [questions, gameState?.selectedCategories, gameState?.questionLimit]);

  const getAvailableCategories = useCallback(() => {
    if (!questions || !Array.isArray(questions)) {
      return [];
    }
    return [...new Set(questions.map(q => q.category))];
  }, [questions]);

  const getCurrentQuestionAnswers = useCallback((questionId?: number) => {
    if (!questionId) {
      const currentQuestion = getFilteredQuestions()[gameState.currentSlide];
      questionId = currentQuestion?.id;
    }
    return questionId ? (questionAnswers[questionId] || []) : [];
  }, [questionAnswers, gameState.currentSlide, getFilteredQuestions]);

  // Auto-load answers for current question when in host mode and question is started
  useEffect(() => {
    if (appMode === 'host' && gameState.gameStarted && gameState.firstQuestionStarted) {
      const currentQuestion = getFilteredQuestions()[gameState.currentSlide];
      if (currentQuestion?.id && !questionAnswers[currentQuestion.id]) {
        console.log('🔄 Auto-loading answers for question:', currentQuestion.id);
        refreshQuestionAnswers(currentQuestion.id);
      }
    }
  }, [appMode, gameState.gameStarted, gameState.firstQuestionStarted, gameState.currentSlide, getFilteredQuestions, questionAnswers, refreshQuestionAnswers]);

  // Periodic refresh for host mode to keep data in sync
  useEffect(() => {
    if (appMode === 'host' && isConnected) {
      const refreshInterval = setInterval(() => {
        console.log('🔄 Periodic refresh for host mode');
        refreshPlayers();
        
        // Also refresh current question answers if in game
        if (gameState.gameStarted && gameState.firstQuestionStarted) {
          const currentQuestion = getFilteredQuestions()[gameState.currentSlide];
          if (currentQuestion?.id) {
            refreshQuestionAnswers(currentQuestion.id);
          }
        }
      }, 30000); // Refresh every 30 seconds

      return () => clearInterval(refreshInterval);
    }
  }, [appMode, isConnected, gameState.gameStarted, gameState.firstQuestionStarted, gameState.currentSlide, getFilteredQuestions, refreshPlayers, refreshQuestionAnswers]);

  // Clear error after some time
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  return {
    // State
    questions,
    players,
    gameState,
    isConnected,
    isLoading,
    error,

    // Question management
    addQuestion,
    updateQuestion,
    deleteQuestion,
    exportQuestions,
    importQuestions,
    refreshQuestions,

    // Game control
    startGame,
    endGame,
    nextSlide,
    prevSlide,
    showQuestion,
    toggleAnswer,
    startTimer,
    stopTimer,
    resetTimer,
    toggleLeaderboard,

    // Settings
    updateSettings,

    // Player management
    refreshPlayers,
    clearAllPlayers,
    resetPlayerScore,
    resetAllPlayerScores,

    // Answer management
    submitAnswer,
    getPlayerAnswer,
    getQuestionAnswers,
    clearQuestionAnswers,

    // Utility
    getFilteredQuestions,
    getAvailableCategories,
    getCurrentQuestionAnswers,

    // Awarded answers
    awardPoints,
    getAwardedAnswers,
  };
};

export default useNetworkedGame;