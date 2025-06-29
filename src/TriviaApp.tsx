import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Play, Trophy, Plus, Edit, Trash2, Download, Upload, Monitor, UserCog, Tv } from 'lucide-react';
import useNetworkedGame from './hooks/useNetworkedGame';
import ConnectionStatus from './components/ConnectionStatus';
import QRCodeDisplay from './components/QRCodeDisplay';
import websocketService from './services/websocket';
import apiService from './services/api';
import type { Question } from './services/api';

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
    options: ['', '', '', ''],
    answer: '',
    explanation: ''
  });

  const {
    questions,
    gameState,
    isConnected,
    isLoading,
    error,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    exportQuestions,
    importQuestions,
    startGame,
    endGame,
    nextSlide,
    prevSlide,
    showQuestion,
    toggleAnswer,
    startTimer,
    updateSettings,
    getFilteredQuestions,
    getAvailableCategories
  } = useNetworkedGame(appMode);

  const filteredQuestions = getFilteredQuestions ? getFilteredQuestions() : [];
  
  // Ensure we have safe defaults
  const safeQuestions = questions || [];
  const safeCategories = getAvailableCategories ? getAvailableCategories() : [];

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

  // Question management functions
  const handleAddQuestion = async () => {
    if (newQuestion.question && newQuestion.answer && newQuestion.options.every(opt => opt)) {
      try {
        await addQuestion(newQuestion);
        setNewQuestion({
          category: '',
          question: '',
          options: ['', '', '', ''],
          answer: '',
          explanation: ''
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
          options: question.options,
          answer: question.answer,
          explanation: question.explanation
        });
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

  // Main Entry Screen - Host or Guest Selection
  if (appMode === 'main') {
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
            <p className="text-3xl text-amber-100 mb-12 font-light tracking-wide">Choose Your Experience</p>
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

          <div className="mt-12 text-amber-300 text-lg">
            {safeQuestions.length} questions available across {safeCategories.length} categories
          </div>
        </div>
      </div>
    );
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
              {gameState.playerMode && (
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
              
              {gameState.showQuestionCounter && (
                <div className="text-xl text-amber-300 mt-4">
                  {filteredQuestions.length} questions ready • {safeCategories.length} categories
                </div>
              )}
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
    
    // Debug logging for Big Screen
    console.log('Big Screen Debug:', {
      currentSlide: gameState?.currentSlide,
      filteredQuestionsLength: filteredQuestions.length,
      hasCurrentQuestion: !!currentQuestion,
      gameStarted: gameState?.gameStarted,
      firstQuestionStarted: gameState?.firstQuestionStarted
    });
    
    if (!currentQuestion) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-amber-900 flex items-center justify-center text-white">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-amber-300 mb-4">No Questions Available</h1>
            <p className="text-xl text-amber-200">Waiting for host to load questions...</p>
            <div className="mt-4 text-amber-300">
              <p>Slide: {gameState?.currentSlide || 0}</p>
              <p>Total Questions: {filteredQuestions.length}</p>
            </div>
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
              {gameState.showQuestionCounter && (
                <div className="text-2xl text-amber-300">
                  {gameState.currentSlide + 1} / {filteredQuestions.length}
                </div>
              )}
            </div>
            
            {/* Compact Player Mode QR Code */}
            {gameState.playerMode && (
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

          {/* Main Question Area */}
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
                <h2 className="text-5xl font-bold mb-8 leading-tight text-amber-100">
                  {currentQuestion.question}
                </h2>
              </div>

              {/* Options */}
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

              {/* Answer Explanation */}
              {gameState.showAnswer && (
                <div className="bg-emerald-600/20 border-2 border-emerald-400/50 rounded-2xl p-8 text-center relative">
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-emerald-400 rotate-45"></div>
                  <h3 className="text-3xl font-bold text-emerald-300 mb-4">
                    Correct Answer: {currentQuestion.answer}
                  </h3>
                  <p className="text-xl text-emerald-100">{currentQuestion.explanation}</p>
                </div>
              )}

              {/* Timer Display */}
              {gameState.timedRounds && gameState.isTimerRunning && (
                <div className="text-center mt-8">
                  <div className={`text-6xl font-bold ${gameState.timer <= 10 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {gameState.timer}
                  </div>
                </div>
              )}
              
              {/* Debug Timer Info */}
              <div className="absolute bottom-4 left-4 text-sm text-amber-300 bg-black/50 p-2 rounded">
                Timer Debug: {gameState.timedRounds ? 'ON' : 'OFF'} | Running: {gameState.isTimerRunning ? 'YES' : 'NO'} | Time: {gameState.timer}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Guest Mode - Player interface
  if (appMode === 'guest') {
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
              PLAYER MODE
            </h1>
            <p className="text-2xl text-emerald-100 mb-12 font-light tracking-wide">Coming Soon!</p>
          </div>
          
          <div className="bg-black/40 backdrop-blur-lg rounded-3xl p-8 border-2 border-emerald-400/30 shadow-2xl">
            <p className="text-lg text-emerald-200 mb-8">
              Player mode is under development. Soon you'll be able to join trivia games from your device and submit answers in real-time!
            </p>
            <button
              onClick={() => setAppMode('main')}
              className="bg-gradient-to-r from-amber-600 to-amber-800 hover:from-amber-500 hover:to-amber-700 text-black text-xl font-bold py-4 px-8 rounded-full transition-all duration-300 shadow-lg border-2 border-amber-400 w-full"
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

                {/* Category Selection */}
                <div className="mb-6">
                  <label className="block text-lg font-semibold text-amber-200 mb-4">Select Categories</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {safeCategories.map((category) => (
                      <button
                        key={category}
                        onClick={() => {
                          const currentCategories = gameState?.selectedCategories || [];
                          const newCategories = currentCategories.includes(category) 
                            ? currentCategories.filter(c => c !== category)
                            : [...currentCategories, category];
                          updateGameSettings({
                            selected_categories: newCategories
                          });
                        }}
                        className={`p-3 rounded-lg border-2 text-sm font-semibold transition-all ${
                          (gameState?.selectedCategories || []).includes(category)
                            ? 'bg-emerald-600/40 border-emerald-400 text-emerald-100'
                            : 'bg-black/30 border-amber-400/30 text-amber-100 hover:border-amber-400/50'
                        }`}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 text-sm text-amber-300">
                    {(gameState?.selectedCategories || []).length === 0 ? `All categories selected (${filteredQuestions.length} questions)` : `${filteredQuestions.length} questions selected`}
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

                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {questions.slice(0, 10).map((q) => (
                      <div key={q.id} className="bg-black/30 p-4 rounded-lg flex justify-between items-center border border-amber-400/20">
                        <div className="flex-1">
                          <span className="text-sm text-amber-300">{q.category}</span>
                          <p className="font-medium text-amber-100 truncate">{q.question}</p>
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
                    {questions.length > 10 && (
                      <div className="text-center text-amber-300 text-sm pt-2">
                        ... and {questions.length - 10} more questions
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
                  <p>1. Select categories for your game</p>
                  <p>2. Open Big Screen Mode on your display</p>
                  <p>3. Start the game from this control panel</p>
                  <p>4. Control progression and reveals</p>
                </div>
                
                {filteredQuestions.length === 0 && (
                  <div className="mt-4 p-3 bg-red-600/20 border border-red-400/50 rounded-lg">
                    <h4 className="text-red-300 font-semibold mb-2">⚠️ No Questions Available</h4>
                    <div className="text-sm text-red-200">
                      <p>• Total questions in library: {questions.length}</p>
                      <p>• Selected categories: {(gameState?.selectedCategories || []).length === 0 ? 'All' : (gameState?.selectedCategories || []).join(', ')}</p>
                      <p>• Question limit: {gameState.questionLimit || 'None'}</p>
                      {questions.length === 0 && <p className="text-yellow-300 mt-2">Try importing questions or adding new ones!</p>}
                    </div>
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
                  <input
                    type="text"
                    placeholder="Answer"
                    value={newQuestion.answer}
                    onChange={(e) => setNewQuestion({...newQuestion, answer: e.target.value})}
                    className="bg-black/30 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100 placeholder-amber-200/50"
                  />
                  <textarea
                    placeholder="Question"
                    value={newQuestion.question}
                    onChange={(e) => setNewQuestion({...newQuestion, question: e.target.value})}
                    className="bg-black/30 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100 placeholder-amber-200/50 md:col-span-2"
                    rows={2}
                  />
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
                  <textarea
                    placeholder="Explanation"
                    value={newQuestion.explanation}
                    onChange={(e) => setNewQuestion({...newQuestion, explanation: e.target.value})}
                    className="bg-black/30 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100 placeholder-amber-200/50 md:col-span-2"
                    rows={2}
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

          {/* Edit Question Modal */}
          {editingQuestion && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <div className="bg-black/90 border-2 border-amber-400/30 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto relative">
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-amber-400 rotate-45"></div>
                <h3 className="text-xl font-bold mb-4 text-amber-100">Edit Question</h3>
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Category"
                    value={editingQuestion.category}
                    onChange={(e) => setEditingQuestion({...editingQuestion, category: e.target.value})}
                    className="w-full bg-black/40 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100 placeholder-amber-200/50"
                  />
                  <textarea
                    placeholder="Question"
                    value={editingQuestion.question}
                    onChange={(e) => setEditingQuestion({...editingQuestion, question: e.target.value})}
                    className="w-full bg-black/40 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100 placeholder-amber-200/50"
                    rows={3}
                  />
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
              {gameState.showQuestionCounter && (
                <div className="text-center">
                  <div className="text-sm text-amber-300">Question</div>
                  <div className="text-xl font-bold text-amber-100">{gameState.currentSlide + 1}/{filteredQuestions.length}</div>
                </div>
              )}
              
              <div className="text-center">
                <div className="text-sm text-amber-300">Timer</div>
                <div className={`text-2xl font-bold ${gameState.timer <= 10 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {gameState.timer}s
                </div>
              </div>
              
              <ConnectionStatus isConnected={isConnected} error={error} />
              
              <button
                onClick={endGame}
                className="bg-black/40 hover:bg-black/60 text-amber-100 px-4 py-2 rounded-lg border border-amber-400/30"
              >
                End Game
              </button>
            </div>
          </div>
          
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
      </div>
    </div>
  );
};

export default TriviaApp;