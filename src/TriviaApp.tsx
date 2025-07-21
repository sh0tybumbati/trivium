import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Play, Trophy, Plus, Edit, Trash2, Download, Upload, Monitor, UserCog, Tv } from 'lucide-react';
import useNetworkedGame from './hooks/useNetworkedGame';
import ConnectionStatus from './components/ConnectionStatus';
import QRCodeDisplay from './components/QRCodeDisplay';
import websocketService from './services/websocket';
import apiService from './services/api';
import type { Question, Player, Team, BuzzerResponse, FeudAnswer } from './services/api';

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
    image_url: '',
    feud_answers: []
  });

  // Player/Guest state
  const [playerName, setPlayerName] = useState('');
  const [playerPassword, setPlayerPassword] = useState('');
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [registrationError, setRegistrationError] = useState('');
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerLocked, setAnswerLocked] = useState(false);
  const [answerPending, setAnswerPending] = useState(false);
  const [immediateScoreAwarded, setImmediateScoreAwarded] = useState<number | null>(null);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordChangeData, setPasswordChangeData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordChangeError, setPasswordChangeError] = useState('');
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [passwordResetData, setPasswordResetData] = useState({
    playerId: 0,
    playerName: '',
    newPassword: ''
  });
  const [passwordResetError, setPasswordResetError] = useState('');
  
  // Host password state
  const [showHostPasswordPrompt, setShowHostPasswordPrompt] = useState(false);
  const [hostPassword, setHostPassword] = useState('');
  const [hostPasswordError, setHostPasswordError] = useState('');
  
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  
  // Pending points state for write-in questions (playerId -> points selected)
  const [pendingPointsSelections, setPendingPointsSelections] = useState<{[playerId: number]: number}>({});

  // Team state
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [showTeamCreation, setShowTeamCreation] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('#3B82F6');

  // Buzzer state
  const [buzzerResponses, setBuzzerResponses] = useState<BuzzerResponse[]>([]);
  const [buzzerLocked, setBuzzerLocked] = useState(false);
  const [hasBuzzed, setHasBuzzed] = useState(false);

  // Feud state
  const [feudAnswers, setFeudAnswers] = useState<FeudAnswer[]>([]);
  const [revealedFeudAnswers, setRevealedFeudAnswers] = useState<Set<number>>(new Set());
  const [feudStrikes, setFeudStrikes] = useState(0);
  const [currentFeudTeam, setCurrentFeudTeam] = useState<number | null>(null);

  const {
    questions,
    players,
    gameState,
    gameSettings,
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

  // Get included questions from server game state (after hook initialization)
  const includedQuestions = gameState.includedQuestions || [];

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

  // Clear pending points selections when question changes or game starts/ends
  useEffect(() => {
    setPendingPointsSelections({});
    console.log('🧹 Cleared pending points selections due to game state change');
  }, [gameState.currentSlide, gameState.gameStarted]);

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
      // Include timing data if Timer Eats Points is enabled
      const timeRemaining = gameSettings?.timer_eats_points ? gameState.timer : undefined;
      const timeLimit = gameSettings?.timer_eats_points ? gameState.timeLimit : undefined;
      
      await submitAnswer(currentPlayer.id, currentQuestion.id, selectedAnswer, timeRemaining, timeLimit);
      setAnswerLocked(true);
      setAnswerPending(false);
    } catch (error) {
      console.error('Failed to submit answer:', error);
    }
  };

  // Buzzer press handler
  const handleBuzzerPress = async () => {
    if (!currentPlayer || buzzerLocked || hasBuzzed) return;
    
    const currentQuestion = filteredQuestions[gameState.currentSlide];
    if (!currentQuestion?.id) return;

    try {
      const teamId = selectedTeam && selectedTeam.id !== 0 ? selectedTeam.id : null;
      await apiService.submitBuzzer(currentPlayer.id, currentQuestion.id, teamId);
      setHasBuzzed(true);
    } catch (error) {
      console.error('Failed to submit buzzer response:', error);
      alert('Failed to buzz in. Please try again.');
    }
  };

  // Reset answer selection when question changes
  useEffect(() => {
    if (appMode === 'guest' && currentPlayer && gameState.gameStarted && gameState.firstQuestionStarted) {
      setSelectedAnswer(null);
      setAnswerLocked(false);
      setAnswerPending(false);
      setImmediateScoreAwarded(null);
      
      // Reset buzzer state for new question
      setHasBuzzed(false);
      setBuzzerLocked(false);
      setBuzzerResponses([]);
      
      // Load buzzer responses for host mode
      if (appMode === 'host' && gameSettings?.buzzer_enabled) {
        const currentQuestion = filteredQuestions[gameState.currentSlide];
        if (currentQuestion?.id) {
          apiService.getBuzzerResponses(currentQuestion.id)
            .then(responses => {
              setBuzzerResponses(responses.sort((a, b) => 
                new Date(a.buzz_time).getTime() - new Date(b.buzz_time).getTime()
              ));
            })
            .catch(console.error);
        }
      }
      
      // Check if player has already answered this question and load feud answers for feud questions
      console.log('🎮 GameState debug:', {
        gameState: gameState,
        currentSlide: gameState?.currentSlide,
        filteredQuestionsLength: filteredQuestions?.questions?.length,
        gameStateType: typeof gameState,
        gameStateKeys: gameState ? Object.keys(gameState) : 'null'
      });
      
      const currentQuestion = filteredQuestions[gameState.currentSlide];
      
      // Load feud answers for feud questions
      console.log('🔍 Question change detected:', {
        currentQuestion: currentQuestion,
        questionType: currentQuestion?.type,
        actualType: (currentQuestion?.type || 'multiple_choice'),
        isFeud: (currentQuestion?.type || 'multiple_choice') === 'feud'
      });
      
      if (currentQuestion && (currentQuestion.type || 'multiple_choice') === 'feud') {
        console.log('🎪 This is a feud question! Loading feud data...');
        // Reset feud state for new question
        setFeudAnswers([]);
        setRevealedFeudAnswers(new Set());
        setFeudStrikes(0);
        
        if (currentQuestion.id) {
          console.log('🎪 Loading feud answers for question:', currentQuestion.id, 'Question data:', currentQuestion);
          console.log('🎪 Question feud_answers:', currentQuestion.feud_answers);
          
          // Check if feud answers are in the question JSON first, then API
          if (currentQuestion.feud_answers && currentQuestion.feud_answers.length > 0) {
            console.log('🎪 Using question JSON feud answers:', currentQuestion.feud_answers);
            setFeudAnswers(currentQuestion.feud_answers);
            // For JSON-based feud answers, revealed status is handled differently
            setRevealedFeudAnswers(new Set());
          } else {
            console.log('🎪 Fallback to API feud answers for question:', currentQuestion.id);
            // Fallback to API-based feud answers
            apiService.getFeudAnswers(currentQuestion.id)
              .then(answers => {
                console.log('🎪 API feud answers received:', answers);
                setFeudAnswers(answers);
                // Set revealed answers based on their revealed status
                const revealedIds = new Set(answers.filter(a => a.revealed).map(a => a.id).filter(Boolean));
                setRevealedFeudAnswers(revealedIds);
              })
              .catch(console.error);
          }
        }
      }
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
      setImmediateScoreAwarded(null);
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

  // Listen for WebSocket events
  useEffect(() => {
    const unsubscribe = websocketService.onMessage((message) => {
      // Player-specific events (for guest mode)
      if (appMode === 'guest' && currentPlayer) {
        if (message.type === 'player_score_updated' && message.playerId === currentPlayer.id) {
          console.log('🎯 Player score updated via WebSocket:', message.score);
          setCurrentPlayer(prev => prev ? { ...prev, score: message.score } : null);
        } else if (message.type === 'score_locked' && message.playerId === currentPlayer.id) {
          console.log('🔒 Score locked for player:', message.lockedScore);
          setImmediateScoreAwarded(message.lockedScore);
          // Clear the feedback after 5 seconds
          setTimeout(() => setImmediateScoreAwarded(null), 5000);
        }
      }
      
      // Global buzzer events (for all modes)
      if (message.type === 'buzzer_pressed') {
        console.log('🔔 Buzzer pressed:', message.buzzerResponse);
        setBuzzerResponses(prev => {
          const updated = [...prev, message.buzzerResponse].sort((a, b) => 
            new Date(a.buzz_time).getTime() - new Date(b.buzz_time).getTime()
          );
          return updated;
        });
        
        // Lock buzzer for other players if they haven't buzzed yet (guest mode only)
        if (appMode === 'guest' && currentPlayer && message.buzzerResponse.player_id !== currentPlayer.id) {
          setBuzzerLocked(true);
        }
      } else if (message.type === 'buzzer_cleared' || message.type === 'buzzer_reset') {
        console.log('🔔 Buzzer cleared/reset');
        setBuzzerResponses([]);
        setBuzzerLocked(false);
        setHasBuzzed(false);
      }
      
      // Team events (for all modes that need team updates)
      if (message.type === 'team_created') {
        console.log('👥 Team created:', message.team);
        setTeams(prev => [...prev, message.team]);
      } else if (message.type === 'team_deleted') {
        console.log('👥 Team deleted:', message.teamId);
        setTeams(prev => prev.filter(t => t.id !== message.teamId));
        if (selectedTeam?.id === message.teamId) {
          setSelectedTeam(null);
        }
      } else if (message.type === 'teams_cleared') {
        console.log('👥 All teams cleared');
        setTeams([]);
        setSelectedTeam(null);
      }
      
      // Feud events (for all modes)
      if (message.type === 'feud_answer_revealed') {
        console.log('🎪 Feud answer revealed:', message.answerId);
        setRevealedFeudAnswers(prev => new Set([...prev, message.answerId]));
      } else if (message.type === 'feud_answers_reset') {
        console.log('🎪 Feud answers reset');
        setRevealedFeudAnswers(new Set());
        setFeudStrikes(0);
      } else if (message.type === 'feud_points_awarded') {
        console.log('🎪 Feud points awarded:', message);
        // Update team or player scores
        if (message.teamId) {
          setTeams(prev => prev.map(t => 
            t.id === message.teamId ? { ...t, score: message.newScore } : t
          ));
        }
        // If this is the current player, update their score too
        if (appMode === 'guest' && currentPlayer && message.playerId === currentPlayer.id) {
          setCurrentPlayer(prev => prev ? { ...prev, score: message.newScore } : null);
        }
      } else if (message.type === 'feud_answer_added') {
        console.log('🎪 Feud answer added:', message);
        // Add new answer to feudAnswers array
        if (message.answer) {
          setFeudAnswers(prev => [...prev, message.answer]);
        }
      } else if (message.type === 'feud_answer_deleted') {
        console.log('🎪 Feud answer deleted:', message);
        // Remove answer from feudAnswers array
        if (message.answerId) {
          setFeudAnswers(prev => prev.filter(a => a.id !== message.answerId));
          setRevealedFeudAnswers(prev => {
            const newSet = new Set(prev);
            newSet.delete(message.answerId);
            return newSet;
          });
        }
      } else if (message.type === 'feud_game_initialized') {
        console.log('🎪 Feud game initialized:', message);
        // Game state will update automatically via GAME_STATE_UPDATE
      } else if (message.type === 'feud_teams_switched') {
        console.log('🎪 Feud teams switched:', message);
        // Game state will update automatically via GAME_STATE_UPDATE
      } else if (message.type === 'feud_strike_added') {
        console.log('🎪 Feud strike added:', message);
        // Game state will update automatically via GAME_STATE_UPDATE
      } else if (message.type === 'feud_strike_removed') {
        console.log('🎪 Feud strike removed:', message);
        // Game state will update automatically via GAME_STATE_UPDATE
      } else if (message.type === 'feud_phase_changed') {
        console.log('🎪 Feud phase changed:', message);
        // Game state will update automatically via GAME_STATE_UPDATE
      } else if (message.type === 'feud_state_reset') {
        console.log('🎪 Feud state reset:', message);
        // Game state will update automatically via GAME_STATE_UPDATE
      }
    });

    return unsubscribe;
  }, [appMode, currentPlayer, selectedTeam]);


  // Unified player authentication handler
  const handlePlayerAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistrationError('');
    
    if (!playerName.trim()) {
      setRegistrationError('Please enter your name');
      return;
    }

    if (!playerPassword.trim()) {
      setRegistrationError('Please enter a password');
      return;
    }

    try {
      const player = await apiService.joinOrLoginGame(playerName.trim(), playerPassword.trim());
      setCurrentPlayer(player);
      console.log('Player authenticated:', player);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to join or login';
      setRegistrationError(errorMessage);
      console.error('Authentication error:', error);
    }
  };

  // Password change handler
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeError('');
    
    if (!passwordChangeData.oldPassword.trim()) {
      setPasswordChangeError('Please enter your current password');
      return;
    }
    
    if (!passwordChangeData.newPassword.trim()) {
      setPasswordChangeError('Please enter a new password');
      return;
    }
    
    if (passwordChangeData.newPassword !== passwordChangeData.confirmPassword) {
      setPasswordChangeError('New passwords do not match');
      return;
    }
    
    if (!currentPlayer) {
      setPasswordChangeError('Player not found');
      return;
    }
    
    try {
      await apiService.changePlayerPassword(
        currentPlayer.id,
        passwordChangeData.oldPassword.trim(),
        passwordChangeData.newPassword.trim()
      );
      
      // Reset form and close modal
      setPasswordChangeData({
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setShowPasswordChange(false);
      
      // Show success message briefly
      setPasswordChangeError('Password changed successfully!');
      setTimeout(() => setPasswordChangeError(''), 3000);
      
      console.log('Password changed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to change password';
      setPasswordChangeError(errorMessage);
      console.error('Password change error:', error);
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

  // Password reset handler (host only)
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordResetError('');
    
    if (!passwordResetData.newPassword.trim()) {
      setPasswordResetError('Please enter a new password');
      return;
    }
    
    try {
      await apiService.resetPlayerPassword(
        passwordResetData.playerId,
        passwordResetData.newPassword.trim()
      );
      
      // Reset form and close modal
      setPasswordResetData({
        playerId: 0,
        playerName: '',
        newPassword: ''
      });
      setShowPasswordReset(false);
      
      // Show success message briefly
      setPasswordResetError('Password reset successfully!');
      setTimeout(() => setPasswordResetError(''), 3000);
      
      console.log('Password reset successfully for player:', passwordResetData.playerName);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to reset password';
      setPasswordResetError(errorMessage);
      console.error('Password reset error:', error);
    }
  };

  // Open password reset modal
  const openPasswordReset = (playerId: number, playerName: string) => {
    setPasswordResetData({
      playerId,
      playerName,
      newPassword: ''
    });
    setPasswordResetError('');
    setShowPasswordReset(true);
  };

  // Handle host password validation
  const handleHostPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHostPasswordError('');
    
    try {
      const isValid = await apiService.validateHostPassword(hostPassword);
      
      if (isValid) {
        setAppMode('host');
        setShowHostPasswordPrompt(false);
        setHostPassword('');
      } else {
        setHostPasswordError('Invalid host password');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to validate password';
      setHostPasswordError(errorMessage);
      console.error('Host password validation error:', error);
    }
  };

  // Check if password is required and show appropriate prompt
  const checkPasswordAndEnterHost = async () => {
    try {
      // First check if password is required by getting game settings
      const settings = await apiService.getGameSettings();
      
      if (!settings?.host_password) {
        // No password required, enter host mode directly
        setAppMode('host');
      } else {
        // Password required, show prompt
        openHostPasswordPrompt();
      }
    } catch (error) {
      console.error('Failed to check password requirement:', error);
      // Fallback to showing password prompt
      openHostPasswordPrompt();
    }
  };

  // Open host password prompt
  const openHostPasswordPrompt = () => {
    setHostPassword('');
    setHostPasswordError('');
    setShowHostPasswordPrompt(true);
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
    // Only add if not already in playlist
    if (!includedQuestions.includes(questionId)) {
      websocketService.sendGameAction('ADD_TO_PLAYLIST', { questionId });
    }
  };

  const removeFromPlaylist = (questionId: number) => {
    websocketService.sendGameAction('REMOVE_FROM_PLAYLIST', { questionId });
  };

  const clearPlaylist = () => {
    websocketService.sendGameAction('UPDATE_PLAYLIST', { questionIds: [] });
  };

  const getPlaylistQuestions = () => {
    // Maintain playlist order
    const playlistQuestions = includedQuestions
      .map(id => questions.find(q => q.id === id))
      .filter(Boolean) as Question[];
    
    console.log('📋 TriviaApp getPlaylistQuestions:', {
      includedQuestions,
      playlistQuestions: playlistQuestions.map(q => ({ id: q.id, question: q.question.substring(0, 50) }))
    });
    
    return playlistQuestions;
  };

  const getFilteredLibraryQuestions = () => {
    let filtered = questions;
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(q => q.category === categoryFilter);
    }
    if (typeFilter !== 'all') {
      filtered = filtered.filter(q => (q.type || 'multiple_choice') === typeFilter);
    }
    return filtered;
  };

  // Use the hook's getFilteredQuestions which now handles playlists
  const rawFilteredQuestions = getFilteredQuestions();
  const filteredQuestions = Array.isArray(rawFilteredQuestions) ? rawFilteredQuestions : [];
  
  // Debug filtered questions for different screens
  useEffect(() => {
    console.log('🎯 TriviaApp filteredQuestions changed:', {
      appMode,
      count: filteredQuestions.length,
      questions: filteredQuestions.map(q => ({ id: q.id, question: q.question.substring(0, 50) })),
      includedQuestionIds: includedQuestions,
      currentSlide: gameState.currentSlide,
      currentQuestion: filteredQuestions[gameState.currentSlide]?.question?.substring(0, 50)
    });
  }, [filteredQuestions, appMode, includedQuestions, gameState.currentSlide]);

  // Load feud answers for host mode
  useEffect(() => {
    if (appMode === 'host') {
      const currentQuestion = filteredQuestions[gameState.currentSlide];
      if (currentQuestion && (currentQuestion.type || 'multiple_choice') === 'feud') {
        console.log('🎪 Host mode: Loading feud data for question:', currentQuestion.id);
        // Reset feud state for new question
        setFeudAnswers([]);
        setRevealedFeudAnswers(new Set());
        setFeudStrikes(0);
        
        if (currentQuestion.id) {
          // Check if feud answers are in the question JSON first
          if (currentQuestion.feud_answers && currentQuestion.feud_answers.length > 0) {
            console.log('🎪 Host mode: Found JSON feud answers, checking if they need database sync:', currentQuestion.feud_answers);
            
            // Check if any JSON answers are missing IDs (need to be synced to database)
            const needsSync = currentQuestion.feud_answers.some(answer => !answer.id);
            
            if (needsSync) {
              console.log('🎪 Host mode: JSON feud answers missing IDs, syncing to database...');
              
              // Sync JSON answers to database to get IDs
              const syncPromises = currentQuestion.feud_answers.map((answer, index) => {
                if (!answer.id) {
                  return apiService.addFeudAnswer(
                    currentQuestion.id,
                    answer.answer_text,
                    answer.points || 1,
                    answer.display_order || (index + 1)
                  );
                }
                return Promise.resolve(answer);
              });
              
              Promise.all(syncPromises)
                .then(syncedAnswers => {
                  console.log('🎪 Host mode: Successfully synced feud answers to database:', syncedAnswers);
                  setFeudAnswers(syncedAnswers);
                  setRevealedFeudAnswers(new Set());
                })
                .catch(error => {
                  console.error('🎪 Host mode: Failed to sync feud answers to database:', error);
                  // Fallback to JSON answers even without IDs
                  setFeudAnswers(currentQuestion.feud_answers);
                  setRevealedFeudAnswers(new Set());
                });
            } else {
              console.log('🎪 Host mode: Using question JSON feud answers (already have IDs):', currentQuestion.feud_answers);
              setFeudAnswers(currentQuestion.feud_answers);
              setRevealedFeudAnswers(new Set());
            }
          } else {
            console.log('🎪 Host mode: No JSON feud answers, loading from API for question:', currentQuestion.id);
            // Fallback to API-based feud answers
            apiService.getFeudAnswers(currentQuestion.id)
              .then(answers => {
                console.log('🎪 Host mode: API feud answers received:', answers);
                setFeudAnswers(answers);
                // Set revealed answers based on their revealed status
                const revealedIds = new Set(answers.filter(a => a.revealed).map(a => a.id).filter(Boolean));
                setRevealedFeudAnswers(revealedIds);
              })
              .catch(console.error);
          }
        }
      }
    }
  }, [appMode, gameState.currentSlide, filteredQuestions]);

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
                onClick={checkPasswordAndEnterHost}
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
          // Update pending points selection (visual feedback)
          setPendingPointsSelections(prev => ({
            ...prev,
            [playerId]: points
          }));
          
          // Use the hook's awardPoints function (this sets pending points in backend)
          await awardPoints(playerId, currentQuestion.id, points, player.name, playerAnswer.selected_answer);
          console.log(`✅ Selected ${points} points for ${player.name} for: "${playerAnswer.selected_answer}"`);
        } else {
          console.error('❌ Could not find player answer for player ID:', playerId);
        }
      } else {
        if (!player) console.error('❌ Player not found with ID:', playerId);
        if (!currentQuestion?.id) console.error('❌ No current question ID');
      }
    } catch (error) {
      console.error('Failed to select points:', error);
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
         newQuestion.type === 'feud' ||
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
          image_url: '',
          feud_answers: []
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
          image_url: question.image_url,
          feud_answers: question.feud_answers
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

  // Team management functions
  const refreshTeams = async () => {
    try {
      const teamsData = await apiService.getTeams();
      setTeams(teamsData);
    } catch (error) {
      console.error('Failed to refresh teams:', error);
    }
  };

  const createTeam = async () => {
    if (!newTeamName.trim()) return;
    
    try {
      const team = await apiService.createTeam(newTeamName.trim(), newTeamColor);
      setTeams(prev => [...prev, team]);
      setNewTeamName('');
      setNewTeamColor('#3B82F6');
      setShowTeamCreation(false);
    } catch (error) {
      console.error('Failed to create team:', error);
      alert('Failed to create team. Name might already exist.');
    }
  };

  const joinTeam = async (teamId: number) => {
    if (!currentPlayer) return;
    
    try {
      await apiService.joinTeam(currentPlayer.id, teamId);
      setSelectedTeam(teams.find(t => t.id === teamId) || null);
      refreshTeams();
      refreshPlayers();
    } catch (error) {
      console.error('Failed to join team:', error);
      alert('Failed to join team. It might be full.');
    }
  };

  const leaveTeam = async () => {
    if (!currentPlayer) return;
    
    try {
      await apiService.leaveTeam(currentPlayer.id);
      setSelectedTeam(null);
      refreshTeams();
      refreshPlayers();
    } catch (error) {
      console.error('Failed to leave team:', error);
    }
  };

  const deleteTeam = async (teamId: number) => {
    try {
      await apiService.deleteTeam(teamId);
      setTeams(prev => prev.filter(t => t.id !== teamId));
      if (selectedTeam?.id === teamId) {
        setSelectedTeam(null);
      }
      refreshPlayers();
    } catch (error) {
      console.error('Failed to delete team:', error);
    }
  };

  const clearAllTeams = async () => {
    try {
      await apiService.clearAllTeams();
      setTeams([]);
      setSelectedTeam(null);
      refreshPlayers();
    } catch (error) {
      console.error('Failed to clear teams:', error);
    }
  };

  // Load teams when component mounts or when team mode is enabled
  useEffect(() => {
    if (gameSettings?.team_mode) {
      refreshTeams();
    }
  }, [gameSettings?.team_mode]);

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
          
          {/* Connection Status and Player Count */}
          <div className="absolute top-4 right-4 space-y-2">
            <ConnectionStatus isConnected={isConnected} error={error} />
            {gameSettings?.show_player_count && !!gameState.playerMode && (
              <div className="bg-black/60 backdrop-blur-sm border border-emerald-400/50 rounded-lg px-3 py-2 text-center">
                <div className="text-sm text-emerald-300">Players</div>
                <div className="text-lg font-bold text-emerald-100">{players.length}</div>
              </div>
            )}
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
              {!!gameState.playerMode && !(gameSettings?.hide_qr_during_game && gameState.gameStarted) && (
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
          
          {/* Connection Status and Player Count */}
          <div className="absolute top-4 right-4 space-y-2">
            <ConnectionStatus isConnected={isConnected} error={error} />
            {gameSettings?.show_player_count && !!gameState.playerMode && (
              <div className="bg-black/60 backdrop-blur-sm border border-emerald-400/50 rounded-lg px-3 py-2 text-center">
                <div className="text-sm text-emerald-300">Players</div>
                <div className="text-lg font-bold text-emerald-100">{players.length}</div>
              </div>
            )}
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
        
        {/* Connection Status and Player Count */}
        <div className="absolute top-4 right-4 space-y-2">
          <ConnectionStatus isConnected={isConnected} error={error} />
          {gameSettings?.show_player_count && !!gameState.playerMode && (
            <div className="bg-black/60 backdrop-blur-sm border border-emerald-400/50 rounded-lg px-3 py-2 text-center">
              <div className="text-sm text-emerald-300">Players</div>
              <div className="text-lg font-bold text-emerald-100">{players.length}</div>
            </div>
          )}
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
            {!!gameState.playerMode && !(gameSettings?.hide_qr_during_game && gameState.gameStarted) && (
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
              ) : (currentQuestion.type || 'multiple_choice') === 'write_in' ? (
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
              ) : (
                /* Feud Question Display */
                <div className="mb-12">
                  <div className="bg-purple-900/30 border-2 border-purple-400/30 rounded-2xl p-8">
                    <div className="text-center mb-8">
                      <div className="text-3xl font-bold text-purple-100 mb-4">
                        🎪 Family Feud Style
                      </div>
                      <div className="text-xl text-purple-200">
                        Teams take turns guessing the top answers
                      </div>
                    </div>
                    
                    {/* Feud Answers Grid */}
                    <div className="grid grid-cols-2 gap-4 max-w-4xl mx-auto">
                      {(feudAnswers || []).map((feudAnswer, index) => (
                        <div
                          key={feudAnswer.id || index}
                          className={`
                            border-2 rounded-xl p-4 text-center transition-all duration-500
                            ${revealedFeudAnswers.has(feudAnswer.id || index) ? 
                              'bg-emerald-600/40 border-emerald-400 text-emerald-100 shadow-lg' : 
                              'bg-black/40 border-purple-400/30 text-gray-400'
                            }
                          `}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`
                              text-lg font-bold
                              ${revealedFeudAnswers.has(feudAnswer.id || index) ? 'text-emerald-100' : 'text-transparent'}
                            `}>
                              {feudAnswer.answer_text}
                            </span>
                            <span className={`
                              bg-emerald-600 text-white px-3 py-1 rounded-full text-sm font-bold
                              ${revealedFeudAnswers.has(feudAnswer.id || index) ? 'opacity-100' : 'opacity-0'}
                            `}>
                              {feudAnswer.points}
                            </span>
                          </div>
                          {!revealedFeudAnswers.has(feudAnswer.id || index) && (
                            <div className="text-2xl font-bold text-purple-300">
                              {index + 1}
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {/* Fill empty slots */}
                      {Array.from({ length: Math.max(0, 8 - (feudAnswers || []).length) }).map((_, index) => (
                        <div
                          key={`empty-${index}`}
                          className="bg-black/20 border-2 border-gray-600/30 rounded-xl p-4 text-center"
                        >
                          <div className="text-xl font-bold text-gray-500">
                            {(feudAnswers || []).length + index + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Feud Team Score Display */}
                    {gameSettings?.team_mode && (
                      <div className="mt-8 text-center">
                        <div className="text-lg text-purple-200 mb-4">Team Scores</div>
                        <div className="flex justify-center space-x-8">
                          {teams.map(team => (
                            <div 
                              key={team.id}
                              className={`
                                px-6 py-3 rounded-xl border-2 font-bold text-lg
                                ${currentFeudTeam === team.id ? 
                                  'border-yellow-400 bg-yellow-900/30 text-yellow-100' : 
                                  'border-purple-400/50 bg-purple-900/20 text-purple-100'
                                }
                              `}
                              style={{ borderColor: currentFeudTeam === team.id ? '#FBB040' : team.color }}
                            >
                              <div className="flex items-center space-x-2">
                                <div 
                                  className="w-4 h-4 rounded-full"
                                  style={{ backgroundColor: team.color }}
                                ></div>
                                <span>{team.name}</span>
                                <span className="text-amber-400">{team.score}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Feud Strikes Display */}
                    <div className="mt-6 text-center">
                      <div className="text-lg text-red-300 mb-2">Strikes</div>
                      <div className="flex justify-center space-x-2">
                        {Array.from({ length: 3 }).map((_, index) => (
                          <div
                            key={index}
                            className={`
                              w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold
                              ${index < (gameState?.feudState?.strikes || 0) ? 
                                'bg-red-600 border-red-400 text-white' : 
                                'bg-black/30 border-red-400/30 text-red-400/50'
                              }
                            `}
                          >
                            ✗
                          </div>
                        ))}
                      </div>
                    </div>
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
                const shouldShow = gameState.showAnswer && 
                  (currentQuestion.type || 'multiple_choice') === 'write_in' && 
                  currentQuestion.id && 
                  awardedAnswers[currentQuestion.id] && 
                  Array.isArray(awardedAnswers[currentQuestion.id]) && 
                  awardedAnswers[currentQuestion.id].length > 0;
                console.log('🎭 Big Screen awarded answers display check:', {
                  showAnswer: gameState.showAnswer,
                  questionType: currentQuestion.type || 'multiple_choice',
                  isWriteIn: (currentQuestion.type || 'multiple_choice') === 'write_in',
                  currentQuestionId: currentQuestion.id,
                  hasAwardedAnswers: !!awardedAnswers[currentQuestion.id],
                  isArray: Array.isArray(awardedAnswers[currentQuestion.id]),
                  awardedCount: Array.isArray(awardedAnswers[currentQuestion.id]) ? awardedAnswers[currentQuestion.id].length : 'not array',
                  awardedAnswersKeys: Object.keys(awardedAnswers),
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
      // Check if team mode is enabled and player needs to select a team
      if (gameSettings?.team_mode && !selectedTeam) {
        return (
          <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-purple-900 flex items-center justify-center p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-100/5 via-transparent to-emerald-900/10"></div>
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-purple-400 via-emerald-300 to-purple-400"></div>
            
            {/* Connection Status */}
            <div className="absolute top-4 right-4">
              <ConnectionStatus isConnected={isConnected} error={error} />
            </div>

            <div className="text-center text-white max-w-4xl relative z-10">
              {/* Team Selection Header */}
              <div className="mb-12">
                <div className="w-32 h-32 mx-auto mb-8 bg-gradient-to-br from-purple-600 to-purple-800 rounded-full flex items-center justify-center shadow-2xl">
                  <div className="text-6xl">👥</div>
                </div>
                <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-purple-300 via-emerald-300 to-purple-400 bg-clip-text text-transparent drop-shadow-2xl">
                  Choose Your Team
                </h1>
                <p className="text-xl text-purple-100 mb-8 font-light">
                  Welcome, {currentPlayer.name}! Join a team or create a new one.
                </p>
              </div>

              {/* Team Creation */}
              <div className="mb-8">
                {!showTeamCreation ? (
                  <button
                    onClick={() => setShowTeamCreation(true)}
                    className="bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-500 hover:to-purple-700 text-white text-lg font-bold py-3 px-8 rounded-full transition-all duration-300 shadow-lg border-2 border-purple-400"
                  >
                    + Create New Team
                  </button>
                ) : (
                  <div className="bg-black/40 backdrop-blur-lg rounded-3xl p-6 border-2 border-purple-400/30 shadow-2xl mb-6">
                    <h3 className="text-2xl font-bold text-purple-100 mb-4">Create New Team</h3>
                    <div className="flex flex-col space-y-4">
                      <input
                        type="text"
                        placeholder="Team name"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        className="bg-black/40 border-2 border-purple-400/50 rounded-xl px-4 py-3 text-white placeholder-purple-200/50 text-lg focus:outline-none focus:border-purple-400 transition-colors"
                        maxLength={30}
                      />
                      <div className="flex items-center space-x-3">
                        <label className="text-purple-200">Color:</label>
                        <input
                          type="color"
                          value={newTeamColor}
                          onChange={(e) => setNewTeamColor(e.target.value)}
                          className="w-12 h-10 rounded-lg border-2 border-purple-400/50 bg-black/40"
                        />
                      </div>
                      <div className="flex space-x-3">
                        <button
                          onClick={createTeam}
                          disabled={!newTeamName.trim()}
                          className="flex-1 bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-500 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-800 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-full transition-all duration-300"
                        >
                          Create Team
                        </button>
                        <button
                          onClick={() => {
                            setShowTeamCreation(false);
                            setNewTeamName('');
                            setNewTeamColor('#3B82F6');
                          }}
                          className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-full transition-all duration-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Available Teams */}
              <div className="bg-black/40 backdrop-blur-lg rounded-3xl p-6 border-2 border-purple-400/30 shadow-2xl">
                <h3 className="text-2xl font-bold text-purple-100 mb-6">Available Teams</h3>
                {teams.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-purple-200 text-lg">No teams available yet.</p>
                    <p className="text-purple-300 text-sm mt-2">Create the first team!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {teams.map((team) => (
                      <div
                        key={team.id}
                        className="bg-black/30 rounded-xl p-4 border-2 transition-all duration-300 hover:scale-105 cursor-pointer"
                        style={{ borderColor: `${team.color}50` }}
                        onClick={() => joinTeam(team.id)}
                      >
                        <div className="flex items-center space-x-3 mb-2">
                          <div
                            className="w-6 h-6 rounded-full"
                            style={{ backgroundColor: team.color }}
                          ></div>
                          <h4 className="text-xl font-bold text-white">{team.name}</h4>
                        </div>
                        <div className="text-sm text-gray-300">
                          <p>{team.member_count} / {gameSettings?.team_size_limit || 4} members</p>
                          <p>Team Score: {team.score} points</p>
                          {team.member_names && (
                            <p className="mt-1 text-xs text-gray-400">
                              Members: {team.member_names}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Skip Team Selection (if allowed) */}
              <div className="mt-8">
                <button
                  onClick={() => setSelectedTeam({ id: 0, name: 'Solo Player', color: '#6B7280', score: 0, member_count: 1, created_at: '' })}
                  className="bg-gradient-to-r from-gray-600 to-gray-800 hover:from-gray-500 hover:to-gray-700 text-white text-lg font-bold py-3 px-8 rounded-full transition-all duration-300 shadow-lg border-2 border-gray-400"
                >
                  Play Solo (No Team)
                </button>
              </div>
            </div>
          </div>
        );
      }

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
            <div className="mb-8 relative">
              <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-emerald-300 via-amber-300 to-emerald-400 bg-clip-text text-transparent drop-shadow-2xl">
                {currentPlayer.name}
              </h1>
              
              {/* Team Info */}
              {gameSettings?.team_mode && selectedTeam && selectedTeam.id !== 0 && (
                <div className="mb-4">
                  <div className="bg-black/40 backdrop-blur-lg rounded-2xl px-6 py-3 border-2 border-purple-400/50 inline-flex items-center space-x-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: selectedTeam.color }}
                    ></div>
                    <span className="text-purple-300">Team: </span>
                    <span className="text-purple-100 font-bold">{selectedTeam.name}</span>
                    <button
                      onClick={leaveTeam}
                      className="text-red-400 hover:text-red-300 text-sm ml-2"
                      title="Leave team"
                    >
                      (Leave)
                    </button>
                  </div>
                </div>
              )}
              
              <div className="flex justify-center items-center gap-8 text-xl">
                <div className="bg-black/40 backdrop-blur-lg rounded-2xl px-6 py-3 border border-emerald-400/30">
                  <span className="text-emerald-300">Score: </span>
                  <span className="text-amber-400 font-bold">{currentPlayer.score}</span>
                  {immediateScoreAwarded && (
                    <span className="text-green-400 font-bold ml-2 animate-pulse">
                      🔒 {immediateScoreAwarded} locked
                    </span>
                  )}
                </div>
                <div className="bg-black/40 backdrop-blur-lg rounded-2xl px-6 py-3 border border-emerald-400/30">
                  <span className={`${gameState?.gameStarted ? 'text-green-400' : 'text-orange-400'}`}>
                    {gameState?.gameStarted ? 'Game Active' : 'Waiting for Game'}
                  </span>
                </div>
              </div>
              
              {/* Settings Button */}
              <button
                onClick={() => setShowPasswordChange(true)}
                className="absolute top-0 right-0 p-2 text-gray-400 hover:text-emerald-400 transition-colors rounded-lg hover:bg-black/20"
                title="Change Password"
              >
                <UserCog className="w-5 h-5" />
              </button>
            </div>

            {/* Game Content */}
            {gameState?.gameStarted && gameState?.firstQuestionStarted && currentQuestion ? (
              <div className="space-y-8">
                {/* Buzzer Interface (for buzzer-enabled questions) */}
                {gameSettings?.buzzer_enabled && !gameState.showAnswer && (
                  <div className="bg-black/40 backdrop-blur-lg rounded-3xl p-8 border-2 border-yellow-400/30 shadow-2xl">
                    <div className="text-center">
                      <h3 className="text-2xl font-bold text-yellow-100 mb-4">
                        🔔 Buzzer Challenge
                      </h3>
                      {!hasBuzzed ? (
                        <div className="space-y-4">
                          <p className="text-yellow-200 text-lg">
                            First to buzz gets to answer!
                          </p>
                          <button
                            onClick={handleBuzzerPress}
                            disabled={buzzerLocked}
                            className={`
                              text-4xl font-bold py-6 px-12 rounded-full transition-all duration-300 shadow-lg border-4
                              ${buzzerLocked ? 
                                'bg-gray-600/50 border-gray-400 text-gray-300 cursor-not-allowed' :
                                'bg-gradient-to-r from-yellow-500 to-yellow-700 hover:from-yellow-400 hover:to-yellow-600 border-yellow-400 text-black hover:scale-105'
                              }
                            `}
                          >
                            {buzzerLocked ? '🔒 LOCKED' : '🔔 BUZZ!'}
                          </button>
                          {buzzerLocked && (
                            <p className="text-yellow-300 text-sm">
                              Someone else buzzed first! Wait for next question.
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <p className="text-green-400 text-xl font-bold">
                            ✅ You buzzed in! You can answer first.
                          </p>
                          <div className="bg-green-900/30 border border-green-400/50 rounded-lg p-4">
                            <p className="text-green-200 text-sm">
                              {(currentQuestion.type || 'multiple_choice') === 'feud' ? 
                                'Look at the big screen for the question, then type your answer below.' :
                                (currentQuestion.type || 'multiple_choice') === 'write_in' ?
                                'Look at the big screen for the question, then type your answer below.' :
                                'Look at the big screen for the question, then select your answer below.'
                              }
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {/* Buzzer Leaderboard */}
                      {buzzerResponses.length > 0 && (
                        <div className="mt-6 bg-black/30 rounded-2xl p-4 border border-yellow-400/30">
                          <h4 className="text-lg font-bold text-yellow-200 mb-3">Buzzer Order:</h4>
                          <div className="space-y-2">
                            {buzzerResponses.map((response, index) => (
                              <div key={response.id} className="flex items-center justify-between bg-black/30 rounded-lg px-3 py-2">
                                <div className="flex items-center space-x-3">
                                  <span className={`
                                    w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold
                                    ${index === 0 ? 'bg-yellow-400 text-black' : 
                                      index === 1 ? 'bg-gray-400 text-black' :
                                      index === 2 ? 'bg-amber-600 text-white' :
                                      'bg-gray-600 text-white'}
                                  `}>
                                    {index + 1}
                                  </span>
                                  <span className="text-white font-medium">
                                    {response.player_name || `Player ${response.player_id}`}
                                  </span>
                                  {response.team_name && (
                                    <span 
                                      className="text-xs px-2 py-1 rounded-full font-medium"
                                      style={{ 
                                        backgroundColor: response.team_color || '#6B7280',
                                        color: 'white'
                                      }}
                                    >
                                      {response.team_name}
                                    </span>
                                  )}
                                </div>
                                <span className="text-gray-400 text-xs">
                                  {(() => {
                                    if (!response.buzz_time) return 'No time';
                                    try {
                                      const date = new Date(response.buzz_time);
                                      if (isNaN(date.getTime())) return 'Invalid time';
                                      return date.toLocaleTimeString();
                                    } catch (e) {
                                      return 'Invalid time';
                                    }
                                  })()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

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
                            disabled={
                              answerLocked || 
                              gameState.showAnswer || 
                              (gameSettings?.buzzer_enabled && buzzerResponses.length > 0 && Number(buzzerResponses[0]?.player_id) !== Number(currentPlayer?.id))
                            }
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
                  ) : (currentQuestion.type || 'multiple_choice') === 'write_in' ? (
                    /* Write-in Question Interface */
                    <div className="space-y-4">
                      <div className="bg-black/20 border border-amber-400/30 rounded-2xl p-6">
                        <label className="block text-amber-200 text-lg font-medium mb-4">
                          Type your answer:
                        </label>
                        <textarea
                          value={selectedAnswer || ''}
                          onChange={(e) => setSelectedAnswer(e.target.value)}
                          disabled={
                            answerLocked || 
                            gameState.showAnswer ||
                            (gameSettings?.buzzer_enabled && buzzerResponses.length > 0 && Number(buzzerResponses[0]?.player_id) !== Number(currentPlayer?.id))
                          }
                          placeholder="Enter your answer here..."
                          className="w-full bg-black/30 border border-amber-400/30 rounded-lg px-4 py-3 text-white text-lg resize-none placeholder-gray-400 focus:border-amber-400 focus:outline-none"
                          rows={3}
                        />
                        {/* Submit button for write-in questions */}
                        {!answerLocked && !gameState.showAnswer && selectedAnswer && selectedAnswer.trim() && 
                         !(gameSettings?.buzzer_enabled && buzzerResponses.length > 0 && Number(buzzerResponses[0]?.player_id) !== Number(currentPlayer?.id)) && (
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
                  ) : (
                    /* Feud Question Interface */
                    <div className="space-y-4">
                      <div className="bg-purple-900/20 border border-purple-400/30 rounded-2xl p-6">
                        <div className="text-center mb-6">
                          <h3 className="text-2xl font-bold text-purple-100 mb-2">🎪 Family Feud</h3>
                          <p className="text-purple-200">
                            {gameSettings?.team_mode ? 
                              "Watch the big screen! Your team captain will give answers." :
                              "Think of answers that might be on the board!"
                            }
                          </p>
                        </div>
                        
                        {/* Feud Answers Grid for Players */}
                        <div className="grid grid-cols-2 gap-3">
                          {(feudAnswers || []).map((feudAnswer, index) => (
                            <div
                              key={feudAnswer.id || index}
                              className={`
                                border-2 rounded-lg p-3 text-center transition-all duration-300
                                ${revealedFeudAnswers.has(feudAnswer.id || index) ? 
                                  'bg-emerald-600/30 border-emerald-400 text-emerald-100' : 
                                  'bg-black/30 border-purple-400/20 text-gray-500'
                                }
                              `}
                            >
                              {revealedFeudAnswers.has(feudAnswer.id || index) ? (
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-emerald-100">
                                    {feudAnswer.answer_text}
                                  </span>
                                  <span className="bg-emerald-600 text-white px-2 py-1 rounded-full text-xs font-bold">
                                    {feudAnswer.points}
                                  </span>
                                </div>
                              ) : (
                                <div className="text-lg font-bold text-purple-300">
                                  {index + 1}
                                </div>
                              )}
                            </div>
                          ))}
                          
                          {/* Fill empty slots */}
                          {Array.from({ length: Math.max(0, 8 - (feudAnswers || []).length) }).map((_, index) => (
                            <div
                              key={`empty-${index}`}
                              className="bg-black/20 border-2 border-gray-600/20 rounded-lg p-3 text-center"
                            >
                              <div className="text-sm font-bold text-gray-500">
                                {(feudAnswers || []).length + index + 1}
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Team Info for Feud */}
                        {gameSettings?.team_mode && selectedTeam && selectedTeam.id !== 0 && (
                          <div className="mt-6 text-center">
                            <div 
                              className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg border-2"
                              style={{ 
                                borderColor: selectedTeam.color,
                                backgroundColor: `${selectedTeam.color}20`
                              }}
                            >
                              <div 
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: selectedTeam.color }}
                              ></div>
                              <span className="text-white font-medium">Team: {selectedTeam.name}</span>
                              <span className="text-amber-400 font-bold">{selectedTeam.score} pts</span>
                            </div>
                          </div>
                        )}
                        
                        {/* Player Answer Input for Feud */}
                        {(() => {
                          // For feud questions, only show input if:
                          // 1. Player is on the active team
                          // 2. It's their turn in the buzzer order
                          // 3. Game hasn't been answered yet
                          
                          const feudState = gameState?.feudState;
                          const isActiveTeamMember = selectedTeam && feudState?.activeTeam === selectedTeam.id;
                          const isPlayerTurn = feudState?.buzzerOrder && feudState.buzzerOrder.length > 0 && 
                                             feudState.buzzerOrder[feudState.currentBuzzerIndex % feudState.buzzerOrder.length] === currentPlayer?.id;
                          
                          // If no buzzer order yet, allow anyone on active team to answer (for initial face-off)
                          const canAnswer = isActiveTeamMember && (
                            feudState?.gamePhase === 'face-off' || 
                            (feudState?.buzzerOrder.length === 0) ||
                            isPlayerTurn
                          );
                          
                          
                          return !answerLocked && !gameState.showAnswer && canAnswer;
                        })() && (
                          <div className="mt-6 space-y-3">
                            <div className="text-center">
                              <label className="block text-sm text-purple-300 mb-2">Your Answer:</label>
                              <input
                                type="text"
                                value={selectedAnswer || ''}
                                onChange={(e) => {
                                  setSelectedAnswer(e.target.value);
                                  setAnswerPending(e.target.value.trim().length > 0);
                                }}
                                placeholder="Type what you think is on the board..."
                                className="w-full bg-black/30 border border-purple-400/30 rounded-lg px-4 py-3 text-purple-100 placeholder-purple-200/50 text-center font-medium focus:border-purple-400 focus:outline-none"
                                maxLength={100}
                              />
                              
                              {/* Submit button for feud questions */}
                              {!answerLocked && !gameState.showAnswer && selectedAnswer && selectedAnswer.trim() && (
                                <div className="mt-4 text-center">
                                  <button
                                    onClick={() => handleAnswerSelection(selectedAnswer)}
                                    className="bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-500 hover:to-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 shadow-lg border border-purple-400"
                                  >
                                    Submit Answer
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Strikes Display */}
                        <div className="mt-4 text-center">
                          <div className="text-sm text-red-300 mb-2">Strikes</div>
                          <div className="flex justify-center space-x-1">
                            {Array.from({ length: 3 }).map((_, index) => (
                              <div
                                key={index}
                                className={`
                                  w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold
                                  ${index < (gameState?.feudState?.strikes || 0) ? 
                                    'bg-red-600 border-red-400 text-white' : 
                                    'bg-black/30 border-red-400/30 text-red-400/50'
                                  }
                                `}
                              >
                                ✗
                              </div>
                            ))}
                          </div>
                        </div>
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
                    const shouldShow = gameState.showAnswer && 
                      (currentQuestion.type || 'multiple_choice') === 'write_in' && 
                      currentQuestion.id && 
                      awardedAnswers[currentQuestion.id] && 
                      Array.isArray(awardedAnswers[currentQuestion.id]) && 
                      awardedAnswers[currentQuestion.id].length > 0;
                    console.log('👤 Player Screen awarded answers display check:', {
                      showAnswer: gameState.showAnswer,
                      questionType: currentQuestion.type || 'multiple_choice',
                      isWriteIn: (currentQuestion.type || 'multiple_choice') === 'write_in',
                      currentQuestionId: currentQuestion.id,
                      hasAwardedAnswers: !!awardedAnswers[currentQuestion.id],
                      isArray: Array.isArray(awardedAnswers[currentQuestion.id]),
                      awardedCount: Array.isArray(awardedAnswers[currentQuestion.id]) ? awardedAnswers[currentQuestion.id].length : 'not array',
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
                    {/* Timer-based scoring preview */}
                    {gameSettings?.timer_eats_points && (
                      <div className="mt-2">
                        {answerLocked ? (
                          <div className="text-green-400 font-bold animate-pulse">
                            ⚡ Score Locked In! ⚡
                          </div>
                        ) : (
                          <>
                            <div className="text-sm text-amber-300">Points if answered now:</div>
                            <div className="text-lg font-bold text-amber-100">
                              {(() => {
                                const multiplier = gameSettings?.score_multiplier || 10;
                                const timeRatio = gameState.timer / gameState.timeLimit;
                                const minRatio = (gameSettings?.min_points_percentage || 25) / 100;
                                const finalRatio = Math.max(minRatio, timeRatio);
                                return Math.round(multiplier * finalRatio);
                              })()} points
                            </div>
                          </>
                        )}
                      </div>
                    )}
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
          
          {/* Password Change Modal */}
          {showPasswordChange && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-gray-900 rounded-3xl p-8 max-w-md w-full border-2 border-emerald-400/30 shadow-2xl">
                <h2 className="text-2xl font-bold text-white mb-6 text-center">Change Password</h2>
                
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
                    <input
                      type="password"
                      placeholder="Current password"
                      value={passwordChangeData.oldPassword}
                      onChange={(e) => setPasswordChangeData({...passwordChangeData, oldPassword: e.target.value})}
                      className="w-full bg-black/40 border-2 border-emerald-400/50 rounded-xl px-4 py-3 text-white placeholder-emerald-200/50 text-lg focus:outline-none focus:border-emerald-400 transition-colors"
                      required
                    />
                  </div>
                  
                  <div>
                    <input
                      type="password"
                      placeholder="New password"
                      value={passwordChangeData.newPassword}
                      onChange={(e) => setPasswordChangeData({...passwordChangeData, newPassword: e.target.value})}
                      className="w-full bg-black/40 border-2 border-emerald-400/50 rounded-xl px-4 py-3 text-white placeholder-emerald-200/50 text-lg focus:outline-none focus:border-emerald-400 transition-colors"
                      required
                    />
                  </div>
                  
                  <div>
                    <input
                      type="password"
                      placeholder="Confirm new password"
                      value={passwordChangeData.confirmPassword}
                      onChange={(e) => setPasswordChangeData({...passwordChangeData, confirmPassword: e.target.value})}
                      className="w-full bg-black/40 border-2 border-emerald-400/50 rounded-xl px-4 py-3 text-white placeholder-emerald-200/50 text-lg focus:outline-none focus:border-emerald-400 transition-colors"
                      required
                    />
                  </div>
                  
                  {passwordChangeError && (
                    <p className={`text-lg text-center ${passwordChangeError.includes('successfully') ? 'text-green-400' : 'text-red-400'}`}>
                      {passwordChangeError}
                    </p>
                  )}
                  
                  <div className="flex gap-4 mt-6">
                    <button
                      type="button"
                      onClick={() => {
                        setShowPasswordChange(false);
                        setPasswordChangeData({
                          oldPassword: '',
                          newPassword: '',
                          confirmPassword: ''
                        });
                        setPasswordChangeError('');
                      }}
                      className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-lg font-bold py-3 px-6 rounded-full transition-all duration-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-gradient-to-r from-emerald-600 to-emerald-800 hover:from-emerald-500 hover:to-emerald-700 text-white text-lg font-bold py-3 px-6 rounded-full transition-all duration-300"
                    >
                      Change Password
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
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
            <p className="text-2xl text-emerald-100 mb-12 font-light tracking-wide">
              Enter your name and password to join or login
            </p>
          </div>
          
          <div className="bg-black/40 backdrop-blur-lg rounded-3xl p-8 border-2 border-emerald-400/30 shadow-2xl">
            <form onSubmit={handlePlayerAuth} className="space-y-6">
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
              
              <div>
                <input
                  type="password"
                  placeholder="Password (will create account if new, or login if existing)"
                  value={playerPassword}
                  onChange={(e) => setPlayerPassword(e.target.value)}
                  className="w-full bg-black/40 border-2 border-emerald-400/50 rounded-xl px-6 py-4 text-white placeholder-emerald-200/50 text-xl focus:outline-none focus:border-emerald-400 transition-colors"
                  maxLength={100}
                  required
                />
              </div>
              
              {registrationError && (
                <p className="text-red-400 text-lg">{registrationError}</p>
              )}
              
              <button
                type="submit"
                disabled={!playerName.trim() || !playerPassword.trim()}
                className="w-full bg-gradient-to-r from-emerald-600 to-emerald-800 hover:from-emerald-500 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-800 disabled:cursor-not-allowed text-white text-xl font-bold py-4 px-8 rounded-full transition-all duration-300 shadow-lg border-2 border-emerald-400/50"
              >
                Join / Login
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
                
                {/* Display Settings - Moved to top */}
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  </div>
                </div>

                {/* Game Rules - New organized section */}
                <div className="mb-6">
                  <label className="block text-lg font-semibold text-amber-200 mb-4">Game Rules</label>
                  
                  {/* Timed Rounds */}
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-amber-200 mb-2">Timed Rounds</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
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
                      <div>
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
                    </div>
                  </div>

                  {/* Timer Eats Points - Only show when timer is enabled */}
                  {gameState.timedRounds && (
                    <div className="mb-4">
                      <label className="block text-sm font-semibold text-amber-200 mb-2">Timer Eats Points</label>
                      <div className="space-y-3">
                        <label className="flex items-center space-x-3 bg-black/20 border border-amber-400/30 rounded-lg px-3 py-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={gameSettings?.timer_eats_points || false}
                            onChange={(e) => {
                              console.log('⏰ Setting timer_eats_points to:', e.target.checked);
                              updateGameSettings({
                                timer_eats_points: e.target.checked
                              });
                            }}
                            className="w-4 h-4 text-emerald-600 bg-black/30 border-amber-400/30 rounded focus:ring-emerald-500"
                          />
                          <span className="text-amber-100">Enable Timer Eats Points</span>
                        </label>
                        {gameSettings?.timer_eats_points && (
                          <div>
                            <label className="block text-xs font-medium text-amber-300 mb-1">Minimum Points (% of full score)</label>
                            <select
                              value={gameSettings?.min_points_percentage || 25}
                              onChange={(e) => {
                                console.log('📊 Setting min_points_percentage to:', parseInt(e.target.value));
                                updateGameSettings({
                                  min_points_percentage: parseInt(e.target.value)
                                });
                              }}
                              className="w-full bg-black/30 border border-amber-400/30 rounded-lg px-3 py-2 text-amber-100 text-sm"
                            >
                              <option value="10">10% minimum</option>
                              <option value="25">25% minimum</option>
                              <option value="50">50% minimum</option>
                            </select>
                            <p className="text-xs text-amber-400 mt-1">
                              Points = {gameSettings?.score_multiplier || 10} × max({gameSettings?.min_points_percentage || 25}%, time_remaining/time_limit)
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Points per Question */}
                  <div>
                    <label className="block text-sm font-semibold text-amber-200 mb-2">Points per Question</label>
                    <select
                      value={gameSettings?.score_multiplier || 10}
                      onChange={(e) => {
                        console.log('🏆 Setting score_multiplier to:', parseInt(e.target.value));
                        updateGameSettings({
                          score_multiplier: parseInt(e.target.value)
                        });
                      }}
                      className="w-full bg-black/30 border border-amber-400/30 rounded-lg px-3 py-2 text-amber-100"
                    >
                      <option value="1">1 point</option>
                      <option value="5">5 points</option>
                      <option value="10">10 points</option>
                      <option value="20">20 points</option>
                      <option value="50">50 points</option>
                      <option value="100">100 points</option>
                    </select>
                    <p className="text-xs text-amber-300 mt-1">Write-in questions award fractions: 25%, 50%, 75%, 100%</p>
                  </div>
                </div>

                {/* Player Mode - New dedicated section */}
                <div className="mb-6">
                  <label className="block text-lg font-semibold text-amber-200 mb-4">Player Mode</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-amber-200 mb-2">Remote Players</label>
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
                        <span className="text-amber-100">Allow Remote Players</span>
                      </label>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-amber-200 mb-2">QR Code Display</label>
                      <label className="flex items-center space-x-3 bg-black/20 border border-amber-400/30 rounded-lg px-3 py-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!(gameSettings?.hide_qr_during_game ?? true)}
                          onChange={(e) => {
                            console.log('🏗️ Setting hide_qr_during_game to:', !e.target.checked);
                            updateGameSettings({
                              hide_qr_during_game: !e.target.checked
                            });
                          }}
                          className="w-4 h-4 text-emerald-600 bg-black/30 border-amber-400/30 rounded focus:ring-emerald-500"
                        />
                        <span className="text-amber-100">Show QR During Game</span>
                      </label>
                      <p className="text-xs text-amber-400 mt-1">
                        When enabled, QR code remains visible during gameplay for late joiners.
                      </p>
                    </div>
                  </div>
                  
                  {/* Display Options */}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-amber-200 mb-2">Display Options</label>
                      <label className="flex items-center space-x-3 bg-black/20 border border-amber-400/30 rounded-lg px-3 py-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={gameSettings?.show_player_count ?? true}
                          onChange={(e) => {
                            console.log('👥 Setting show_player_count to:', e.target.checked);
                            updateGameSettings({
                              show_player_count: e.target.checked
                            });
                          }}
                          className="w-4 h-4 text-emerald-600 bg-black/30 border-amber-400/30 rounded focus:ring-emerald-500"
                        />
                        <span className="text-amber-100">Show Player Count</span>
                      </label>
                      <p className="text-xs text-amber-400 mt-1">
                        Display number of connected players on big screen
                      </p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-amber-200 mb-2">Player Management</label>
                      <label className="flex items-center space-x-3 bg-black/20 border border-amber-400/30 rounded-lg px-3 py-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={gameSettings?.auto_clear_players ?? true}
                          onChange={(e) => {
                            console.log('🧹 Setting auto_clear_players to:', e.target.checked);
                            updateGameSettings({
                              auto_clear_players: e.target.checked
                            });
                          }}
                          className="w-4 h-4 text-emerald-600 bg-black/30 border-amber-400/30 rounded focus:ring-emerald-500"
                        />
                        <span className="text-amber-100">Auto-clear Players</span>
                      </label>
                      <p className="text-xs text-amber-400 mt-1">
                        Clear player list when game ends
                      </p>
                    </div>
                  </div>
                  
                  {/* Player Join Window */}
                  <div className="mt-4">
                    <label className="block text-sm font-semibold text-amber-200 mb-2">Player Join Window</label>
                    <select
                      value={gameSettings?.player_join_timeout || 60}
                      onChange={(e) => {
                        console.log('⏳ Setting player_join_timeout to:', parseInt(e.target.value));
                        updateGameSettings({
                          player_join_timeout: parseInt(e.target.value)
                        });
                      }}
                      className="w-full bg-black/30 border border-amber-400/30 rounded-lg px-3 py-2 text-amber-100 text-sm"
                    >
                      <option value="30">30 seconds after start</option>
                      <option value="60">1 minute after start</option>
                      <option value="120">2 minutes after start</option>
                      <option value="300">5 minutes after start</option>
                      <option value="-1">Always allow joins</option>
                    </select>
                    <p className="text-xs text-amber-400 mt-1">
                      How long players can join after game starts
                    </p>
                  </div>
                </div>

                {/* Advanced Settings - New section for host management features */}
                <div className="mb-6">
                  <label className="block text-lg font-semibold text-amber-200 mb-4">Advanced Settings</label>
                  
                  {/* Security Settings */}
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-amber-200 mb-2">Host Security</label>
                    <div>
                      <label className="block text-xs font-medium text-amber-300 mb-1">Host Password (optional)</label>
                      <input
                        type="password"
                        value={gameSettings?.host_password || ''}
                        onChange={(e) => {
                          console.log('🔐 Setting host_password');
                          updateGameSettings({
                            host_password: e.target.value
                          });
                        }}
                        className="w-full bg-black/30 border border-amber-400/30 rounded-lg px-3 py-2 text-amber-100"
                        placeholder="Leave empty for no password"
                      />
                      <p className="text-xs text-amber-400 mt-1">
                        Require password to access host controls. Leave empty to disable.
                      </p>
                    </div>
                  </div>


                </div>

                {/* Game Mode Settings */}
                <div className="mb-6">
                  <label className="block text-lg font-semibold text-purple-200 mb-4">🎮 Game Modes</label>
                  
                  {/* Team Mode */}
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-purple-200 mb-2">Team Mode</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="flex items-center space-x-3 bg-purple-900/20 border border-purple-400/30 rounded-lg px-3 py-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={gameSettings?.team_mode ?? false}
                            onChange={(e) => {
                              console.log('👥 Setting team_mode to:', e.target.checked);
                              updateGameSettings({
                                team_mode: e.target.checked
                              });
                            }}
                            className="w-4 h-4 text-purple-600 bg-black/30 border-purple-400/30 rounded focus:ring-purple-500"
                          />
                          <span className="text-purple-100">Enable Team Mode</span>
                        </label>
                        <p className="text-xs text-purple-400 mt-1">
                          Players can create and join teams to compete together
                        </p>
                      </div>
                      {gameSettings?.team_mode && (
                        <div>
                          <label className="block text-xs font-medium text-purple-300 mb-1">Team Size Limit</label>
                          <input
                            type="number"
                            min="2"
                            max="10"
                            value={gameSettings?.team_size_limit || 4}
                            onChange={(e) => {
                              updateGameSettings({
                                team_size_limit: parseInt(e.target.value) || 4
                              });
                            }}
                            className="w-full bg-black/30 border border-purple-400/30 rounded-lg px-3 py-2 text-purple-100 text-sm"
                          />
                          <p className="text-xs text-purple-400 mt-1">
                            Maximum players per team
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Buzzer Mode */}
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-yellow-200 mb-2">Buzzer Mode</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="flex items-center space-x-3 bg-yellow-900/20 border border-yellow-400/30 rounded-lg px-3 py-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={gameSettings?.buzzer_enabled ?? false}
                            onChange={(e) => {
                              console.log('🔔 Setting buzzer_enabled to:', e.target.checked);
                              updateGameSettings({
                                buzzer_enabled: e.target.checked
                              });
                            }}
                            className="w-4 h-4 text-yellow-600 bg-black/30 border-yellow-400/30 rounded focus:ring-yellow-500"
                          />
                          <span className="text-yellow-100">Enable Buzzer System</span>
                        </label>
                        <p className="text-xs text-yellow-400 mt-1">
                          First player to buzz gets first chance to answer
                        </p>
                      </div>
                      {gameSettings?.buzzer_enabled && (
                        <div>
                          <label className="block text-xs font-medium text-yellow-300 mb-1">Buzzer Timeout</label>
                          <select
                            value={gameSettings?.buzzer_timeout || 5}
                            onChange={(e) => {
                              updateGameSettings({
                                buzzer_timeout: parseInt(e.target.value)
                              });
                            }}
                            className="w-full bg-black/30 border border-yellow-400/30 rounded-lg px-3 py-2 text-yellow-100 text-sm"
                          >
                            <option value="3">3 seconds</option>
                            <option value="5">5 seconds</option>
                            <option value="10">10 seconds</option>
                            <option value="15">15 seconds</option>
                          </select>
                          <p className="text-xs text-yellow-400 mt-1">
                            How long players have to buzz in
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Info about Feud Mode */}
                  <div className="bg-purple-900/20 border border-purple-400/30 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-purple-200 mb-2">🎪 Feud Mode</h4>
                    <p className="text-xs text-purple-300 mb-2">
                      Family Feud style questions are automatically available when you create "Feud" type questions.
                    </p>
                    <p className="text-xs text-purple-400">
                      Use the Question Manager to create Feud questions with up to 8 possible answers.
                    </p>
                  </div>
                </div>


                {/* Start Game Button */}
                <button
                  onClick={startGame}
                  disabled={filteredQuestions.length === 0}
                  className="w-full bg-gradient-to-r from-emerald-600 to-emerald-800 hover:from-emerald-500 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-800 text-white text-xl font-bold py-4 px-8 rounded-xl transition-all duration-300 shadow-lg border-2 border-emerald-400/50 disabled:border-gray-600/50"
                >
                  <Play className="w-6 h-6 mr-3 inline" />
                  {(() => {
                    const questionsCount = filteredQuestions.length;
                    return questionsCount === 0 ? 'No Questions Available - Check Settings' : `Start Trivia Game (${questionsCount} questions)`;
                  })()}
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

                  {/* Filters */}
                  <div className="mb-4 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-amber-300 mb-1">Category</label>
                      <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="w-full bg-black/30 border border-amber-400/30 rounded-lg px-3 py-2 text-amber-100 text-sm focus:border-amber-400/50 focus:outline-none"
                      >
                        <option value="all">All Categories</option>
                        {safeCategories.map((category) => (
                          <option key={category} value={category}>
                            {category} ({questions.filter(q => q.category === category).length})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-amber-300 mb-1">Question Type</label>
                      <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="w-full bg-black/30 border border-amber-400/30 rounded-lg px-3 py-2 text-amber-100 text-sm focus:border-amber-400/50 focus:outline-none"
                      >
                        <option value="all">All Types</option>
                        <option value="multiple_choice">Multiple Choice ({questions.filter(q => (q.type || 'multiple_choice') === 'multiple_choice').length})</option>
                        <option value="write_in">Write-in ({questions.filter(q => q.type === 'write_in').length})</option>
                        <option value="feud">Feud ({questions.filter(q => q.type === 'feud').length})</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {getFilteredLibraryQuestions().slice(0, 10).map((q) => (
                      <div key={q.id} className="bg-black/30 p-4 rounded-lg flex justify-between items-center border border-amber-400/20">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="text-sm text-amber-300">{q.category}</span>
                            <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                              (q.type || 'multiple_choice') === 'multiple_choice' ? 'bg-blue-600/20 text-blue-300 border border-blue-400/30' :
                              q.type === 'write_in' ? 'bg-green-600/20 text-green-300 border border-green-400/30' :
                              q.type === 'feud' ? 'bg-purple-600/20 text-purple-300 border border-purple-400/30' :
                              'bg-gray-600/20 text-gray-300 border border-gray-400/30'
                            }`}>
                              {(q.type || 'multiple_choice') === 'multiple_choice' ? 'MC' :
                               q.type === 'write_in' ? 'Write' :
                               q.type === 'feud' ? 'Feud' : 'Unknown'}
                            </span>
                          </div>
                          <p className="font-medium text-amber-100 truncate">{q.question}</p>
                        </div>
                        <div className="flex space-x-2">
                          {/* Add to playlist button */}
                          {q.id && !includedQuestions.includes(q.id) ? (
                            <button
                              onClick={() => addToPlaylist(q.id!)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-lg border border-emerald-400/50"
                              title="Add to playlist"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          ) : q.id && includedQuestions.includes(q.id) ? (
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
                  <div className="flex items-center space-x-3">
                    <span className="text-sm text-amber-300">{getPlaylistQuestions().length} questions</span>
                    {getPlaylistQuestions().length > 0 && (
                      <button
                        onClick={clearPlaylist}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors"
                        title="Clear all questions from playlist"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                </div>
                
                {getPlaylistQuestions().length === 0 ? (
                  <div className="p-3 bg-amber-600/20 border border-amber-400/50 rounded-lg text-center">
                    <p className="text-amber-200 text-sm">No questions added yet. Use the "+" button in the Question Library to add questions.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {getPlaylistQuestions().map((question, index) => (
                      <div key={question.id} className="flex items-center justify-between p-2 bg-black/30 rounded-lg border border-amber-400/20">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-amber-100 truncate">{index + 1}. {question.question}</p>
                          <div className="flex items-center space-x-2">
                            <p className="text-xs text-amber-300">{question.category}</p>
                            <span className={`px-1.5 py-0.5 text-xs rounded-full font-medium ${
                              (question.type || 'multiple_choice') === 'multiple_choice' ? 'bg-blue-600/20 text-blue-300 border border-blue-400/30' :
                              question.type === 'write_in' ? 'bg-green-600/20 text-green-300 border border-green-400/30' :
                              question.type === 'feud' ? 'bg-purple-600/20 text-purple-300 border border-purple-400/30' :
                              'bg-gray-600/20 text-gray-300 border border-gray-400/30'
                            }`}>
                              {(question.type || 'multiple_choice') === 'multiple_choice' ? 'MC' :
                               question.type === 'write_in' ? 'Write' :
                               question.type === 'feud' ? 'Feud' : 'Unknown'}
                            </span>
                          </div>
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
                        const newType = e.target.value as 'multiple_choice' | 'write_in' | 'feud';
                        setNewQuestion({
                          ...newQuestion, 
                          type: newType,
                          options: newType === 'write_in' || newType === 'feud' ? [] : ['', '', '', ''],
                          feud_answers: newType === 'feud' ? [{answer_text: '', points: 1, display_order: 1, revealed: false}] : []
                        });
                      }}
                      className="w-full bg-black/30 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100 focus:border-amber-400 focus:outline-none"
                    >
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="write_in">Write-in</option>
                      <option value="feud">Feud (Family Feud Style)</option>
                    </select>
                  </div>
                  {newQuestion.type !== 'feud' && (
                    <input
                      type="text"
                      placeholder={newQuestion.type === 'write_in' ? "Sample Answer (optional)" : "Answer"}
                      value={newQuestion.answer}
                      onChange={(e) => setNewQuestion({...newQuestion, answer: e.target.value})}
                      className="bg-black/30 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100 placeholder-amber-200/50 md:col-span-1"
                    />
                  )}
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
                  {newQuestion.type === 'feud' && (
                    <div className="md:col-span-2 bg-purple-900/20 border border-purple-400/20 rounded-lg p-4">
                      <p className="text-purple-200 text-sm mb-4">
                        <strong>Feud Question:</strong> Family Feud style with up to 8 possible answers. Teams take turns guessing answers that you can reveal and award points for.
                      </p>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-purple-200">Feud Answers (up to 8)</label>
                        {(newQuestion.feud_answers || []).map((feudAnswer, index) => (
                          <div key={index} className="flex space-x-2">
                            <input
                              type="text"
                              placeholder={`Answer ${index + 1}`}
                              value={feudAnswer.answer_text}
                              onChange={(e) => {
                                const newFeudAnswers = [...(newQuestion.feud_answers || [])];
                                newFeudAnswers[index] = {...feudAnswer, answer_text: e.target.value};
                                setNewQuestion({...newQuestion, feud_answers: newFeudAnswers});
                              }}
                              className="flex-1 bg-black/40 border border-purple-400/30 rounded px-3 py-1 text-purple-100 placeholder-purple-200/50"
                            />
                            <input
                              type="number"
                              placeholder="Points"
                              value={feudAnswer.points}
                              onChange={(e) => {
                                const newFeudAnswers = [...(newQuestion.feud_answers || [])];
                                newFeudAnswers[index] = {...feudAnswer, points: parseInt(e.target.value) || 1};
                                setNewQuestion({...newQuestion, feud_answers: newFeudAnswers});
                              }}
                              className="w-20 bg-black/40 border border-purple-400/30 rounded px-2 py-1 text-purple-100"
                              min="1"
                              max="100"
                            />
                            {index > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const newFeudAnswers = (newQuestion.feud_answers || []).filter((_, i) => i !== index);
                                  setNewQuestion({...newQuestion, feud_answers: newFeudAnswers});
                                }}
                                className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                        {(newQuestion.feud_answers || []).length < 8 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newFeudAnswers = [...(newQuestion.feud_answers || [])];
                              newFeudAnswers.push({
                                answer_text: '',
                                points: 1,
                                display_order: newFeudAnswers.length + 1,
                                revealed: false
                              });
                              setNewQuestion({...newQuestion, feud_answers: newFeudAnswers});
                            }}
                            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm"
                          >
                            + Add Answer
                          </button>
                        )}
                      </div>
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
                      <div className="flex flex-col space-y-2">
                        <button
                          onClick={() => handleResetPlayerScore(player.id, player.name)}
                          className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded-md text-sm font-semibold transition-colors border border-orange-400/50"
                          title={`Reset ${player.name}'s score`}
                        >
                          Reset Score
                        </button>
                        <button
                          onClick={() => openPasswordReset(player.id, player.name)}
                          className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded-md text-sm font-semibold transition-colors border border-purple-400/50"
                          title={`Reset ${player.name}'s password`}
                        >
                          Reset Password
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Team Management Panel (only show when team mode is enabled) */}
          {gameSettings?.team_mode && (
            <div className="mt-8 bg-black/40 backdrop-blur-lg rounded-3xl p-8 border-2 border-purple-400/30 shadow-2xl relative">
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-purple-400 rotate-45"></div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-purple-100 flex items-center">
                  <UserCog className="w-6 h-6 mr-3" />
                  Teams ({teams.length})
                </h2>
                <div className="flex space-x-2">
                  <button
                    onClick={refreshTeams}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors border border-purple-400/50"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={() => setShowTeamCreation(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors border border-emerald-400/50"
                  >
                    Create Team
                  </button>
                  {teams.length > 0 && (
                    <button
                      onClick={() => {
                        if (window.confirm('Are you sure you want to clear ALL teams? This will remove all players from teams.')) {
                          clearAllTeams();
                        }
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors border border-red-400/50"
                    >
                      Clear All
                    </button>
                  )}
                </div>
              </div>

              {teams.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-purple-200 text-lg mb-4">No teams created yet</p>
                  <p className="text-purple-300 text-sm">Create teams for players to join and compete together</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-64 overflow-y-auto">
                  {teams.map((team) => {
                    // Get team members from players list
                    const teamMembers = players.filter(p => p.team_id === team.id);
                    const maxMembers = gameSettings?.max_team_size || 4;
                    
                    return (
                      <div key={team.id} className="bg-black/30 border border-purple-400/30 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center space-x-3">
                            <div 
                              className="w-4 h-4 rounded-full border-2 border-white"
                              style={{ backgroundColor: team.color }}
                            ></div>
                            <div>
                              <h3 className="text-purple-100 font-semibold text-lg">{team.name}</h3>
                              <p className="text-purple-300 text-sm">
                                {teamMembers.length}/{maxMembers} members • {team.score} points
                              </p>
                            </div>
                          </div>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to delete team "${team.name}"? All members will be removed from the team.`)) {
                                  deleteTeam(team.id);
                                }
                              }}
                              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-md text-sm font-semibold transition-colors border border-red-400/50"
                              title={`Delete team ${team.name}`}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        
                        {/* Team Members List */}
                        {teamMembers.length > 0 ? (
                          <div className="bg-black/20 rounded-lg p-3">
                            <p className="text-purple-200 text-sm font-medium mb-2">Team Members:</p>
                            <div className="grid grid-cols-2 gap-2">
                              {teamMembers.map((member) => (
                                <div key={member.id} className="flex items-center justify-between bg-black/30 rounded px-2 py-1">
                                  <div className="flex items-center space-x-2">
                                    <div className={`w-2 h-2 rounded-full ${member.connected ? 'bg-green-400' : 'bg-red-400'}`}></div>
                                    <span className="text-purple-100 text-sm">{member.name}</span>
                                  </div>
                                  <span className="text-amber-400 text-sm font-medium">{member.score}pts</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="bg-black/20 rounded-lg p-3 text-center">
                            <p className="text-purple-300 text-sm">No members yet</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Team Creation Modal */}
          {showTeamCreation && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <div className="bg-black/90 border-2 border-purple-400/30 rounded-2xl p-6 max-w-md w-full relative">
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-purple-400 rotate-45"></div>
                <h3 className="text-xl font-bold mb-4 text-purple-100">Create New Team</h3>
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Team Name"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    className="w-full bg-black/40 border border-purple-400/30 rounded-lg px-4 py-2 text-purple-100 placeholder-purple-200/50"
                    maxLength={30}
                  />
                  <div>
                    <label className="block text-sm font-medium mb-2 text-purple-200">Team Color</label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="color"
                        value={newTeamColor}
                        onChange={(e) => setNewTeamColor(e.target.value)}
                        className="w-12 h-10 border border-purple-400/30 rounded cursor-pointer"
                      />
                      <span className="text-purple-100 text-sm">{newTeamColor}</span>
                    </div>
                  </div>
                  <div className="flex space-x-3 pt-4">
                    <button
                      onClick={() => {
                        setShowTeamCreation(false);
                        setNewTeamName('');
                        setNewTeamColor('#3B82F6');
                      }}
                      className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={createTeam}
                      disabled={!newTeamName.trim()}
                      className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-semibold transition-colors"
                    >
                      Create Team
                    </button>
                  </div>
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
                        const newType = e.target.value as 'multiple_choice' | 'write_in' | 'feud';
                        setEditingQuestion({
                          ...editingQuestion, 
                          type: newType,
                          options: newType === 'write_in' || newType === 'feud' ? [] : (editingQuestion.options?.length === 4 ? editingQuestion.options : ['', '', '', '']),
                          feud_answers: newType === 'feud' ? (editingQuestion.feud_answers || [{answer_text: '', points: 1, display_order: 1, revealed: false}]) : []
                        });
                      }}
                      className="bg-black/40 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100"
                    >
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="write_in">Write-in</option>
                      <option value="feud">Feud (Family Feud Style)</option>
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
                  {(editingQuestion.type || 'multiple_choice') === 'feud' && (
                    <div className="bg-purple-900/20 border border-purple-400/20 rounded-lg p-4">
                      <p className="text-purple-200 text-sm mb-4">
                        <strong>Feud Question:</strong> Family Feud style with up to 8 possible answers. Teams take turns guessing answers that you can reveal and award points for.
                      </p>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-purple-200">Feud Answers (up to 8)</label>
                        {(editingQuestion.feud_answers || []).map((feudAnswer, index) => (
                          <div key={index} className="flex space-x-2">
                            <input
                              type="text"
                              placeholder={`Answer ${index + 1}`}
                              value={feudAnswer.answer_text}
                              onChange={(e) => {
                                const newFeudAnswers = [...(editingQuestion.feud_answers || [])];
                                newFeudAnswers[index] = {...feudAnswer, answer_text: e.target.value};
                                setEditingQuestion({...editingQuestion, feud_answers: newFeudAnswers});
                              }}
                              className="flex-1 bg-black/40 border border-purple-400/30 rounded px-3 py-1 text-purple-100 placeholder-purple-200/50"
                            />
                            <input
                              type="number"
                              placeholder="Points"
                              value={feudAnswer.points}
                              onChange={(e) => {
                                const newFeudAnswers = [...(editingQuestion.feud_answers || [])];
                                newFeudAnswers[index] = {...feudAnswer, points: parseInt(e.target.value) || 1};
                                setEditingQuestion({...editingQuestion, feud_answers: newFeudAnswers});
                              }}
                              className="w-20 bg-black/40 border border-purple-400/30 rounded px-2 py-1 text-purple-100"
                              min="1"
                              max="100"
                            />
                            {index > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const newFeudAnswers = (editingQuestion.feud_answers || []).filter((_, i) => i !== index);
                                  setEditingQuestion({...editingQuestion, feud_answers: newFeudAnswers});
                                }}
                                className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                        {(editingQuestion.feud_answers || []).length < 8 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newFeudAnswers = [...(editingQuestion.feud_answers || [])];
                              newFeudAnswers.push({
                                answer_text: '',
                                points: 1,
                                display_order: newFeudAnswers.length + 1,
                                revealed: false
                              });
                              setEditingQuestion({...editingQuestion, feud_answers: newFeudAnswers});
                            }}
                            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm"
                          >
                            + Add Answer
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {(editingQuestion.type || 'multiple_choice') !== 'feud' && (
                    <input
                      type="text"
                      placeholder="Answer"
                      value={editingQuestion.answer}
                      onChange={(e) => setEditingQuestion({...editingQuestion, answer: e.target.value})}
                      className="w-full bg-black/40 border border-amber-400/30 rounded-lg px-4 py-2 text-amber-100 placeholder-amber-200/50"
                    />
                  )}
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
        
        {/* Password Reset Modal (Host) */}
        {showPasswordReset && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-3xl p-8 max-w-md w-full border-2 border-emerald-400/30 shadow-2xl">
              <h2 className="text-2xl font-bold text-white mb-6 text-center">
                Reset Password for {passwordResetData.playerName}
              </h2>
              
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div>
                  <input
                    type="password"
                    placeholder="Enter new password"
                    value={passwordResetData.newPassword}
                    onChange={(e) => setPasswordResetData({...passwordResetData, newPassword: e.target.value})}
                    className="w-full bg-black/40 border-2 border-emerald-400/50 rounded-xl px-4 py-3 text-white placeholder-emerald-200/50 text-lg focus:outline-none focus:border-emerald-400 transition-colors"
                    required
                  />
                </div>
                
                {passwordResetError && (
                  <p className={`text-lg text-center ${passwordResetError.includes('successfully') ? 'text-green-400' : 'text-red-400'}`}>
                    {passwordResetError}
                  </p>
                )}
                
                <div className="flex gap-4 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordReset(false);
                      setPasswordResetData({
                        playerId: 0,
                        playerName: '',
                        newPassword: ''
                      });
                      setPasswordResetError('');
                    }}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-lg font-bold py-3 px-6 rounded-full transition-all duration-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-500 hover:to-purple-700 text-white text-lg font-bold py-3 px-6 rounded-full transition-all duration-300"
                  >
                    Reset Password
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Host Password Modal */}
        {showHostPasswordPrompt && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-3xl p-8 max-w-md w-full border-2 border-amber-400/30 shadow-2xl">
              <h2 className="text-2xl font-bold text-white mb-6 text-center">
                Host Access Required
              </h2>
              
              <form onSubmit={handleHostPasswordSubmit} className="space-y-4">
                <div>
                  <input
                    type="password"
                    placeholder="Enter host password"
                    value={hostPassword}
                    onChange={(e) => setHostPassword(e.target.value)}
                    className="w-full bg-black/40 border-2 border-amber-400/50 rounded-xl px-4 py-3 text-white placeholder-amber-200/50 text-lg focus:outline-none focus:border-amber-400 transition-colors"
                    autoFocus
                  />
                </div>
                
                {hostPasswordError && (
                  <p className="text-lg text-center text-red-400">
                    {hostPasswordError}
                  </p>
                )}
                
                <div className="flex gap-4 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowHostPasswordPrompt(false);
                      setHostPassword('');
                      setHostPasswordError('');
                    }}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-lg font-bold py-3 px-6 rounded-full transition-all duration-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-amber-600 to-amber-800 hover:from-amber-500 hover:to-amber-700 text-black text-lg font-bold py-3 px-6 rounded-full transition-all duration-300"
                  >
                    Access Host Panel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  const currentQuestion = filteredQuestions[gameState.currentSlide];
  
  console.log('🎯 Host mode currentQuestion debug:', {
    filteredQuestions: filteredQuestions,
    questionsArray: filteredQuestions,
    currentSlide: gameState.currentSlide,
    currentQuestion: currentQuestion,
    questionsLength: filteredQuestions.length
  });
  
  if (!currentQuestion) {
    console.log('❌ Host panel returning null - no currentQuestion found');
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-amber-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl text-amber-100 mb-4">Host Control Panel</h2>
          <p className="text-amber-300">No question selected or questions not loaded</p>
          <p className="text-sm text-gray-400 mt-2">
            Current slide: {gameState.currentSlide}, Questions available: {filteredQuestions.length || 0}
          </p>
        </div>
      </div>
    );
  }

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
          
          {/* Buzzer Controls (for buzzer-enabled questions) */}
          {gameSettings?.buzzer_enabled && (
            <div className="bg-black/20 border-b border-yellow-400/20 p-4">
              <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-yellow-200 flex items-center">
                    🔔 Buzzer Control
                  </h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={async () => {
                        const currentQuestion = filteredQuestions[gameState.currentSlide];
                        if (currentQuestion?.id) {
                          try {
                            await apiService.clearBuzzerResponses(currentQuestion.id);
                            setBuzzerResponses([]);
                            setBuzzerLocked(false);
                            setHasBuzzed(false);
                          } catch (error) {
                            console.error('Failed to clear buzzer:', error);
                          }
                        }
                      }}
                      disabled={buzzerResponses.length === 0}
                      className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-semibold transition-colors border border-yellow-400/50"
                    >
                      Clear Buzzer
                    </button>
                    <button
                      onClick={async () => {
                        const currentQuestion = filteredQuestions[gameState.currentSlide];
                        if (currentQuestion?.id) {
                          try {
                            const responses = await apiService.getBuzzerResponses(currentQuestion.id);
                            setBuzzerResponses(responses.sort((a, b) => 
                              new Date(a.buzz_time).getTime() - new Date(b.buzz_time).getTime()
                            ));
                          } catch (error) {
                            console.error('Failed to refresh buzzer:', error);
                          }
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors border border-blue-400/50"
                    >
                      Refresh
                    </button>
                    
                    {buzzerResponses.length > 0 && (
                      <button
                        onClick={async () => {
                          // Move to next buzzer in queue
                          if (buzzerResponses.length > 1) {
                            setBuzzerResponses(prev => prev.slice(1));
                            
                            // Clear current answers to allow next player to answer
                            try {
                              const currentQuestion = filteredQuestions[gameState.currentSlide];
                              if (currentQuestion?.id) {
                                await clearQuestionAnswers(currentQuestion.id);
                              }
                            } catch (error) {
                              console.error('Failed to clear answers for next buzzer:', error);
                            }
                          }
                        }}
                        disabled={buzzerResponses.length <= 1}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-semibold transition-colors border border-red-400/50"
                      >
                        ✗ Wrong Answer (Next Buzzer)
                      </button>
                    )}
                  </div>
                </div>
                
                {buzzerResponses.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-yellow-300">No buzzer responses yet. Players can buzz in when the question is shown.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {buzzerResponses.map((response, index) => (
                      <div 
                        key={response.id} 
                        className={`
                          bg-black/30 rounded-lg p-3 border-2 transition-all duration-300
                          ${index === 0 ? 'border-yellow-400 bg-yellow-900/20' : 
                            index === 1 ? 'border-gray-400 bg-gray-900/20' :
                            index === 2 ? 'border-amber-600 bg-amber-900/20' :
                            'border-gray-600 bg-gray-800/20'}
                        `}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <span className={`
                              w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold
                              ${index === 0 ? 'bg-yellow-400 text-black' : 
                                index === 1 ? 'bg-gray-400 text-black' :
                                index === 2 ? 'bg-amber-600 text-white' :
                                'bg-gray-600 text-white'}
                            `}>
                              {index + 1}
                            </span>
                            <span className="text-white font-medium">
                              {response.player_name || `Player ${response.player_id}`}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400">
                            {(() => {
                              if (!response.buzz_time) return 'No time';
                              try {
                                const date = new Date(response.buzz_time);
                                if (isNaN(date.getTime())) return 'Invalid time';
                                return date.toLocaleTimeString();
                              } catch (e) {
                                return 'Invalid time';
                              }
                            })()}
                          </span>
                        </div>
                        {response.team_name && (
                          <div className="flex items-center space-x-2">
                            <span 
                              className="text-xs px-2 py-1 rounded-full font-medium"
                              style={{ 
                                backgroundColor: response.team_color || '#6B7280',
                                color: 'white'
                              }}
                            >
                              {response.team_name}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
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
            {(currentQuestion.type || 'multiple_choice') === 'multiple_choice' ? (
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
            ) : (currentQuestion.type || 'multiple_choice') === 'write_in' ? (
              <div className="bg-amber-600/20 border-2 border-amber-400/50 rounded-2xl p-8 mb-12 text-center">
                <h3 className="text-2xl font-bold text-amber-300 mb-4">✍️ Write-in Question</h3>
                <p className="text-lg text-amber-200">Players will type their answers. Review submissions in the Write-in Panel below.</p>
              </div>
            ) : (
              /* Feud Question Host Controls */
              <div className="mb-12">
                {/* Family Feud Game Management Panel */}
                <div className="bg-blue-900/20 border-2 border-blue-400/50 rounded-xl p-6 mb-6">
                  <h4 className="text-xl font-bold text-blue-300 mb-4 text-center">🏆 Family Feud Game Management</h4>
                  
                  {/* Game Status Display */}
                  <div className="mb-4 text-center">
                    <div className="bg-black/40 rounded-lg px-4 py-2 inline-block">
                      <span className="text-blue-200">
                        Phase: <span className="font-bold text-blue-100">{gameState?.feudState?.gamePhase || 'Setup'}</span>
                        {gameState?.feudState?.activeTeam && (
                          <>
                            {' | '}Active Team: <span className="font-bold text-green-300">
                              {teams.find(t => t.id === gameState.feudState?.activeTeam)?.name || 'Unknown'}
                            </span>
                          </>
                        )}
                        {' | '}Strikes: <span className="font-bold text-red-300">{gameState?.feudState?.strikes || 0}/3</span>
                      </span>
                    </div>
                  </div>
                  
                  {/* Game Control Buttons */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {/* Initialize Game */}
                    {(!gameState?.feudState?.activeTeam || gameState?.feudState?.gamePhase === 'setup') && teams.length >= 2 && (
                      <div className="md:col-span-2">
                        <label className="block text-xs text-blue-300 mb-1">Start Family Feud Game:</label>
                        <div className="flex space-x-2">
                          <select 
                            className="flex-1 px-2 py-1 bg-black/40 border border-blue-400/30 rounded text-white text-sm"
                            value={gameState?.feudState?.activeTeam || ''}
                            onChange={(e) => {
                              const activeTeamId = parseInt(e.target.value);
                              const opposingTeamId = teams.find(t => t.id !== activeTeamId)?.id;
                              if (activeTeamId && opposingTeamId) {
                                apiService.initializeFeudGame(activeTeamId, opposingTeamId);
                              }
                            }}
                          >
                            <option value="">Select Active Team</option>
                            {teams.map(team => (
                              <option key={team.id} value={team.id}>{team.name}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => apiService.setFeudPhase('face-off')}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
                          >
                            Start Face-off
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {/* Switch Teams */}
                    {gameState?.feudState?.activeTeam && (
                      <button
                        onClick={() => apiService.switchFeudTeams()}
                        className="px-3 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded transition-colors"
                      >
                        Switch Teams
                      </button>
                    )}
                    
                    {/* Phase Controls */}
                    {gameState?.feudState?.activeTeam && (
                      <div>
                        <label className="block text-xs text-blue-300 mb-1">Set Phase:</label>
                        <select 
                          className="w-full px-2 py-1 bg-black/40 border border-blue-400/30 rounded text-white text-sm"
                          value={gameState?.feudState?.gamePhase || 'setup'}
                          onChange={(e) => apiService.setFeudPhase(e.target.value)}
                        >
                          <option value="setup">Setup</option>
                          <option value="face-off">Face-off</option>
                          <option value="team-play">Team Play</option>
                          <option value="steal">Steal Opportunity</option>
                        </select>
                      </div>
                    )}
                    
                    {/* Reset Game */}
                    <button
                      onClick={() => apiService.resetFeudState()}
                      className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded transition-colors"
                    >
                      Reset Game
                    </button>
                  </div>
                </div>

                <div className="bg-purple-900/20 border-2 border-purple-400/50 rounded-2xl p-8">
                  <h3 className="text-2xl font-bold text-purple-300 mb-6 text-center">🎪 Feud Question Host Controls</h3>
                  
                  {/* Feud Answers Grid with Controls */}
                  <div className="grid grid-cols-2 gap-4 mb-8">
                    {(() => {
                      console.log('🎪 Host Controls Feud Debug:', {
                        currentQuestion: currentQuestion,
                        questionType: currentQuestion?.type,
                        questionFeudAnswers: currentQuestion?.feud_answers,
                        stateFeudAnswers: feudAnswers,
                        feudAnswersLength: feudAnswers?.length
                      });
                      return (feudAnswers || []).map((feudAnswer, index) => (
                      <div
                        key={feudAnswer.id || index}
                        className={`
                          border-2 rounded-xl p-4 transition-all duration-300
                          ${revealedFeudAnswers.has(feudAnswer.id || index) ? 
                            'bg-emerald-600/30 border-emerald-400' : 
                            'bg-black/30 border-purple-400/30'
                          }
                        `}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-lg font-bold text-white">
                            {index + 1}. {feudAnswer.answer_text}
                          </span>
                          <span className="bg-purple-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                            {feudAnswer.points} pts
                          </span>
                        </div>
                        
                        <div className="flex space-x-2">
                          <button
                            onClick={async () => {
                              console.log('🎪 Attempting to reveal feud answer:', {
                                questionId: currentQuestion.id,
                                feudAnswerId: feudAnswer.id,
                                feudAnswer: feudAnswer,
                                index: index
                              });
                              
                              if (!feudAnswer.id) {
                                console.error('Cannot reveal feud answer: missing ID', feudAnswer);
                                alert('Cannot reveal answer: Answer ID is missing. This may be a JSON-based question that needs to be saved to the database first.');
                                return;
                              }
                              
                              if (!currentQuestion.id) {
                                console.error('Cannot reveal feud answer: missing question ID');
                                alert('Cannot reveal answer: Question ID is missing.');
                                return;
                              }
                              
                              try {
                                await apiService.revealFeudAnswer(currentQuestion.id, feudAnswer.id);
                                setRevealedFeudAnswers(prev => new Set([...prev, feudAnswer.id]));
                                console.log('✅ Successfully revealed feud answer:', feudAnswer.id);
                              } catch (error) {
                                console.error('Failed to reveal feud answer:', error);
                                alert(`Failed to reveal answer: ${error instanceof Error ? error.message : 'Unknown error'}`);
                              }
                            }}
                            disabled={revealedFeudAnswers.has(feudAnswer.id || index) || !feudAnswer.id}
                            className={`
                              flex-1 px-3 py-2 rounded-lg font-semibold text-sm transition-colors
                              ${revealedFeudAnswers.has(feudAnswer.id || index) ? 
                                'bg-green-600/50 text-green-200 cursor-not-allowed' : 
                                !feudAnswer.id ?
                                'bg-gray-600/50 text-gray-400 cursor-not-allowed' :
                                'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-400/50'
                              }
                            `}
                            title={!feudAnswer.id ? 'Answer ID missing - cannot reveal' : ''}
                          >
                            {revealedFeudAnswers.has(feudAnswer.id || index) ? '✓ Revealed' : 
                             !feudAnswer.id ? 'No ID' : 'Reveal'}
                          </button>
                          
                          {gameSettings?.team_mode && (
                            <select 
                              className="px-2 py-2 bg-black/40 border border-purple-400/30 rounded-lg text-white text-xs"
                              onChange={async (e) => {
                                const teamId = parseInt(e.target.value);
                                if (teamId && feudAnswer.id) {
                                  try {
                                    // Award points to the first player in the team (captain) 
                                    // The backend will handle awarding to the team if team mode is enabled
                                    const teamPlayers = players.filter(p => p.team_id === teamId);
                                    if (teamPlayers.length > 0) {
                                      await apiService.awardFeudPoints(
                                        currentQuestion.id, 
                                        teamPlayers[0].id, 
                                        teamId, 
                                        feudAnswer.id, 
                                        feudAnswer.points
                                      );
                                    }
                                  } catch (error) {
                                    console.error('Failed to award feud points:', error);
                                  }
                                }
                              }}
                            >
                              <option value="">Award to Team</option>
                              {teams.map(team => (
                                <option key={team.id} value={team.id}>{team.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                      ));
                    })()}
                    
                    {/* Fill empty slots */}
                    {Array.from({ length: Math.max(0, 8 - (feudAnswers || []).length) }).map((_, index) => (
                      <div
                        key={`empty-${index}`}
                        className="bg-black/20 border-2 border-gray-600/30 rounded-xl p-4 text-center"
                      >
                        <div className="text-lg font-bold text-gray-500">
                          {(feudAnswers || []).length + index + 1}. [Empty]
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Feud Game Controls */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button
                      onClick={async () => {
                        try {
                          await apiService.resetFeudAnswers(currentQuestion.id);
                          setRevealedFeudAnswers(new Set());
                        } catch (error) {
                          console.error('Failed to reset feud answers:', error);
                        }
                      }}
                      className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors border border-yellow-400/50"
                    >
                      Reset All Answers
                    </button>
                    
                    <button
                      onClick={() => apiService.addFeudStrike()}
                      disabled={(gameState?.feudState?.strikes || 0) >= 3}
                      className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-semibold transition-colors border border-red-400/50"
                    >
                      Add Strike ({gameState?.feudState?.strikes || 0}/3)
                    </button>
                    
                    <button
                      onClick={() => apiService.removeFeudStrike()}
                      disabled={(gameState?.feudState?.strikes || 0) <= 0}
                      className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-semibold transition-colors border border-gray-400/50"
                    >
                      Remove Strike
                    </button>
                  </div>
                </div>
                
                {/* Player Submission Review Panel for Feud Questions */}
                {currentQuestion && (currentQuestion.type || 'multiple_choice') === 'feud' && (
                  <div className="mt-8 bg-orange-900/20 border-2 border-orange-400/50 rounded-2xl p-6">
                    <h4 className="text-xl font-bold text-orange-300 mb-4">📝 Player Submissions</h4>
                    
                    {questionAnswers && questionAnswers.length > 0 ? (
                      <div className="space-y-3">
                        {questionAnswers
                          .filter(pa => pa.selected_answer && pa.selected_answer.trim())
                          .map((answer, index) => {
                          const player = players.find(p => p.id === answer.player_id);
                          console.log('🎪 Feud player lookup:', {
                            answer_player_id: answer.player_id,
                            answer_player_id_type: typeof answer.player_id,
                            players_ids: players.map(p => ({ id: p.id, name: p.name, type: typeof p.id })),
                            found_player: player
                          });
                          return (
                          <div key={answer.id || index} className="bg-black/30 border border-orange-400/30 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-3 mb-2">
                                  <span className="text-orange-200 font-medium">
                                    {player?.name || `Player ${answer.player_id}`}
                                  </span>
                                  {gameSettings?.team_mode && answer.team_id && (
                                    <span className="text-xs px-2 py-1 bg-blue-600/20 text-blue-300 rounded-full">
                                      Team: {teams.find(t => t.id === answer.team_id)?.name}
                                    </span>
                                  )}
                                </div>
                                <div className="text-white text-lg font-medium mb-3">
                                  "{answer.selected_answer}"
                                </div>
                                
                                {/* Match with Feud Answer */}
                                <div className="flex items-center space-x-2 mb-3">
                                  <label className="text-sm text-orange-300">Match with board answer:</label>
                                  <select 
                                    className="px-3 py-1 bg-black/40 border border-orange-400/30 rounded-lg text-white text-sm"
                                    onChange={async (e) => {
                                      const feudAnswerId = parseInt(e.target.value);
                                      if (feudAnswerId && currentQuestion.id) {
                                        try {
                                          // Reveal the matched feud answer
                                          await apiService.revealFeudAnswer(currentQuestion.id, feudAnswerId);
                                          setRevealedFeudAnswers(prev => new Set([...prev, feudAnswerId]));
                                          
                                          // Award points for the correct answer
                                          const feudAnswer = feudAnswers?.find(fa => fa.id === feudAnswerId);
                                          if (feudAnswer) {
                                            const teamId = gameSettings?.team_mode && answer.team_id ? answer.team_id : null;
                                            await apiService.awardFeudPoints(
                                              currentQuestion.id, 
                                              answer.player_id, 
                                              teamId, 
                                              feudAnswerId, 
                                              feudAnswer.points
                                            );
                                          }
                                        } catch (error) {
                                          console.error('Failed to process feud answer match:', error);
                                        }
                                      }
                                    }}
                                  >
                                    <option value="">Select matching answer...</option>
                                    {(feudAnswers || []).map(feudAnswer => (
                                      <option key={feudAnswer.id} value={feudAnswer.id}>
                                        {feudAnswer.answer_text} ({feudAnswer.points} pts)
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              
                              {/* Action Buttons */}
                              <div className="flex space-x-2">
                                <button
                                  onClick={async () => {
                                    // Mark as incorrect and add strike
                                    apiService.addFeudStrike();
                                    
                                    // If buzzer mode is enabled, move to next buzzer in queue
                                    if (gameSettings?.buzzer_enabled && buzzerResponses.length > 1) {
                                      // Remove the first (incorrect) buzzer response
                                      setBuzzerResponses(prev => prev.slice(1));
                                      
                                      // Clear the current player's answer so next player can answer
                                      try {
                                        const currentQuestion = filteredQuestions[gameState.currentSlide];
                                        if (currentQuestion?.id) {
                                          await clearQuestionAnswers(currentQuestion.id);
                                        }
                                      } catch (error) {
                                        console.error('Failed to clear answers for next buzzer:', error);
                                      }
                                    }
                                  }}
                                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors border border-red-400/50"
                                >
                                  ✗ Wrong Answer {gameSettings?.buzzer_enabled && buzzerResponses.length > 1 ? '(Next Buzzer)' : '(+Strike)'}
                                </button>
                              </div>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <p className="text-orange-300">No player submissions yet. Players can type their answers below the feud board.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Answer Explanation - Always visible in host mode (hide for feud questions) */}
            {currentQuestion && (currentQuestion.type || 'multiple_choice') !== 'feud' && (
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
            )}

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

              {/* Hide Show Answer button for feud questions since they are revealed individually */}
              {currentQuestion && (currentQuestion.type || 'multiple_choice') !== 'feud' && (
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
              )}

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
                              {(() => {
                                const multiplier = gameSettings?.score_multiplier || 10;
                                const quarterPoints = Math.round(multiplier * 0.25);
                                const halfPoints = Math.round(multiplier * 0.5);
                                const threeQuarterPoints = Math.round(multiplier * 0.75);
                                const fullPoints = multiplier;
                                
                                const selectedPoints = pendingPointsSelections[playerAnswer.id];

                                return (
                                  <>
                                    <button
                                      onClick={() => {
                                        console.log(`🔴 +${quarterPoints} Point(s) button clicked for player`, playerAnswer.id);
                                        handleAwardPoints(playerAnswer.id, quarterPoints);
                                      }}
                                      className={`flex-1 py-2 px-3 rounded-lg font-semibold transition-colors text-sm ${
                                        selectedPoints === quarterPoints 
                                          ? 'bg-emerald-800 border-2 border-emerald-300 text-emerald-200' 
                                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                      }`}
                                    >
                                      +{quarterPoints} Pt{quarterPoints !== 1 ? 's' : ''}
                                      {selectedPoints === quarterPoints && ' ✓'}
                                    </button>
                                    <button
                                      onClick={() => {
                                        console.log(`🟡 +${halfPoints} Points button clicked for player`, playerAnswer.id);
                                        handleAwardPoints(playerAnswer.id, halfPoints);
                                      }}
                                      className={`flex-1 py-2 px-3 rounded-lg font-semibold transition-colors text-sm ${
                                        selectedPoints === halfPoints 
                                          ? 'bg-amber-800 border-2 border-amber-300 text-amber-200' 
                                          : 'bg-amber-600 hover:bg-amber-700 text-white'
                                      }`}
                                    >
                                      +{halfPoints} Pt{halfPoints !== 1 ? 's' : ''}
                                      {selectedPoints === halfPoints && ' ✓'}
                                    </button>
                                    <button
                                      onClick={() => {
                                        console.log(`🟣 +${threeQuarterPoints} Points button clicked for player`, playerAnswer.id);
                                        handleAwardPoints(playerAnswer.id, threeQuarterPoints);
                                      }}
                                      className={`flex-1 py-2 px-3 rounded-lg font-semibold transition-colors text-sm ${
                                        selectedPoints === threeQuarterPoints 
                                          ? 'bg-purple-800 border-2 border-purple-300 text-purple-200' 
                                          : 'bg-purple-600 hover:bg-purple-700 text-white'
                                      }`}
                                    >
                                      +{threeQuarterPoints} Pt{threeQuarterPoints !== 1 ? 's' : ''}
                                      {selectedPoints === threeQuarterPoints && ' ✓'}
                                    </button>
                                    <button
                                      onClick={() => {
                                        console.log(`💎 +${fullPoints} Points button clicked for player`, playerAnswer.id);
                                        handleAwardPoints(playerAnswer.id, fullPoints);
                                      }}
                                      className={`flex-1 py-2 px-3 rounded-lg font-semibold transition-colors text-sm ${
                                        selectedPoints === fullPoints 
                                          ? 'bg-indigo-800 border-2 border-indigo-300 text-indigo-200' 
                                          : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                      }`}
                                    >
                                      +{fullPoints} Pt{fullPoints !== 1 ? 's' : ''}
                                      {selectedPoints === fullPoints && ' ✓'}
                                    </button>
                                  </>
                                );
                              })()}
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