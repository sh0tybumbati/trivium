import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Play, Trophy, Plus, Edit, Trash2, Download, Upload, Monitor, UserCog, Tv } from 'lucide-react';
import useNetworkedGame from './hooks/useNetworkedGame';
import ConnectionStatus from './components/ConnectionStatus';
import QRCodeDisplay from './components/QRCodeDisplay';
import websocketService from './services/websocket';
import apiService from './services/api';
import type { Question, Player } from './services/api';

type AppMode = 'main' | 'landing' | 'bigscreen' | 'host' | 'guest';

const TriviaApp = () => {
  // Check URL parameters to determine initial mode
  const getInitialMode = (): AppMode => {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    if (mode === 'guest') return 'guest';
    return 'main';
  };

  const [appMode, setAppMode] = useState<AppMode>(getInitialMode());
  const [adminMode, setAdminMode] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<(Question & { id?: number }) | null>(null);
  const [networkInfo, setNetworkInfo] = useState<any>(null);
  const [newQuestion, setNewQuestion] = useState<Omit<Question, 'id'>>({
    category: '',
    question: '',
    type: 'multiple_choice',
    options: ['', '', '', ''],
    answer: '',
    explanation: '',
    image_url: ''
  });

  // Player/Guest state
  const [playerName, setPlayerName] = useState('');
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [registrationError, setRegistrationError] = useState('');
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerLocked, setAnswerLocked] = useState(false);
  const [answerPending, setAnswerPending] = useState(false);
  // Included questions playlist state
  const [includedQuestions, setIncludedQuestions] = useState<Set<number>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const {
    questions,
    players,
    gameState,
    isConnected,
    isLoading,
    error,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    exportQuestions,
    importQuestions,
    refreshQuestions,
    startGame,
    endGame,
    nextSlide,
    prevSlide,
    showQuestion,
    toggleAnswer,
    startTimer,
    toggleLeaderboard,
    updateSettings,
    refreshPlayers,
    clearAllPlayers,
    resetPlayerScore,
    resetAllPlayerScores,
    submitAnswer,
    getPlayerAnswer,
    getQuestionAnswers,
    clearQuestionAnswers,
    getFilteredQuestions,
    getAvailableCategories,
    getCurrentQuestionAnswers,
    awardPoints,
    getAwardedAnswers
  } = useNetworkedGame(appMode);

  // Get awarded answers from hook
  const awardedAnswers = getAwardedAnswers();

  // Ensure we have safe defaults
  const safeQuestions = questions || [];
  const safeCategories = getAvailableCategories ? getAvailableCategories() : [];
  
  // Get current question answers from hook's real-time state
  const questionAnswers = getCurrentQuestionAnswers ? getCurrentQuestionAnswers() : [];
  
  // Debug answer updates
  console.log('📝 Current questionAnswers:', questionAnswers.length, 'answers for slide', gameState.currentSlide);
  console.log('🏆 Awarded answers state:', awardedAnswers);
  console.log('👥 Players loaded:', players.length, 'players');
  if (questionAnswers.length > 0) {
    console.log('📋 Sample answer structure:', questionAnswers[0]);
  }

  

  // Fetch network information on mount
  useEffect(() => {
    const fetchNetworkInfo = async () => {
      try {
        const info = await apiService.getNetworkInfo();
        setNetworkInfo(info);
        console.log('Network info fetched:', info);
      } catch (error) {
        console.error('Failed to fetch network info:', error);
      }
    };

    fetchNetworkInfo();
  }, []);

  // Answer selection handler (doesn't submit yet)
  const handleAnswerSelection = (answer: string) => {
    if (!currentPlayer || !gameState.gameStarted || answerLocked) return;
    setSelectedAnswer(answer);
    setAnswerPending(true);
  };

  // Answer confirmation handler
  const handleAnswerConfirmation = async () => {
    if (!currentPlayer || !selectedAnswer || answerLocked) return;
    
    const currentQuestion = filteredQuestions[gameState.currentSlide];
    if (!currentQuestion?.id) return;

    try {
      await submitAnswer(currentPlayer.id, currentQuestion.id, selectedAnswer);
      setAnswerLocked(true);
      setAnswerPending(false);
    } catch (error) {
      console.error('Failed to submit answer:', error);
    }
  };

  // Reset answer selection when question changes
  useEffect(() => {
    if (appMode === 'guest' && currentPlayer && gameState.gameStarted && gameState.firstQuestionStarted) {
      setSelectedAnswer(null);
      setAnswerLocked(false);
      setAnswerPending(false);
      
      // Check if player has already answered this question
      const currentQuestion = filteredQuestions[gameState.currentSlide];
      if (currentQuestion?.id) {
        getPlayerAnswer(currentPlayer.id, currentQuestion.id)
          .then(answer => {
            if (answer) {
              setSelectedAnswer(answer.selected_answer);
              setAnswerLocked(true);
              setAnswerPending(false);
            }
          })
          .catch(console.error);
      }
    }
  }, [gameState.currentSlide, gameState.gameStarted, gameState.firstQuestionStarted, currentPlayer, appMode]);

  // Note: Question answers are now handled automatically by the hook's real-time state

  // Clear answer selection when question is hidden
  useEffect(() => {
    if (appMode === 'guest' && !gameState.firstQuestionStarted) {
      setSelectedAnswer(null);
      setAnswerLocked(false);
      setAnswerPending(false);
    }
  }, [gameState.firstQuestionStarted, appMode]);

  // Auto-confirm answer when timer runs out
  useEffect(() => {
    if (appMode === 'guest' && currentPlayer && answerPending && !answerLocked) {
      if (gameState.timedRounds && gameState.timer === 0 && !gameState.isTimerRunning) {
        handleAnswerConfirmation();
      }
    }
  }, [gameState.timer, gameState.isTimerRunning, gameState.timedRounds, answerPending, answerLocked, appMode, currentPlayer]);

  // Clear answers when game starts or ends
  useEffect(() => {
    // Clear local answer state when game is not started
    if (!gameState.gameStarted) {
      setSelectedAnswer(null);
      setAnswerLocked(false);
      setAnswerPending(false);
      console.log('Game ended - cleared local answer state');
    }
  }, [gameState.gameStarted]);

  // Listen for player score updates (for guest mode)
  useEffect(() => {
    if (appMode === 'guest' && currentPlayer) {
      const unsubscribe = websocketService.onMessage((message) => {
        if (message.type === 'player_score_updated' && message.playerId === currentPlayer.id) {
          console.log('🎯 Player score updated via WebSocket:', message.score);
          setCurrentPlayer(prev => prev ? { ...prev, score: message.score } : null);
        }
      });

      return unsubscribe;
    }
  }, [appMode, currentPlayer]);


  // Player registration handler
  const handlePlayerRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistrationError('');
    
    if (!playerName.trim()) {
      setRegistrationError('Please enter your name');
      return;
    }

    try {
      const player = await apiService.joinGame(playerName.trim());
      setCurrentPlayer(player);
      console.log('Player registered:', player);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to register';
      setRegistrationError(errorMessage);
      console.error('Registration error:', error);
    }
  };

  // Clear players handler with confirmation
  const handleClearPlayers = async () => {
    if (window.confirm('Are you sure you want to clear all players? This will remove all players and their scores from the game.')) {
      try {
        await clearAllPlayers();
        console.log('All players cleared');
      } catch (error) {
        console.error('Failed to clear players:', error);
        alert('Failed to clear players. Please try again.');
      }
    }
  };

  // Reset individual player score
  const handleResetPlayerScore = async (playerId: number, playerName: string) => {
    if (window.confirm(`Are you sure you want to reset ${playerName}'s score to 0?`)) {
      try {
        await resetPlayerScore(playerId);
        console.log(`Reset score for player ${playerId}`);
      } catch (error) {
        console.error('Failed to reset player score:', error);
        alert('Failed to reset player score. Please try again.');
      }
    }
  };

  // Reset all player scores
  const handleResetAllScores = async () => {
    if (window.confirm('Are you sure you want to reset ALL player scores to 0? This cannot be undone.')) {
      try {
        await resetAllPlayerScores();
        console.log('All player scores reset');
      } catch (error) {
        console.error('Failed to reset all scores:', error);
        alert('Failed to reset scores. Please try again.');
      }
    }
  };

  // Helper functions for included questions playlist
  const addToPlaylist = (questionId: number) => {
    setIncludedQuestions(prev => new Set([...prev, questionId]));
  };

  const removeFromPlaylist = (questionId: number) => {
    setIncludedQuestions(prev => {
      const newSet = new Set(prev);
      newSet.delete(questionId);
      return newSet;
    });
  };

  const getPlaylistQuestions = () => {
    return questions.filter(q => q.id && includedQuestions.has(q.id));
  };

  const getFilteredLibraryQuestions = () => {
    let filtered = questions;
    if (categoryFilter !== 'all') {
      filtered = questions.filter(q => q.category === categoryFilter);
    }
    return filtered;
  };

  // Use playlist if available, otherwise fall back to original filtered questions
  const filteredQuestions = includedQuestions.size > 0 
    ? getPlaylistQuestions() 
    : (getFilteredQuestions ? getFilteredQuestions() : []);

  // Debug when awardedAnswers changes
  useEffect(() => {
    const currentQuestion = filteredQuestions[gameState.currentSlide];
    console.log('🏆 AwardedAnswers state changed:', awardedAnswers);
    console.log('🏆 Current question ID:', currentQuestion?.id, 'has awarded answers:', !!awardedAnswers[currentQuestion?.id]);
  }, [awardedAnswers, gameState.currentSlide, filteredQuestions]);

  // Render landing page (Big Screen/Host selection)
  const renderLandingPage = () => {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-amber-900 flex items-center justify-center p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-100/5 via-transparent to-emerald-900/10"></div>
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400"></div>
        
        {/* Connection Status */}
        <div className="absolute top-4 right-4">
          <ConnectionStatus isConnected={isConnected} error={error} />
        </div>

        <div className="text-center text-white max-w-6xl relative z-10">
          <div className="mb-12">
            <Trophy className="w-32 h-32 mx-auto mb-8 text-amber-300 drop-shadow-lg" />
            <h1 className="text-7xl font-bold mb-6 bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-400 bg-clip-text text-transparent drop-shadow-2xl">
              {gameState?.gameTitle || 'TRIVIA NIGHT'}
            </h1>
            <p className="text-3xl text-amber-100 mb-12 font-light tracking-wide">Choose Mode</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Big Screen Mode */}
            <div className="bg-black/40 backdrop-blur-lg rounded-3xl p-8 border-2 border-amber-400/30 shadow-2xl relative hover:border-amber-400/50 transition-all duration-300 transform hover:scale-105">
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-amber-400 rotate-45"></div>
              <Tv className="w-16 h-16 mx-auto mb-6 text-emerald-300" />
              <h2 className="text-3xl font-bold mb-4 text-amber-100">Big Screen Mode</h2>
              <p className="text-lg text-amber-200 mb-8">
                Perfect for projectors and TVs. Clean display for your audience with questions, options, and answers.
              </p>
              <button
                onClick={() => setAppMode('bigscreen')}
                className="bg-gradient-to-r from-emerald-600 to-emerald-800 hover:from-emerald-500 hover:to-emerald-700 text-white text-xl font-bold py-4 px-8 rounded-full transition-all duration-300 shadow-lg border-2 border-emerald-400/50 w-full"
              >
                <Monitor className="w-6 h-6 mr-3 inline" />
                Launch Big Screen
              </button>
            </div>

            {/* Host Mode */}
            <div className="bg-black/40 backdrop-blur-lg rounded-3xl p-8 border-2 border-amber-400/30 shadow-2xl relative hover:border-amber-400/50 transition-all duration-300 transform hover:scale-105">
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-amber-400 rotate-45"></div>
              <UserCog className="w-16 h-16 mx-auto mb-6 text-amber-300" />
              <h2 className="text-3xl font-bold mb-4 text-amber-100">Host Mode</h2>
              <p className="text-lg text-amber-200 mb-8">
                Full control interface with question management, category selection, timer controls, and game progression.
              </p>
              <button
                onClick={() => setAppMode('host')}
                className="bg-gradient-to-r from-amber-600 to-amber-800 hover:from-amber-500 hover:to-amber-700 text-black text-xl font-bold py-4 px-8 rounded-full transition-all duration-300 shadow-lg border-2 border-amber-400 w-full"
              >
                <UserCog className="w-6 h-6 mr-3 inline" />
                Launch Host Panel
              </button>
            </div>
          </div>

          {(gameState?.showQuestionCounter && safeQuestions.length > 0 && safeCategories.length > 0) ? (
            <div className="mt-12 text-amber-300 text-lg">
              {safeQuestions.length} questions available across {safeCategories.length} categories
            </div>
          ) : null}

        </div>
      </div>
    );
  };

  // Generate URL for guest mode with network IP
  const getGuestUrl = () => {
    const currentHost = window.location.hostname;
    const currentPort = window.location.port;
    const protocol = window.location.protocol;
    
    // If we have network info from the server, use that
    if (networkInfo && networkInfo.networkIP && networkInfo.networkIP !== 'localhost') {
      const port = currentPort || '5173';
      return `${protocol}//${networkInfo.networkIP}:${port}?mode=guest`;
    }
    
    // If we're already on a network IP (not localhost), use current URL
    if (currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
      return `${window.location.origin}?mode=guest`;
    }
    
    // Fallback to current URL if network info isn't available yet
    return `${window.location.origin}?mode=guest`;
  };
  
  // Debug logging
  console.log('TriviaApp render:', { 
    appMode, 
    isConnected, 
    isLoading, 
    error, 
    gameState: gameState ? Object.keys(gameState) : 'undefined',
    questionsLength: safeQuestions.length,
    categoriesLength: safeCategories.length
  });

  // Early return if critical data is missing
  if (!gameState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-amber-900 flex items-center justify-center text-amber-200 text-2xl">
        <div className="text-center">
          <div className="animate-spin w-16 h-16 border-4 border-amber-300 border-t-transparent rounded-full mx-auto mb-4"></div>
          <div>Initializing game state...</div>
        </div>
      </div>
    );
  }

  // Points awarding function for write-in questions
  const handleAwardPoints = async (playerId: number, points: number) => {
    console.log('🎯 handleAwardPoints called:', { playerId, points });
    
    try {
      // Get current player data and question
      const player = players.find(p => p.id === playerId);
      const currentQuestion = filteredQuestions[gameState.currentSlide];
      console.log('📊 Found player:', player?.name, 'Question:', currentQuestion?.id);
      
      if (player && currentQuestion?.id) {
        // Find the player's answer
        const playerAnswer = questionAnswers.find(qa => qa.id === playerId || qa.player_id === playerId);
        console.log('💬 Found player answer:', playerAnswer);
        
        if (playerAnswer) {
          // Use the hook's awardPoints function
          await awardPoints(playerId, currentQuestion.id, points, player.name, playerAnswer.selected_answer);
          console.log(`✅ Awarded ${points} points to ${player.name} for: "${playerAnswer.selected_answer}"`);
        } else {
          console.error('❌ Could not find player answer for player ID:', playerId);
        }
      } else {
        if (!player) console.error('❌ Player not found with ID:', playerId);
        if (!currentQuestion?.id) console.error('❌ No current question ID');
      }
    } catch (error) {
      console.error('Failed to award points:', error);
    }
  };

  // Question management functions
  const handleAddQuestion = async () => {
    console.log('Add Question clicked, validation check:', {
      question: !!newQuestion.question,
      category: !!newQuestion.category,
      type: newQuestion.type,
      answer: !!newQuestion.answer,
      options: newQuestion.options,
      optionsValid: newQuestion.options.every(opt => opt)
    });
    
    if (newQuestion.question && newQuestion.category && 
        (newQuestion.type === 'write_in' || 
         (newQuestion.type === 'multiple_choice' && newQuestion.answer && newQuestion.options.every(opt => opt)))) {
      try {
        console.log('Saving question with data:', newQuestion);
        await addQuestion(newQuestion);
        console.log('Question saved, refreshing list...');
        // Manually refresh questions list to show the new question
        await refreshQuestions();
        console.log('Questions refreshed');
        // Force a small delay to ensure state update
        setTimeout(() => {
          console.log('Updated questions:', questions);
        }, 500);
        setNewQuestion({
          category: '',
          question: '',
          type: 'multiple_choice',
          options: ['', '', '', ''],
          answer: '',
          explanation: '',
          image_url: ''
        });
      } catch (error) {
        console.error('Failed to add question:', error);
      }
    }
  };

  const handleUpdateQuestion = async (question: Question & { id?: number }) => {
    if (question.id) {
      try {
        await updateQuestion(question.id, {
          category: question.category,
          question: question.question,
          type: question.type,
          options: question.options,
          answer: question.answer,
          explanation: question.explanation,
          image_url: question.image_url
        });
        // Manually refresh questions list to show the updated question
        await refreshQuestions();
        setEditingQuestion(null);
      } catch (error) {
        console.error('Failed to update question:', error);
      }
    }
  };

  const handleDeleteQuestion = async (id: number) => {
    try {
      await deleteQuestion(id);
    } catch (error) {
      console.error('Failed to delete question:', error);
    }
  };

  const handleExportQuestions = async () => {
    try {
      await exportQuestions();
    } catch (error) {
      console.error('Failed to export questions:', error);
    }
  };

  const handleImportQuestions = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const imported = JSON.parse(e.target?.result as string);
          if (Array.isArray(imported)) {
            await importQuestions(imported);
          }
        } catch (error) {
          alert('Invalid JSON file');
        }
      };
      reader.readAsText(file);
    }
  };

  // Settings update functions
  const updateGameSettings = async (updates: any) => {
    try {
      // Merge with current state to preserve existing settings
      const currentSettings = {
        game_title: gameState.gameTitle,
        game_subtitle: gameState.gameSubtitle,
        show_question_counter: gameState.showQuestionCounter,
        show_wait_screen: gameState.showWaitScreen,
        timed_rounds: gameState.timedRounds,
        time_limit: gameState.timeLimit,
        question_limit: gameState.questionLimit,
        selected_categories: gameState.selectedCategories,
        player_mode: gameState.playerMode
      };
      
      const mergedSettings = { ...currentSettings, ...updates };
      
      console.log('📤 Sending merged settings update:', mergedSettings);
      console.log('📊 Current gameState before update:', {
        timedRounds: gameState.timedRounds,
        showWaitScreen: gameState.showWaitScreen
      });
      
      await updateSettings(mergedSettings);
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-amber-900 flex items-center justify-center text-amber-200 text-2xl">
        <div className="text-center">
          <div className="animate-spin w-16 h-16 border-4 border-amber-300 border-t-transparent rounded-full mx-auto mb-4"></div>
          <div>Connecting to server...</div>
        </div>
      </div>
    );
  }

  // Main Entry Screen - Host or Guest Selection (only if Player Mode is enabled)
  if (appMode === 'main') {
    // If Player Mode is disabled, automatically go to Big Screen/Host selection
    if (!gameState?.playerMode) {
      return renderLandingPage();
    }
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-amber-900 flex items-center justify-center p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-100/5 via-transparent to-emerald-900/10"></div>
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400"></div>
        
        {/* Connection Status */}
        <div className="absolute top-4 right-4">
          <ConnectionStatus isConnected={isConnected} error={error} />
        </div>

        <div className="text-center text-white max-w-4xl relative z-10">
          <div className="mb-16">
            <Trophy className="w-40 h-40 mx-auto mb-8 text-amber-300 drop-shadow-2xl" />
            <h1 className="text-8xl font-bold mb-6 bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-400 bg-clip-text text-transparent drop-shadow-2xl">
              TRIVIA NIGHT
            </h1>
            <p className="text-4xl text-amber-100 mb-16 font-light tracking-wide">Choose Your Role</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-4xl mx-auto">
            {/* Host Option */}
            <div className="bg-black/40 backdrop-blur-lg rounded-3xl p-12 border-2 border-amber-400/30 shadow-2xl relative hover:border-amber-400/50 transition-all duration-300 transform hover:scale-105">
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-amber-400 rotate-45"></div>
              <UserCog className="w-20 h-20 mx-auto mb-6 text-amber-300" />
              <h2 className="text-4xl font-bold mb-6 text-amber-100">Host</h2>
              <p className="text-xl text-amber-200 mb-8">
                Control the game, manage questions, and run the trivia session for your audience.
              </p>
              <button
                onClick={() => setAppMode('landing')}
                className="bg-gradient-to-r from-amber-600 to-amber-800 hover:from-amber-500 hover:to-amber-700 text-black text-2xl font-bold py-6 px-12 rounded-full transition-all duration-300 shadow-lg border-2 border-amber-400 w-full"
              >
                Host Game
              </button>
            </div>

            {/* Guest Option */}
            <div className="bg-black/40 backdrop-blur-lg rounded-3xl p-12 border-2 border-emerald-400/30 shadow-2xl relative hover:border-emerald-400/50 transition-all duration-300 transform hover:scale-105">
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-emerald-400 rotate-45"></div>
              <Play className="w-20 h-20 mx-auto mb-6 text-emerald-300" />
              <h2 className="text-4xl font-bold mb-6 text-emerald-100">Guest</h2>
              <p className="text-xl text-emerald-200 mb-8">
                Join a trivia game as a player and submit your answers from your device.
              </p>
              <button
                onClick={() => setAppMode('guest')}
                className="bg-gradient-to-r from-emerald-600 to-emerald-800 hover:from-emerald-500 hover:to-emerald-700 text-white text-2xl font-bold py-6 px-12 rounded-full transition-all duration-300 shadow-lg border-2 border-emerald-400/50 w-full"
              >
                Join Game
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Landing Screen
  if (appMode === 'landing') {
    return renderLandingPage();
  }

  // Big Screen Mode - Clean display for projection
  if (appMode === 'bigscreen') {
    if (!gameState.gameStarted) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-amber-900 flex items-center justify-center p-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-100/5 via-transparent to-emerald-900/10"></div>
          <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400"></div>
          
          {/* Connection Status */}
          <div className="absolute top-4 right-4">
            <ConnectionStatus isConnected={isConnected} error={error} />
          </div>

          <div className="text-center text-white max-w-6xl relative z-10">
            <Trophy className="w-40 h-40 mx-auto mb-12 text-amber-300 drop-shadow-lg" />
            <h1 className="text-8xl font-bold mb-8 bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-400 bg-clip-text text-transparent drop-shadow-2xl">
              {gameState.gameTitle}
            </h1>
            <p className="text-4xl text-amber-100 mb-16 font-light tracking-wide">{gameState.gameSubtitle}</p>
            <div className="bg-black/40 backdrop-blur-lg rounded-3xl p-12 border-2 border-amber-400/30 shadow-2xl relative">
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-amber-400 rotate-45"></div>
              <p className="text-2xl text-amber-200 mb-4">Waiting for host to start the game...</p>
              
              {/* Player Mode QR Code */}
              {!!gameState.playerMode && (
                <div className="mt-8 p-6 bg-emerald-600/20 border-2 border-emerald-400/50 rounded-2xl">
                  <h3 className="text-2xl font-bold text-emerald-300 mb-4">Join with Your Phone</h3>
                  <div className="flex flex-col items-center">
                    <p className="text-lg text-emerald-200 mb-4">Scan QR code to join the game:</p>
                    <QRCodeDisplay 
                      url={getGuestUrl()} 
                      size={180}
                      className="mb-4"
                    />
                    <p className="text-sm text-emerald-300 font-medium">
                      Players can submit answers from their devices
                    </p>
                  </div>
                </div>
              )}
              
              {gameState.showQuestionCounter && filteredQuestions.length > 0 ? (
                <div className="text-xl text-amber-300 mt-4">
                  {filteredQuestions.length} questions ready • {safeCategories.length} categories
                </div>
              ) : null}
            </div>
          </div>
        </div>
      );
    }

    // Game started but first question hasn't started yet - always show ready screen for first question
    if (gameState.gameStarted && !gameState.firstQuestionStarted) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-amber-900 flex items-center justify-center p-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-100/5 via-transparent to-emerald-900/10"></div>
          <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400"></div>
          
          {/* Connection Status */}
          <div className="absolute top-4 right-4">
            <ConnectionStatus isConnected={isConnected} error={error} />
          </div>

          <div className="text-center text-white max-w-6xl relative z-10">
            <Trophy className="w-64 h-64 mx-auto text-amber-300 drop-shadow-2xl animate-pulse" />
          </div>
        </div>
      );
    }

    const currentQuestion = filteredQuestions[gameState?.currentSlide || 0];
    
    if (!currentQuestion) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-amber-900 flex items-center justify-center text-white">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-amber-300 mb-4">No Questions Available</h1>
            <p className="text-xl text-amber-200">Waiting for host to load questions...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-amber-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-100/5 via-transparent to-emerald-900/10"></div>
        <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400"></div>
        
        {/* Connection Status */}
        <div className="absolute top-4 right-4">
          <ConnectionStatus isConnected={isConnected} error={error} />
        </div>

        <div className="relative z-10 p-8">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center space-x-6 mb-8">
              <Trophy className="w-12 h-12 text-amber-300" />
              <h1 className="text-4xl font-bold text-amber-100">{gameState.gameTitle}</h1>
              {gameState.showQuestionCounter && gameState.gameStarted && filteredQuestions.length > 0 ? (
                <div className="text-2xl text-amber-300">
                  {gameState.currentSlide + 1} / {filteredQuestions.length}
                </div>
              ) : null}
            </div>
            
            {/* Compact Player Mode QR Code */}
            {!!gameState.playerMode && (
              <div className="inline-block bg-emerald-600/20 border border-emerald-400/50 rounded-xl p-4 mb-4">
                <div className="flex items-center space-x-4">
                  <div className="text-center">
                    <p className="text-sm text-emerald-300 mb-2 font-medium">Join with Phone</p>
                    <QRCodeDisplay 
                      url={getGuestUrl()} 
                      size={80}
                    />
                  </div>
                  <div className="text-left">
                    <p className="text-emerald-200 text-sm">
                      Players can scan to join<br />
                      and submit answers
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Leaderboard Display */}
          {gameState.showLeaderboard && !!gameState.playerMode && (
            <div className="max-w-5xl mx-auto mb-8">
              <div className="bg-black/60 backdrop-blur-lg rounded-3xl p-8 border-2 border-emerald-400/50 shadow-2xl relative">
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-emerald-400 rotate-45"></div>
                
                <div className="text-center mb-8">
                  <h2 className="text-4xl font-bold text-emerald-100 flex items-center justify-center space-x-3">
                    <Trophy className="w-10 h-10 text-amber-300" />
                    <span>Leaderboard</span>
                    <Trophy className="w-10 h-10 text-amber-300" />
                  </h2>
                </div>

                <div className="space-y-4">
                  {players.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-2xl text-emerald-200">No players have joined yet</p>
                      <p className="text-emerald-300 mt-2">Players will appear here when they register</p>
                    </div>
                  ) : (
                    players
                      .sort((a, b) => b.score - a.score)
                      .slice(0, 10) // Show top 10 players
                      .map((player, index) => (
                      <div key={player.id} className={`flex items-center justify-between p-4 rounded-xl border-2 ${
                        index === 0 ? 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border-amber-400/50' :
                        index === 1 ? 'bg-gradient-to-r from-gray-400/20 to-gray-500/20 border-gray-400/50' :
                        index === 2 ? 'bg-gradient-to-r from-orange-500/20 to-orange-600/20 border-orange-400/50' :
                        'bg-emerald-500/10 border-emerald-400/30'
                      }`}>
                        <div className="flex items-center space-x-4">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-lg ${
                            index === 0 ? 'bg-amber-400 text-black' :
                            index === 1 ? 'bg-gray-400 text-black' :
                            index === 2 ? 'bg-orange-400 text-black' :
                            'bg-emerald-400 text-black'
                          }`}>
                            {index + 1}
                          </div>
                          <h3 className="text-2xl font-bold text-emerald-100">{player.name}</h3>
                          {!player.connected && (
                            <span className="text-red-400 text-sm">(Offline)</span>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-3xl font-bold text-amber-400">{player.score}</p>
                          <p className="text-emerald-300 text-sm">points</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Main Question Area */}
          {!(gameState.showLeaderboard && !!gameState.playerMode) && (
            <div className="max-w-7xl mx-auto">
            <div className="bg-black/40 backdrop-blur-lg rounded-3xl p-16 border-2 border-amber-400/30 shadow-2xl relative">
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-amber-400 rotate-45"></div>
              
              {/* Category */}
              <div className="text-center mb-12">
                <span className="bg-gradient-to-r from-amber-400 to-yellow-400 text-black px-8 py-3 rounded-full text-2xl font-bold border-2 border-amber-300 shadow-lg">
                  {currentQuestion.category}
                </span>
              </div>

              {/* Question */}
              <div className="text-center mb-16">
                {/* Question Image */}
                {currentQuestion.image_url && (
                  <div className="mb-8">
                    <img 
                      src={currentQuestion.image_url} 
                      alt="Question illustration"
                      className="max-w-full max-h-80 mx-auto rounded-2xl shadow-2xl border-2 border-amber-400/30"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                )}
                <h2 className="text-5xl font-bold mb-8 leading-tight text-amber-100">
                  {currentQuestion.question}
                </h2>
              </div>

              {/* Options */}
              {(currentQuestion.type || 'multiple_choice') === 'multiple_choice' ? (
                <div className="grid grid-cols-2 gap-8 mb-12">
                  {currentQuestion.options.map((option, index) => (
                    <div
                      key={index}
                      className={`p-8 rounded-2xl border-2 text-center text-2xl font-semibold transition-all duration-500 relative ${
                        gameState.showAnswer && option === currentQuestion.answer
                          ? 'bg-emerald-600/40 border-emerald-400 text-emerald-100 shadow-lg scale-105'
                          : gameState.showAnswer && option !== currentQuestion.answer
                          ? 'bg-red-600/20 border-red-400/50 text-red-200'
                          : 'bg-black/30 border-amber-400/30 text-amber-100'
                      }`}
                    >
                      <div className="flex items-center justify-center space-x-4">
                        <span className="w-12 h-12 bg-amber-600 rounded-full flex items-center justify-center text-xl font-bold text-black border border-amber-400">
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span>{option}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Write-in Question Display */
                <div className="mb-12">
                  <div className="bg-black/30 border-2 border-amber-400/30 rounded-2xl p-12 text-center">
                    <div className="text-3xl font-bold text-amber-100 mb-4">
                      ✍️ Write-in Question
                    </div>
                    <div className="text-xl text-amber-200">
                      Players will type their answers on their devices
                    </div>
                    {!!gameState.playerMode && (
                      <div className="mt-8 text-lg text-emerald-300">
                        Host will review submissions and award points
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Answer Explanation */}
              {gameState.showAnswer && currentQuestion.answer && (
                <div className="bg-emerald-600/20 border-2 border-emerald-400/50 rounded-2xl p-8 text-center relative">
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-emerald-400 rotate-45"></div>
                  <h3 className="text-3xl font-bold text-emerald-300 mb-4">
                    Correct Answer: {currentQuestion.answer}
                  </h3>
                  {currentQuestion.explanation && (
                    <p className="text-xl text-emerald-100">{currentQuestion.explanation}</p>
                  )}
                </div>
              )}

              {/* Awarded Answers for Write-in Questions */}
              {(() => {
                const shouldShow = gameState.showAnswer && (currentQuestion.type || 'multiple_choice') === 'write_in' && awardedAnswers[currentQuestion.id] && awardedAnswers[currentQuestion.id].length > 0;
                console.log('🎭 Big Screen awarded answers display check:', {
                  showAnswer: gameState.showAnswer,
                  questionType: currentQuestion.type || 'multiple_choice',
                  isWriteIn: (currentQuestion.type || 'multiple_choice') === 'write_in',
                  currentQuestionId: currentQuestion.id,
                  hasAwardedAnswers: !!awardedAnswers[currentQuestion.id],
                  awardedCount: awardedAnswers[currentQuestion.id]?.length || 0,
                  awardedAnswersKeys: Object.keys(awardedAnswers),
                  awardedAnswersData: awardedAnswers[currentQuestion.id],
                  shouldShow
                });
                return shouldShow;
              })() && (
                <div className="bg-amber-600/20 border-2 border-amber-400/50 rounded-2xl p-8 relative mt-6">
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-amber-400 rotate-45"></div>
                  <h3 className="text-2xl font-bold text-amber-300 mb-6 text-center">Awarded Answers</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {awardedAnswers[currentQuestion.id].map((award, index) => (
                      <div key={index} className="bg-black/30 rounded-xl p-4 border border-amber-400/30">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-bold text-amber-200 text-lg">{award.playerName}</span>
                          <span className="bg-amber-600 text-black px-3 py-1 rounded-full text-sm font-bold">
                            +{award.points} point{award.points !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="bg-amber-900/20 rounded-lg p-3">
                          <p className="text-white text-base">{award.answer}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timer Display */}
              {gameState.timedRounds && gameState.isTimerRunning && gameState.timer > 0 && (
                <div className="text-center mt-8">
                  <div className={`text-6xl font-bold ${gameState.timer <= 10 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {gameState.timer}
                  </div>
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      </div>
    );
  }

  // Guest Mode - Player interface
  if (appMode === 'guest') {
    // Show welcome screen if player is registered
    if (currentPlayer) {
      const currentQuestion = gameState?.gameStarted ? filteredQuestions[gameState.currentSlide] : null;
      
      return (
        <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-emerald-900 flex items-center justify-center p-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-100/5 via-transparent to-amber-900/10"></div>
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-400 via-amber-300 to-emerald-400"></div>
          
          {/* Connection Status */}
          <div className="absolute top-4 right-4">
            <ConnectionStatus isConnected={isConnected} error={error} />
          </div>

          <div className="text-center text-white max-w-4xl relative z-10">
            {/* Player Header */}
            <div className="mb-8">
              <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-emerald-300 via-amber-300 to-emerald-400 bg-clip-text text-transparent drop-shadow-2xl">
                {currentPlayer.name}
              </h1>
              <div className="flex justify-center items-center gap-8 text-xl">
                <div className="bg-black/40 backdrop-blur-lg rounded-2xl px-6 py-3 border border-emerald-400/30">
                  <span className="text-emerald-300">Score: </span>
                  <span className="text-amber-400 font-bold">{currentPlayer.score}</span>
                </div>
                <div className="bg-black/40 backdrop-blur-lg rounded-2xl px-6 py-3 border border-emerald-400/30">
                  <span className={`${gameState?.gameStarted ? 'text-green-400' : 'text-orange-400'}`}>
                    {gameState?.gameStarted ? 'Game Active' : 'Waiting for Game'}
                  </span>
                </div>
              </div>
            </div>

            {/* Game Content */}
            {gameState?.gameStarted && gameState?.firstQuestionStarted && currentQuestion ? (
              <div className="space-y-8">
                {/* Question Display */}
                <div className="bg-black/40 backdrop-blur-lg rounded-3xl p-8 border-2 border-emerald-400/30 shadow-2xl">
                  {gameState?.showQuestionCounter && filteredQuestions.length > 0 ? (
                    <div className="text-lg text-emerald-300 mb-4">
                      Question {gameState.currentSlide + 1} of {filteredQuestions.length}
                    </div>
                  ) : null}
                  <div className="text-sm text-amber-300 mb-4 font-medium uppercase tracking-wider">
                    {currentQuestion.category}
                  </div>
                  {/* Question Image */}
                  {currentQuestion.image_url && (
                    <div className="mb-6">
                      <img 
                        src={currentQuestion.image_url} 
                        alt="Question illustration"
                        className="max-w-full max-h-48 mx-auto rounded-xl shadow-lg border border-emerald-400/30"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  <h2 className="text-3xl font-bold text-white mb-8 leading-tight">
                    {currentQuestion.question}
                  </h2>
                  
                  {/* Answer Options */}
                  {(currentQuestion.type || 'multiple_choice') === 'multiple_choice' ? (
                    <div className="grid grid-cols-1 gap-4">
                      {currentQuestion.options.map((option, index) => {
                        const isSelected = selectedAnswer === option;
                        const isCorrect = gameState.showAnswer && option === currentQuestion.answer;
                        const isWrong = gameState.showAnswer && isSelected && option !== currentQuestion.answer;
                        
                        return (
                          <button
                            key={index}
                            onClick={() => handleAnswerSelection(option)}
                            disabled={answerLocked || gameState.showAnswer}
                            className={`
                              text-left p-6 rounded-2xl transition-all duration-300 text-xl font-medium border-2
                              ${isCorrect ? 'bg-green-600/30 border-green-400 text-green-100' :
                                isWrong ? 'bg-red-600/30 border-red-400 text-red-100' :
                                isSelected && answerLocked ? 'bg-emerald-600/30 border-emerald-400 text-emerald-100' :
                                isSelected ? 'bg-amber-600/30 border-amber-400 text-amber-100' :
                                'bg-gray-700/30 border-gray-500/50 text-gray-100 hover:bg-gray-600/30 hover:border-gray-400'
                              }
                              ${(answerLocked || gameState.showAnswer) ? 'cursor-not-allowed' : 'cursor-pointer'}
                            `}
                          >
                            <div className="flex items-center">
                              <span className="w-8 h-8 bg-emerald-400 text-black rounded-full flex items-center justify-center font-bold mr-4">
                                {String.fromCharCode(65 + index)}
                              </span>
                              {option}
                              {isSelected && !gameState.showAnswer && (
                                <span className="ml-auto text-amber-400">
                                  {answerLocked ? "✓ Confirmed" : "● Selected"}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    /* Write-in Question Interface */
                    <div className="space-y-4">
                      <div className="bg-black/20 border border-amber-400/30 rounded-2xl p-6">
                        <label className="block text-amber-200 text-lg font-medium mb-4">
                          Type your answer:
                        </label>
                        <textarea
                          value={selectedAnswer || ''}
                          onChange={(e) => setSelectedAnswer(e.target.value)}
                          disabled={answerLocked || gameState.showAnswer}
                          placeholder="Enter your answer here..."
                          className="w-full bg-black/30 border border-amber-400/30 rounded-lg px-4 py-3 text-white text-lg resize-none placeholder-gray-400 focus:border-amber-400 focus:outline-none"
                          rows={3}
                        />
                        {/* Submit button for write-in questions */}
                        {!answerLocked && !gameState.showAnswer && selectedAnswer && selectedAnswer.trim() && (
                          <div className="mt-4 text-center">
                            <button
                              onClick={() => {
                                handleAnswerSelection(selectedAnswer);
                                setAnswerPending(true);
                              }}
                              className="bg-gradient-to-r from-emerald-600 to-emerald-800 hover:from-emerald-500 hover:to-emerald-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 shadow-lg border border-emerald-400"
                            >
                              Submit Answer
                            </button>
                          </div>
                        )}
                        {gameState.showAnswer && currentQuestion.answer && (
                          <div className="mt-4 p-4 bg-emerald-900/30 border border-emerald-400/50 rounded-lg">
                            <div className="text-emerald-300 font-medium mb-2">Correct Answer:</div>
                            <div className="text-white text-lg">{currentQuestion.answer}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Confirm Answer Button */}
                  {answerPending && !answerLocked && !gameState.showAnswer && (
                    <div className="mt-6 text-center">
                      <button
                        onClick={handleAnswerConfirmation}
                        className="bg-gradient-to-r from-emerald-600 to-emerald-800 hover:from-emerald-500 hover:to-emerald-700 text-white text-xl font-bold py-4 px-8 rounded-full transition-all duration-300 shadow-lg border-2 border-emerald-400"
                      >
                        Confirm Answer
                      </button>
                      <p className="text-emerald-300 text-sm mt-3">
                        {gameState.timedRounds && gameState.isTimerRunning 
                          ? "Answer will auto-confirm when timer runs out"
                          : "Click to submit your answer"
                        }
                      </p>
                    </div>
                  )}

                  {/* Answer Status */}
                  {answerLocked && !gameState.showAnswer && (
                    <div className="mt-6 text-center text-amber-300 text-lg">
                      Answer submitted! Waiting for others...
                    </div>
                  )}

                  {/* Answer Explanation */}
                  {gameState.showAnswer && currentQuestion.answer && (
                    <div className="mt-8 bg-emerald-600/20 border-2 border-emerald-400/50 rounded-2xl p-6">
                      <h3 className="text-2xl font-bold text-emerald-300 mb-3">
                        Correct Answer: {currentQuestion.answer}
                      </h3>
                      {currentQuestion.explanation && (
                        <p className="text-lg text-emerald-100">{currentQuestion.explanation}</p>
                      )}
                    </div>
                  )}

                  {/* Awarded Answers for Write-in Questions */}
                  {(() => {
                    const shouldShow = gameState.showAnswer && (currentQuestion.type || 'multiple_choice') === 'write_in' && awardedAnswers[currentQuestion.id] && awardedAnswers[currentQuestion.id].length > 0;
                    console.log('👤 Player Screen awarded answers display check:', {
                      showAnswer: gameState.showAnswer,
                      questionType: currentQuestion.type || 'multiple_choice',
                      isWriteIn: (currentQuestion.type || 'multiple_choice') === 'write_in',
                      currentQuestionId: currentQuestion.id,
                      hasAwardedAnswers: !!awardedAnswers[currentQuestion.id],
                      awardedCount: awardedAnswers[currentQuestion.id]?.length || 0,
                      shouldShow
                    });
                    return shouldShow;
                  })() && (
                    <div className="mt-6 bg-amber-600/20 border-2 border-amber-400/50 rounded-2xl p-6">
                      <h3 className="text-xl font-bold text-amber-300 mb-4 text-center">Awarded Answers</h3>
                      <div className="space-y-3">
                        {awardedAnswers[currentQuestion.id].map((award, index) => (
                          <div key={index} className="bg-black/30 rounded-lg p-3 border border-amber-400/30">
                            <div className="flex justify-between items-center mb-2">
                              <span className="font-bold text-amber-200">{award.playerName}</span>
                              <span className="bg-amber-600 text-black px-2 py-1 rounded-full text-xs font-bold">
                                +{award.points}
                              </span>
                            </div>
                            <p className="text-white text-sm">{award.answer}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Timer Display */}
                {gameState.timedRounds && gameState.isTimerRunning && gameState.timer > 0 && (
                  <div className="text-center">
                    <div className={`text-6xl font-bold ${gameState.timer <= 10 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {gameState.timer}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Waiting Screen */
              <div className="bg-black/40 backdrop-blur-lg rounded-3xl p-12 border-2 border-emerald-400/30 shadow-2xl">
                <Play className="w-24 h-24 mx-auto mb-6 text-emerald-300 drop-shadow-lg" />
                <p className="text-2xl text-emerald-200 mb-8">
                  {gameState?.gameStarted 
                    ? "Waiting for the host to show the question..."
                    : "You're all set! Wait for the host to start the game. You'll be able to submit answers from this device."
                  }
                </p>
              </div>
            )}

            {/* Leave Game Button */}
            <div className="mt-8">
              <button
                onClick={() => {
                  setCurrentPlayer(null);
                  setPlayerName('');
                  setSelectedAnswer(null);
                  setAnswerLocked(false);
                  setAnswerPending(false);
                  setAppMode('main');
                }}
                className="bg-gradient-to-r from-amber-600 to-amber-800 hover:from-amber-500 hover:to-amber-700 text-black text-xl font-bold py-3 px-8 rounded-full transition-all duration-300 shadow-lg border-2 border-amber-400"
              >
                Leave Game
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Show registration form if not registered
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-emerald-900 flex items-center justify-center p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-100/5 via-transparent to-amber-900/10"></div>
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-400 via-amber-300 to-emerald-400"></div>
        
        {/* Connection Status */}
        <div className="absolute top-4 right-4">
          <ConnectionStatus isConnected={isConnected} error={error} />
        </div>

        <div className="text-center text-white max-w-2xl relative z-10">
          <div className="mb-12">
            <Play className="w-32 h-32 mx-auto mb-8 text-emerald-300 drop-shadow-lg" />
            <h1 className="text-6xl font-bold mb-6 bg-gradient-to-r from-emerald-300 via-amber-300 to-emerald-400 bg-clip-text text-transparent drop-shadow-2xl">
              Join the Game!
            </h1>
            <p className="text-2xl text-emerald-100 mb-12 font-light tracking-wide">Enter your name to participate</p>
          </div>
          
          <div className="bg-black/40 backdrop-blur-lg rounded-3xl p-8 border-2 border-emerald-400/30 shadow-2xl">
            <form onSubmit={handlePlayerRegistration} className="space-y-6">
              <div>
                <input
                  type="text"
                  placeholder="Enter your name or team name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full bg-black/40 border-2 border-emerald-400/50 rounded-xl px-6 py-4 text-white placeholder-emerald-200/50 text-xl focus:outline-none focus:border-emerald-400 transition-colors"
                  maxLength={50}
                  required
                />
              </div>
              
              {registrationError && (
                <p className="text-red-400 text-lg">{registrationError}</p>
              )}
              
              <button
                type="submit"
                disabled={!playerName.trim()}
                className="w-full bg-gradient-to-r from-emerald-600 to-emerald-800 hover:from-emerald-500 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-800 disabled:cursor-not-allowed text-white text-xl font-bold py-4 px-8 rounded-full transition-all duration-300 shadow-lg border-2 border-emerald-400/50"
              >
                Join Game
              </button>
            </form>
            
            <button
              onClick={() => setAppMode('main')}
              className="w-full mt-4 bg-gradient-to-r from-amber-600 to-amber-800 hover:from-amber-500 hover:to-amber-700 text-black text-lg font-bold py-3 px-6 rounded-full transition-all duration-300 shadow-lg border-2 border-amber-400"
            >
              Back to Main Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Host Mode - Full control interface
  if (!gameState.gameStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-amber-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-100/5 via-transparent to-emerald-900/10"></div>
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400"></div>
        
        <div className="relative z-10 p-8">
          {/* Host Header */}
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center space-x-4">
              <Trophy className="w-10 h-10 text-amber-300" />
              <div>
                <h1 className="text-3xl font-bold text-amber-100">Host Control Panel</h1>
                <p className="text-amber-300">Manage your trivia game</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <ConnectionStatus isConnected={isConnected} error={error} />
              <button
                onClick={() => setAppMode('landing')}
                className="bg-black/40 hover:bg-black/60 text-amber-100 px-4 py-2 rounded-lg border border-amber-400/30"
              >
                ← Back to Menu
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Game Setup */}
            <div className="lg:col-span-2">
              <div className="bg-black/40 backdrop-blur-lg rounded-3xl p-8 border-2 border-amber-400/30 shadow-2xl relative mb-8">
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-amber-400 rotate-45"></div>
                <h2 className="text-2xl font-bold text-amber-100 mb-6">Game Setup</h2>
                
                {/* Game Settings */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  {/* Question Limit */}
                  <div>
                    <label className="block text-sm font-semibold text-amber-200 mb-2">Number of Questions</label>
                    <select
                      value={gameState.questionLimit || ''}
                      onChange={(e) => {
                        updateGameSettings({
                          question_limit: e.target.value ? parseInt(e.target.value) : null
                        });
                      }}
                      className="w-full bg-black/30 border border-amber-400/30 rounded-lg px-3 py-2 text-amber-100"
                    >
                      <option value="">All Questions</option>
                      <option value="5">5 Questions</option>
                      <option value="10">10 Questions</option>
                      <option value="15">15 Questions</option>
                      <option value="20">20 Questions</option>
                      <option value="25">25 Questions</option>
                      <option value="30">30 Questions</option>
                    </select>
                  </div>

                  {/* Time Limit */}
                  <div>
                    <label className="block text-sm font-semibold text-amber-200 mb-2">Time Per Question</label>
                    <select
                      value={gameState.timeLimit}
                      onChange={(e) => {
                        updateGameSettings({
                          time_limit: parseInt(e.target.value)
                        });
                      }}
                      disabled={!gameState.timedRounds}
                      className="w-full bg-black/30 border border-amber-400/30 rounded-lg px-3 py-2 text-amber-100 disabled:opacity-50"
                    >
                      <option value="15">15 seconds</option>
                      <option value="30">30 seconds</option>
                      <option value="45">45 seconds</option>
                      <option value="60">1 minute</option>
                      <option value="90">1.5 minutes</option>
                      <option value="120">2 minutes</option>
                    </select>
                  </div>

                  {/* Timed Rounds Toggle */}
                  <div>
                    <label className="block text-sm font-semibold text-amber-200 mb-2">Timer Settings</label>
                    <label className="flex items-center space-x-3 bg-black/20 border border-amber-400/30 rounded-lg px-3 py-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={gameState.timedRounds}
                        onChange={(e) => {
                          console.log('🔄 Setting timed_rounds to:', e.target.checked);
                          updateGameSettings({
                            timed_rounds: e.target.checked
                          });
                          // Reset to waiting screen when timer setting changes during game
                          if (gameState.gameStarted) {
                            websocketService.sendGameAction('RESET_QUESTION');
                          }
                        }}
                        className="w-4 h-4 text-emerald-600 bg-black/30 border-amber-400/30 rounded focus:ring-emerald-500"
                      />
                      <span className="text-amber-100">Enable Timer</span>
                    </label>
                  </div>
                </div>

                {/* Display Settings */}
                <div className="mb-6">
                  <label className="block text-lg font-semibold text-amber-200 mb-4">Display Settings</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-semibold text-amber-200 mb-2">Game Title</label>
                      <input
                        type="text"
                        value={gameState.gameTitle}
                        onChange={(e) => {
                          updateGameSettings({
                            game_title: e.target.value
                          });
                        }}
                        className="w-full bg-black/30 border border-amber-400/30 rounded-lg px-3 py-2 text-amber-100"
                        placeholder="TRIVIA NIGHT"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-amber-200 mb-2">Game Subtitle</label>
                      <input
                        type="text"
                        value={gameState.gameSubtitle}
                        onChange={(e) => {
                          updateGameSettings({
                            game_subtitle: e.target.value
                          });
                        }}
                        className="w-full bg-black/30 border border-amber-400/30 rounded-lg px-3 py-2 text-amber-100"
                        placeholder="Get Ready to Play!"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-amber-200 mb-2">Question Info</label>
                      <label className="flex items-center space-x-3 bg-black/20 border border-amber-400/30 rounded-lg px-3 py-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={gameState.showQuestionCounter}
                          onChange={(e) => {
                            updateGameSettings({
                              show_question_counter: e.target.checked
                            });
                          }}
                          className="w-4 h-4 text-emerald-600 bg-black/30 border-amber-400/30 rounded focus:ring-emerald-500"
                        />
                        <span className="text-amber-100">Show Question & Category Count</span>
                      </label>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-amber-200 mb-2">Wait Screen</label>
                      <label className="flex items-center space-x-3 bg-black/20 border border-amber-400/30 rounded-lg px-3 py-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={gameState.showWaitScreen}
                          onChange={(e) => {
                            console.log('🔄 Setting show_wait_screen to:', e.target.checked);
                            updateGameSettings({
                              show_wait_screen: e.target.checked
                            });
                          }}
                          className="w-4 h-4 text-emerald-600 bg-black/30 border-amber-400/30 rounded focus:ring-emerald-500"
                        />
                        <span className="text-amber-100">Show Wait Between Questions</span>
                      </label>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-amber-200 mb-2">Player Mode</label>
                      <label className="flex items-center space-x-3 bg-black/20 border border-amber-400/30 rounded-lg px-3 py-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={gameState.playerMode}
                          onChange={(e) => {
                            console.log('🎮 Setting player_mode to:', e.target.checked);
                            updateGameSettings({
                              player_mode: e.target.checked
                            });
                          }}
                          className="w-4 h-4 text-emerald-600 bg-black/30 border-amber-400/30 rounded focus:ring-emerald-500"
                        />
                        <span className="text-amber-100">Enable Player Mode</span>
                      </label>
                    </div>
                  </div>
                </div>


                {/* Start Game Button */}
                <button
                  onClick={startGame}
                  disabled={filteredQuestions.length === 0}
                  className="w-full bg-gradient-to-r from-emerald-600 to-emerald-800 hover:from-emerald-500 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-800 text-white text-xl font-bold py-4 px-8 rounded-xl transition-all duration-300 shadow-lg border-2 border-emerald-400/50 disabled:border-gray-600/50"
                >
                  <Play className="w-6 h-6 mr-3 inline" />
                  {filteredQuestions.length === 0 ? 'No Questions Available - Check Settings' : `Start Trivia Game (${filteredQuestions.length} questions)`}
                </button>
              </div>

              {/* Question Management */}
              {!adminMode && (
                <div className="bg-black/40 backdrop-blur-lg rounded-3xl p-8 border-2 border-amber-400/30 shadow-2xl relative">
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-amber-400 rotate-45"></div>
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-amber-100">Question Library</h2>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setAdminMode(true)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center border border-emerald-400/50"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Manage Questions
                      </button>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportQuestions}
                        className="hidden"
                        id="importFile"
                      />
                      <label
                        htmlFor="importFile"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center cursor-pointer border border-emerald-400/50"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Import
                      </label>
                      <button
                        onClick={handleExportQuestions}
                        className="bg-amber-600 hover:bg-amber-700 text-black px-4 py-2 rounded-lg font-semibold transition-colors flex items-center border border-amber-400"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Export
                      </button>
                    </div>
                  </div>

                  {/* Category Filter */}
                  <div className="mb-4">
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="bg-black/30 border border-amber-400/30 rounded-lg px-3 py-2 text-amber-100 text-sm focus:border-amber-400/50 focus:outline-none"
                    >
                      <option value="all">All Categories ({questions.length} questions)</option>
                      {safeCategories.map((category) => (
                        <option key={category} value={category}>
                          {category} ({questions.filter(q => q.category === category).length})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {getFilteredLibraryQuestions().slice(0, 10).map((q) => (
                      <div key={q.id} className="bg-black/30 p-4 rounded-lg flex justify-between items-center border border-amber-400/20">
                        <div className="flex-1">
                          <span className="text-sm text-amber-300">{q.category}</span>
                          <p className="font-medium text-amber-100 truncate">{q.question}</p>
                        </div>
                        <div className="flex space-x-2">
                          {/* Add to playlist button */}
                          {q.id && !includedQuestions.has(q.id) ? (
                            <button
                              onClick={() => addToPlaylist(q.id!)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-lg border border-emerald-400/50"
                              title="Add to playlist"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          ) : q.id && includedQuestions.has(q.id) ? (
                            <button
                              onClick={() => removeFromPlaylist(q.id!)}
                              className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg border border-red-400/50"
                              title="Remove from playlist"
                            >
                              ×
                            </button>
                          ) : null}
                          <button
                            onClick={() => setEditingQuestion(q)}
                            className="bg-amber-600 hover:bg-amber-700 text-black p-2 rounded-lg border border-amber-400"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => q.id && handleDeleteQuestion(q.id)}
                            className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {getFilteredLibraryQuestions().length > 10 && (
                      <div className="text-center text-amber-300 text-sm pt-2">
                        ... and {getFilteredLibraryQuestions().length - 10} more questions
                      </div>
                    )}
                    {getFilteredLibraryQuestions().length === 0 && (
                      <div className="text-center text-amber-300 text-sm pt-4">
                        No questions found in this category.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Game Stats */}
            <div className="space-y-6">
              <div className="bg-black/40 backdrop-blur-lg rounded-3xl p-6 border-2 border-amber-400/30 shadow-2xl relative">
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-amber-400 rotate-45"></div>
                <h3 className="text-xl font-bold text-amber-100 mb-4">Game Stats</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-amber-200">Total Questions:</span>
                    <span className="text-amber-100 font-semibold">{questions.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-amber-200">Categories:</span>
                    <span className="text-amber-100 font-semibold">{safeCategories.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-amber-200">Selected:</span>
                    <span className="text-emerald-300 font-semibold">{filteredQuestions.length}</span>
                  </div>
                </div>
              </div>

              <div className="bg-black/40 backdrop-blur-lg rounded-3xl p-6 border-2 border-amber-400/30 shadow-2xl relative">
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-amber-400 rotate-45"></div>
                <h3 className="text-xl font-bold text-amber-100 mb-4">Instructions</h3>
                <div className="space-y-2 text-sm text-amber-200">
                  <p>1. Add questions to your playlist from the Question Library</p>
                  <p>2. Open Big Screen Mode on your display</p>
                  <p>3. Start the game from this control panel</p>
                  <p>4. Control progression and reveals</p>
                </div>
                
                {filteredQuestions.length === 0 && (
                  <div className="mt-4 p-3 bg-red-600/20 border border-red-400/50 rounded-lg">
                    <h4 className="text-red-300 font-semibold mb-2">⚠️ No Questions Available</h4>
                    <div className="text-sm text-red-200">
                      <p>• Total questions in library: {questions.length}</p>
                      <p>• Questions in playlist: {getPlaylistQuestions().length}</p>
                      {questions.length === 0 && <p className="text-yellow-300 mt-2">Try importing questions or adding new ones!</p>}
                      {questions.length > 0 && getPlaylistQuestions().length === 0 && (
                        <p className="text-yellow-300 mt-2">Add questions to your playlist using the "+" button in the Question Library!</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Included Questions Playlist - Separate Section */}
              <div className="bg-black/40 backdrop-blur-lg rounded-3xl p-6 border-2 border-amber-400/30 shadow-2xl relative">
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-amber-400 rotate-45"></div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-amber-100">Included Questions</h3>
                  <span className="text-sm text-amber-300">{getPlaylistQuestions().length} questions</span>
                </div>
                
                {getPlaylistQuestions().length === 0 ? (
                  <div className="p-3 bg-amber-600/20 border border-amber-400/50 rounded-lg text-center">
                    <p className="text-amber-200 text-sm">No questions added yet. Use the "+" button in the Question Library to add questions.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {getPlaylistQuestions().map((question, index) => (
                      <div key={question.id} className="flex items-center justify-between p-2 bg-black/30 rounded-lg border border-amber-400/20">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-amber-100 truncate">{index + 1}. {question.question}</p>
                          <p className="text-xs text-amber-300">{question.category}</p>
                        </div>
                        <button
                          onClick={() => question.id && removeFromPlaylist(question.id)}
                          className="ml-2 text-red-400 hover:text-red-300 text-sm font-bold"
                          title="Remove from playlist"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Question Management Panel */}
          {adminMode && (
            <div className="mt-8 bg-black/40 backdrop-blur-lg rounded-3xl p-8 border-2 border-amber-400/30 shadow-2xl relative">
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-amber-400 rotate-45"></div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-amber-100">Question Management</h2>
                <button
                  onClick={() => setAdminMode(false)}
                  className="bg-black/60 hover:bg-black/80 text-amber-100 px-4 py-2 rounded-lg border border-amber-400/30"
                >
                  Close Manager
                </button>
              </div>

              {/* Current Questions List */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-4 text-amber-100">All Questions ({questions.length})</h3>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {questions.map((q) => (
                    <div key={q.id} className="bg-black/30 p-4 rounded-lg flex justify-between items-center border border-amber-400/20">
                      <div className="flex-1">
                        <span className="text-sm text-amber-300">{q.category}</span>
                        <p className="font-medium text-amber-100">{q.question}</p>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setEditingQuestion(q)}
                          className="bg-amber-600 hover:bg-amber-700 text-black p-2 rounded-lg border border-amber-400"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => q.id && handleDeleteQuestion(q.id)}
                          className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add New Question Form */}
              <div className="border-t border-amber-400/20 pt-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center text-amber-100">
                  <Plus className="w-5 h-5 mr-2" />
                  Add New Question
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="Category"
                    value={newQuestion.category}
                    onChange={(e) => setNewQuestion({...newQuestion, category: e.target.value})}
                    className="bg-black/30 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100 placeholder-amber-200/50"
                  />
                  <div>
                    <label className="block text-sm font-medium mb-1 text-amber-200">Question Type</label>
                    <select
                      value={newQuestion.type}
                      onChange={(e) => {
                        const newType = e.target.value as 'multiple_choice' | 'write_in';
                        setNewQuestion({
                          ...newQuestion, 
                          type: newType,
                          options: newType === 'write_in' ? [] : ['', '', '', '']
                        });
                      }}
                      className="w-full bg-black/30 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100 focus:border-amber-400 focus:outline-none"
                    >
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="write_in">Write-in</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    placeholder={newQuestion.type === 'write_in' ? "Sample Answer (optional)" : "Answer"}
                    value={newQuestion.answer}
                    onChange={(e) => setNewQuestion({...newQuestion, answer: e.target.value})}
                    className="bg-black/30 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100 placeholder-amber-200/50 md:col-span-1"
                  />
                  <textarea
                    placeholder="Question"
                    value={newQuestion.question}
                    onChange={(e) => setNewQuestion({...newQuestion, question: e.target.value})}
                    className="bg-black/30 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100 placeholder-amber-200/50 md:col-span-2"
                    rows={2}
                  />
                  {newQuestion.type === 'multiple_choice' && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-2 text-amber-200">Options</label>
                      <div className="grid grid-cols-2 gap-2">
                        {newQuestion.options.map((option, index) => (
                          <input
                            key={index}
                            type="text"
                            placeholder={`Option ${String.fromCharCode(65 + index)}`}
                            value={option}
                            onChange={(e) => {
                              const newOptions = [...newQuestion.options];
                              newOptions[index] = e.target.value;
                              setNewQuestion({...newQuestion, options: newOptions});
                            }}
                            className="bg-black/30 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100 placeholder-amber-200/50"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {newQuestion.type === 'write_in' && (
                    <div className="md:col-span-2 bg-black/20 border border-amber-400/20 rounded-lg p-4">
                      <p className="text-amber-200 text-sm">
                        <strong>Write-in Question:</strong> Players will type their answers. In player mode, the host can review and award points to the best answers.
                      </p>
                    </div>
                  )}
                  <textarea
                    placeholder="Explanation"
                    value={newQuestion.explanation}
                    onChange={(e) => setNewQuestion({...newQuestion, explanation: e.target.value})}
                    className="bg-black/30 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100 placeholder-amber-200/50 md:col-span-2"
                    rows={2}
                  />
                  <input
                    type="url"
                    placeholder="Image URL (optional)"
                    value={newQuestion.image_url}
                    onChange={(e) => setNewQuestion({...newQuestion, image_url: e.target.value})}
                    className="bg-black/30 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100 placeholder-amber-200/50 md:col-span-2"
                  />
                  <button
                    onClick={handleAddQuestion}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors md:col-span-2 border border-emerald-400/50"
                  >
                    Add Question
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Players List Panel */}
          <div className="mt-8 bg-black/40 backdrop-blur-lg rounded-3xl p-8 border-2 border-emerald-400/30 shadow-2xl relative">
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-emerald-400 rotate-45"></div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-emerald-100 flex items-center">
                <Play className="w-6 h-6 mr-3" />
                Players ({players.length})
              </h2>
              <div className="flex space-x-2">
                <button
                  onClick={refreshPlayers}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors border border-emerald-400/50"
                >
                  Refresh
                </button>
                {players.length > 0 && (
                  <>
                    <button
                      onClick={handleResetAllScores}
                      className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors border border-orange-400/50"
                    >
                      Reset Scores
                    </button>
                    <button
                      onClick={handleClearPlayers}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors border border-red-400/50"
                    >
                      Clear All
                    </button>
                  </>
                )}
              </div>
            </div>

            {players.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-emerald-200 text-lg mb-4">No players have joined yet</p>
                <p className="text-emerald-300 text-sm">Players can join by scanning the QR code or visiting the guest URL</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-64 overflow-y-auto">
                {players.map((player) => (
                  <div key={player.id} className="bg-black/30 border border-emerald-400/30 rounded-lg p-4 flex justify-between items-center">
                    <div className="flex items-center space-x-4">
                      <div className={`w-3 h-3 rounded-full ${player.connected ? 'bg-green-400' : 'bg-red-400'}`}></div>
                      <div>
                        <h3 className="text-emerald-100 font-semibold text-lg">{player.name}</h3>
                        <p className="text-emerald-300 text-sm">
                          Joined {new Date(player.joined_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="text-2xl font-bold text-amber-400">{player.score}</p>
                        <p className="text-emerald-300 text-sm">points</p>
                      </div>
                      <button
                        onClick={() => handleResetPlayerScore(player.id, player.name)}
                        className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded-md text-sm font-semibold transition-colors border border-orange-400/50"
                        title={`Reset ${player.name}'s score`}
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Edit Question Modal */}
          {editingQuestion && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <div className="bg-black/90 border-2 border-amber-400/30 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto relative">
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-amber-400 rotate-45"></div>
                <h3 className="text-xl font-bold mb-4 text-amber-100">Edit Question</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder="Category"
                      value={editingQuestion.category}
                      onChange={(e) => setEditingQuestion({...editingQuestion, category: e.target.value})}
                      className="bg-black/40 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100 placeholder-amber-200/50"
                    />
                    <select
                      value={editingQuestion.type || 'multiple_choice'}
                      onChange={(e) => {
                        const newType = e.target.value as 'multiple_choice' | 'write_in';
                        setEditingQuestion({
                          ...editingQuestion, 
                          type: newType,
                          options: newType === 'write_in' ? [] : (editingQuestion.options?.length === 4 ? editingQuestion.options : ['', '', '', ''])
                        });
                      }}
                      className="bg-black/40 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100"
                    >
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="write_in">Write-in</option>
                    </select>
                  </div>
                  <textarea
                    placeholder="Question"
                    value={editingQuestion.question}
                    onChange={(e) => setEditingQuestion({...editingQuestion, question: e.target.value})}
                    className="w-full bg-black/40 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100 placeholder-amber-200/50"
                    rows={3}
                  />
                  {(editingQuestion.type || 'multiple_choice') === 'multiple_choice' && (
                    <div>
                      <label className="block text-sm font-medium mb-2 text-amber-200">Options</label>
                      <div className="grid grid-cols-2 gap-2">
                        {editingQuestion.options.map((option, index) => (
                          <input
                            key={index}
                            type="text"
                            placeholder={`Option ${String.fromCharCode(65 + index)}`}
                            value={option}
                            onChange={(e) => {
                              const newOptions = [...editingQuestion.options];
                              newOptions[index] = e.target.value;
                              setEditingQuestion({...editingQuestion, options: newOptions});
                            }}
                            className="bg-black/40 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100 placeholder-amber-200/50"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {(editingQuestion.type || 'multiple_choice') === 'write_in' && (
                    <div className="bg-black/20 border border-amber-400/20 rounded-lg p-4">
                      <p className="text-amber-200 text-sm">
                        <strong>Write-in Question:</strong> Players will type their answers. In player mode, the host can review and award points to the best answers.
                      </p>
                    </div>
                  )}
                  <input
                    type="text"
                    placeholder="Answer"
                    value={editingQuestion.answer}
                    onChange={(e) => setEditingQuestion({...editingQuestion, answer: e.target.value})}
                    className="w-full bg-black/40 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100 placeholder-amber-200/50"
                  />
                  <textarea
                    placeholder="Explanation"
                    value={editingQuestion.explanation}
                    onChange={(e) => setEditingQuestion({...editingQuestion, explanation: e.target.value})}
                    className="w-full bg-black/40 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100 placeholder-amber-200/50"
                    rows={2}
                  />
                  <input
                    type="url"
                    placeholder="Image URL (optional)"
                    value={editingQuestion.image_url || ''}
                    onChange={(e) => setEditingQuestion({...editingQuestion, image_url: e.target.value})}
                    className="w-full bg-black/40 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100 placeholder-amber-200/50"
                  />
                  <div className="flex space-x-4">
                    <button
                      onClick={() => handleUpdateQuestion(editingQuestion)}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors border border-emerald-400/50"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={() => setEditingQuestion(null)}
                      className="flex-1 bg-black/60 hover:bg-black/80 text-amber-100 px-6 py-2 rounded-lg font-semibold transition-colors border border-amber-400/30"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const currentQuestion = filteredQuestions[gameState.currentSlide];
  if (!currentQuestion) return null;

  // Debug current question
  if (currentQuestion && (currentQuestion.type || 'multiple_choice') === 'write_in') {
    console.log('🔍 Current write-in question:', {
      id: currentQuestion.id,
      question: currentQuestion.question,
      answer: currentQuestion.answer,
      answerLength: currentQuestion.answer?.length,
      hasAnswer: !!currentQuestion.answer
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-amber-900 text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-100/5 via-transparent to-emerald-900/10"></div>
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400"></div>
      <div className="relative z-10">
        {/* Header */}
        <div className="bg-black/40 backdrop-blur-sm border-b-2 border-amber-400/30 p-6">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <Trophy className="w-8 h-8 text-amber-300" />
              <h1 className="text-2xl font-bold text-amber-100">Host Control Panel</h1>
            </div>
            
            <div className="flex items-center space-x-6">
              {(gameState.showQuestionCounter && gameState.gameStarted && filteredQuestions.length > 0) ? (
                <div className="text-center">
                  <div className="text-sm text-amber-300">Question</div>
                  <div className="text-xl font-bold text-amber-100">{gameState.currentSlide + 1}/{filteredQuestions.length}</div>
                </div>
              ) : null}
              
              {gameState.timedRounds && gameState.timer > 0 ? (
                <div className="text-center">
                  <div className="text-sm text-amber-300">Timer</div>
                  <div className={`text-2xl font-bold ${gameState.timer <= 10 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {gameState.timer}s
                  </div>
                </div>
              ) : null}
              
              <ConnectionStatus isConnected={isConnected} error={error} />
              
              <button
                onClick={endGame}
                className="bg-black/40 hover:bg-black/60 text-amber-100 px-4 py-2 rounded-lg border border-amber-400/30"
              >
                End Game
              </button>
            </div>
          </div>
          
          {/* Leaderboard Toggle Button (Player Mode Only) */}
          {gameState?.playerMode && (
            <div className="bg-black/30 border-b border-emerald-400/20 p-4">
              <div className="max-w-7xl mx-auto flex justify-center">
                <button
                  onClick={toggleLeaderboard}
                  className={`px-6 py-3 rounded-lg font-bold transition-colors border-2 flex items-center space-x-2 ${
                    gameState.showLeaderboard 
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-400' 
                      : 'bg-black/40 hover:bg-black/60 text-emerald-100 border-emerald-400/50'
                  }`}
                >
                  <Trophy className="w-5 h-5" />
                  <span>{gameState.showLeaderboard ? 'Hide Leaderboard' : 'Show Leaderboard'}</span>
                </button>
              </div>
            </div>
          )}
          
          {/* Host Control Buttons */}
          <div className="bg-black/20 border-b border-amber-400/20 p-4">
            <div className="max-w-7xl mx-auto">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button
                  onClick={prevSlide}
                  disabled={gameState.currentSlide === 0}
                  className="bg-black/40 hover:bg-black/60 disabled:bg-black/20 disabled:opacity-50 text-amber-100 px-4 py-2 rounded-lg font-semibold transition-colors flex items-center justify-center border border-amber-400/30 hover:border-amber-400/50"
                >
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Previous
                </button>

                {(!gameState.firstQuestionStarted && gameState.showWaitScreen) ? (
                  <button
                    onClick={gameState.timedRounds ? startTimer : showQuestion}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center justify-center border border-emerald-400/50"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    {gameState.timedRounds ? 'Start Timer' : 'Show Question'}
                  </button>
                ) : gameState.timedRounds && (
                  <button
                    onClick={startTimer}
                    disabled={gameState.isTimerRunning}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center justify-center border border-emerald-400/50"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    {gameState.isTimerRunning ? 'Running...' : 'Start Timer'}
                  </button>
                )}

                <button
                  onClick={toggleAnswer}
                  className={`px-4 py-2 rounded-lg font-semibold transition-colors border ${
                    gameState.showAnswer 
                      ? 'bg-red-600 hover:bg-red-700 text-white border-red-400' 
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-400'
                  }`}
                >
                  {gameState.showAnswer ? 'Hide Answer' : 'Show Answer'}
                </button>

                <button
                  onClick={nextSlide}
                  disabled={gameState.currentSlide === filteredQuestions.length - 1}
                  className="bg-black/40 hover:bg-black/60 disabled:bg-black/20 disabled:opacity-50 text-amber-100 px-4 py-2 rounded-lg font-semibold transition-colors flex items-center justify-center border border-amber-400/30 hover:border-amber-400/50"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-2" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Host Question Preview */}
        <div className="max-w-4xl mx-auto p-8">
          <div className="bg-black/40 backdrop-blur-lg rounded-2xl p-8 border-2 border-amber-400/30 shadow-2xl relative">
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-amber-400 rotate-45"></div>
            {/* Category Badge */}
            <div className="text-center mb-8">
              <span className="bg-gradient-to-r from-amber-400 to-yellow-400 text-black px-6 py-2 rounded-full text-lg font-semibold border-2 border-amber-300 shadow-lg">
                {currentQuestion.category}
              </span>
            </div>

            {/* Question */}
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold mb-8 leading-tight text-amber-100">
                {currentQuestion.question}
              </h2>
            </div>

            {/* Options */}
            <div className="grid grid-cols-2 gap-6 mb-12">
              {currentQuestion.options.map((option, index) => (
                <div
                  key={index}
                  className={`p-6 rounded-2xl border-2 text-center text-xl font-semibold transition-all duration-300 relative ${
                    option === currentQuestion.answer
                      ? 'bg-emerald-600/40 border-emerald-400 text-emerald-100 shadow-lg'
                      : 'bg-black/30 border-amber-400/30 hover:bg-black/50 hover:border-amber-400/50 text-amber-100'
                  }`}
                >
                  <div className="flex items-center justify-center space-x-3">
                    <span className="w-8 h-8 bg-amber-600 rounded-full flex items-center justify-center text-sm font-bold text-black border border-amber-400">
                      {String.fromCharCode(65 + index)}
                    </span>
                    <span>{option}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Answer Explanation - Always visible in host mode */}
            <div className="bg-emerald-600/20 border-2 border-emerald-400/50 rounded-2xl p-6 mb-8 text-center relative">
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-emerald-400 rotate-45"></div>
              <h3 className="text-2xl font-bold text-emerald-300 mb-3">
                Correct Answer: {currentQuestion.answer}
              </h3>
              <p className="text-lg text-emerald-100">{currentQuestion.explanation}</p>
              <div className="mt-4 text-sm text-emerald-200">
                Big Screen Answer: {gameState.showAnswer ? 'VISIBLE' : 'HIDDEN'}
              </div>
            </div>

            {/* Controls */}
            <div className="flex justify-center space-x-4">
              <button
                onClick={prevSlide}
                disabled={gameState.currentSlide === 0}
                className="bg-black/40 hover:bg-black/60 disabled:bg-black/20 disabled:opacity-50 text-amber-100 px-6 py-3 rounded-xl font-semibold transition-colors flex items-center border border-amber-400/30 hover:border-amber-400/50"
              >
                <ChevronLeft className="w-5 h-5 mr-2" />
                Previous
              </button>

              {!gameState.firstQuestionStarted ? (
                <button
                  onClick={gameState.timedRounds ? startTimer : showQuestion}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-semibold transition-colors flex items-center border border-emerald-400/50"
                >
                  <Play className="w-5 h-5 mr-2" />
                  {gameState.timedRounds ? 'Start Timer' : 'Show Question'}
                </button>
              ) : gameState.timedRounds && !gameState.isTimerRunning ? (
                <button
                  onClick={startTimer}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-semibold transition-colors flex items-center border border-emerald-400/50"
                >
                  <Play className="w-5 h-5 mr-2" />
                  Start Timer
                </button>
              ) : null}

              <button
                onClick={toggleAnswer}
                className={`px-8 py-3 rounded-xl font-semibold transition-colors border ${
                  gameState.showAnswer 
                    ? 'bg-red-600 hover:bg-red-700 text-white border-red-400'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-400'
                }`}
              >
                {gameState.showAnswer ? 'Hide Answer' : 'Show Answer'}
              </button>

              <button
                onClick={nextSlide}
                disabled={gameState.currentSlide === filteredQuestions.length - 1}
                className="bg-black/40 hover:bg-black/60 disabled:bg-black/20 disabled:opacity-50 text-amber-100 px-6 py-3 rounded-xl font-semibold transition-colors flex items-center border border-amber-400/30 hover:border-amber-400/50"
              >
                Next
                <ChevronRight className="w-5 h-5 ml-2" />
              </button>
            </div>
          </div>
        </div>

        {/* Player Answer Selections */}
        {gameState?.playerMode && (
          <div className="max-w-7xl mx-auto p-4">
            <div className="bg-black/40 backdrop-blur-lg rounded-2xl p-6 border-2 border-emerald-400/30 shadow-2xl relative">
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-emerald-400 rotate-45"></div>
              <h3 className="text-xl font-bold text-emerald-300 mb-4 text-center">Player Responses</h3>
              
              {questionAnswers && questionAnswers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {questionAnswers.map((playerAnswer, index) => (
                    <div key={index} className="bg-gray-800/50 rounded-xl p-4 border border-gray-600/50">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-emerald-200">{playerAnswer.name}</span>
                        {playerAnswer.selected_answer && (
                          <span className="text-xs text-gray-400">
                            {new Date(playerAnswer.submitted_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                          </span>
                        )}
                      </div>
                      {playerAnswer.selected_answer ? (
                        <div className="text-amber-300 font-medium bg-amber-900/20 rounded px-3 py-2 border border-amber-600/30">
                          {playerAnswer.selected_answer}
                        </div>
                      ) : (
                        <div className="text-gray-400 italic bg-gray-700/20 rounded px-3 py-2 border border-gray-600/30">
                          No answer submitted
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-400 py-8">
                  {players.length === 0 ? 'No players connected' : 'No responses yet'}
                </div>
              )}
              
              {/* Answer Summary */}
              {questionAnswers && questionAnswers.length > 0 && currentQuestion && (
                <div className="mt-6 pt-4 border-t border-emerald-400/20">
                  {(currentQuestion.type || 'multiple_choice') === 'multiple_choice' ? (
                    /* Multiple Choice Summary */
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                      {currentQuestion.options.map((option, index) => {
                        const count = questionAnswers.filter(pa => pa.selected_answer === option).length;
                        const percentage = questionAnswers.length > 0 ? Math.round((count / questionAnswers.length) * 100) : 0;
                        return (
                          <div key={index} className="bg-gray-800/30 rounded-lg p-3">
                            <div className="text-sm text-gray-300 mb-1">
                              {String.fromCharCode(65 + index)}: {option.length > 20 ? option.substring(0, 20) + '...' : option}
                            </div>
                            <div className="text-lg font-bold text-emerald-300">{count}</div>
                            <div className="text-xs text-gray-400">{percentage}%</div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Write-in Question - Award Points Interface */
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <div>
                          <h4 className="text-lg font-bold text-emerald-300">Award Points to Best Answers</h4>
                          <div className="text-xs text-gray-400 mt-1">
                            Q{gameState.currentSlide + 1}: {filteredQuestions[gameState.currentSlide]?.question?.substring(0, 30)}... 
                            (ID: {filteredQuestions[gameState.currentSlide]?.id}, Type: {filteredQuestions[gameState.currentSlide]?.type || 'multiple_choice'})
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={async () => {
                              const currentQuestion = filteredQuestions[gameState.currentSlide];
                              if (currentQuestion?.id) {
                                console.log('🔄 Manually refreshing answers for question:', currentQuestion.id);
                                try {
                                  const answers = await getQuestionAnswers(currentQuestion.id);
                                  console.log('📋 Fetched answers:', answers);
                                } catch (error) {
                                  console.error('❌ Failed to fetch answers:', error);
                                }
                              }
                            }}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                          >
                            Refresh Answers
                          </button>
                          <button
                            onClick={async () => {
                              console.log('🔄 Refreshing players...');
                              try {
                                await refreshPlayers();
                                console.log('✅ Players refreshed successfully');
                              } catch (error) {
                                console.error('❌ Failed to refresh players:', error);
                              }
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                          >
                            Refresh Players
                          </button>
                        </div>
                      </div>
                      {/* Debug Info */}
                      <div className="bg-gray-900/50 rounded-lg p-3 mb-4 text-xs">
                        <div className="text-yellow-300 font-bold mb-1">Debug Info:</div>
                        <div className="text-gray-300">
                          Connection: <span className={isConnected ? 'text-green-400' : 'text-red-400'}>{isConnected ? 'Connected' : 'Disconnected'}</span><br/>
                          Players loaded: {players.length}<br/>
                          Current Question ID being queried: {filteredQuestions[gameState.currentSlide]?.id}<br/>
                          Total questionAnswers: {questionAnswers.length}<br/>
                          With answers: {questionAnswers.filter(pa => pa.selected_answer && pa.selected_answer.trim()).length}<br/>
                          Sample: {questionAnswers.length > 0 ? JSON.stringify(questionAnswers[0], null, 2) : 'None'}
                        </div>
                        <div className="flex space-x-2 mt-2">
                          <button
                            onClick={async () => {
                              console.log('🔍 Testing direct API call for question 7...');
                              try {
                                const response = await fetch('http://localhost:3001/api/answers/question/7');
                                const answers = await response.json();
                                console.log('📋 Direct API response for Q7:', answers);
                              } catch (error) {
                                console.error('❌ Direct API error:', error);
                              }
                            }}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-2 py-1 rounded text-xs"
                          >
                            Test Q7 API
                          </button>
                          <button
                            onClick={() => {
                              console.log('🔌 WebSocket connection state:', websocketService.getConnectionState());
                              websocketService.connect();
                            }}
                            className="bg-orange-600 hover:bg-orange-700 text-white px-2 py-1 rounded text-xs"
                          >
                            Reconnect WS
                          </button>
                          <button
                            onClick={async () => {
                              console.log('🧪 Testing answer submission...');
                              try {
                                const testAnswer = `Test answer ${Date.now()}`;
                                const response = await fetch('http://localhost:3001/api/answers/submit', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    playerId: 40, // Use existing player ID
                                    questionId: 7,
                                    selectedAnswer: testAnswer
                                  })
                                });
                                const result = await response.json();
                                console.log('✅ Test answer submitted:', result);
                              } catch (error) {
                                console.error('❌ Test answer failed:', error);
                              }
                            }}
                            className="bg-pink-600 hover:bg-pink-700 text-white px-2 py-1 rounded text-xs"
                          >
                            Test Submit
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {questionAnswers
                          .filter(pa => pa.selected_answer && pa.selected_answer.trim())
                          .map((playerAnswer, index) => (
                          <div key={index} className="bg-gray-800/50 rounded-xl p-4 border border-gray-600/50">
                            <div className="flex justify-between items-start mb-3">
                              <span className="font-bold text-emerald-200 text-lg">{playerAnswer.name}</span>
                              <span className="text-xs text-gray-400">
                                {new Date(playerAnswer.submitted_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </span>
                            </div>
                            <div className="bg-black/30 rounded-lg p-3 mb-3">
                              <p className="text-white text-base leading-relaxed">{playerAnswer.selected_answer}</p>
                            </div>
                            <div className="flex space-x-2">
                              <button
                                onClick={() => {
                                  console.log('🔴 +1 Point button clicked for player', playerAnswer.id);
                                  handleAwardPoints(playerAnswer.id, 1);
                                }}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-3 rounded-lg font-semibold transition-colors text-sm"
                              >
                                +1 Point
                              </button>
                              <button
                                onClick={() => {
                                  console.log('🟡 +3 Points button clicked for player', playerAnswer.id);
                                  handleAwardPoints(playerAnswer.id, 3);
                                }}
                                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2 px-3 rounded-lg font-semibold transition-colors text-sm"
                              >
                                +3 Points
                              </button>
                              <button
                                onClick={() => {
                                  console.log('🟣 +5 Points button clicked for player', playerAnswer.id);
                                  handleAwardPoints(playerAnswer.id, 5);
                                }}
                                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 px-3 rounded-lg font-semibold transition-colors text-sm"
                              >
                                +5 Points
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TriviaApp;