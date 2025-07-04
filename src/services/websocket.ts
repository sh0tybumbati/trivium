// WebSocket service for real-time communication with the server

interface GameState {
  gameStarted: boolean;
  firstQuestionStarted: boolean;
  currentSlide: number;
  showAnswer: boolean;
  timer: number;
  isTimerRunning: boolean;
  selectedCategories: string[];
  questionLimit: number | null;
  timeLimit: number;
  timedRounds: boolean;
  gameTitle: string;
  gameSubtitle: string;
  showQuestionCounter: boolean;
  showWaitScreen: boolean;
}

interface WebSocketMessage {
  type: string;
  state?: GameState;
  action?: string;
  payload?: any;
  question?: any;
  questionId?: number;
  count?: number;
}

type MessageHandler = (message: WebSocketMessage) => void;
type StateUpdateHandler = (state: GameState) => void;
type ConnectionHandler = (connected: boolean) => void;
type QuestionsUpdateHandler = (action: string, data?: any) => void;
type PlayersUpdateHandler = (action: string, data?: any) => void;
type AnswersUpdateHandler = (action: string, data?: any) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10; // Increased from 5 to 10
  private reconnectInterval = 2000; // Increased from 1000 to 2000
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private isConnected = false;

  private messageHandlers: MessageHandler[] = [];
  private stateUpdateHandlers: StateUpdateHandler[] = [];
  private connectionHandlers: ConnectionHandler[] = [];
  private questionsUpdateHandlers: QuestionsUpdateHandler[] = [];
  private playersUpdateHandlers: PlayersUpdateHandler[] = [];
  private answersUpdateHandlers: AnswersUpdateHandler[] = [];

  constructor() {
    this.connect();
  }

  private getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const isProduction = host !== 'localhost' && host !== '127.0.0.1';
    
    if (isProduction) {
      // Production: same domain as frontend
      return `${protocol}//${window.location.host}`;
    } else {
      // Development: backend on port 3001
      return `${protocol}//${host}:3001`;
    }
  }

  connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      this.ws = new WebSocket(this.getWebSocketUrl());
      
      this.ws.onopen = () => {
        console.log('🔗 WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.notifyConnectionHandlers(true);
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        this.isConnected = false;
        this.notifyConnectionHandlers(false);
        this.stopPing();
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.isConnected = false;
        this.notifyConnectionHandlers(false);
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.scheduleReconnect();
    }
  }

  private handleMessage(message: WebSocketMessage): void {
    // Notify all message handlers
    this.messageHandlers.forEach(handler => handler(message));

    // Handle specific message types
    switch (message.type) {
      case 'GAME_STATE_UPDATE':
        if (message.state) {
          this.notifyStateUpdateHandlers(message.state);
        }
        break;

      case 'QUESTIONS_UPDATED':
        this.notifyQuestionsUpdateHandlers(message.action || 'UNKNOWN', {
          questionId: message.questionId,
          question: message.question,
          count: message.count
        });
        break;

      case 'player_joined':
      case 'player_score_updated':
      case 'player_connection_updated':
      case 'players_cleared':
      case 'all_scores_reset':
        this.notifyPlayersUpdateHandlers(message.type, message.payload);
        break;

      case 'player_answer_submitted':
      case 'answers_cleared':
      case 'all_answers_cleared':
        console.log(`🔔 WebSocket received ${message.type}:`, message.payload);
        this.notifyAnswersUpdateHandlers(message.type, message.payload);
        break;

      case 'PONG':
        // Server responded to ping
        break;

      default:
        console.log('Unhandled WebSocket message type:', message.type);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1);
      
      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.isConnected) {
        this.send({ type: 'PING' });
      }
    }, 30000); // Ping every 30 seconds
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
      }
    } else {
      console.warn('WebSocket not connected, message not sent:', message);
    }
  }

  // Game actions
  sendGameAction(action: string, payload?: any): void {
    this.send({
      type: 'GAME_ACTION',
      action,
      payload
    });
  }

  updateState(state: Partial<GameState>): void {
    this.send({
      type: 'UPDATE_STATE',
      state
    });
  }

  // Event handlers
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.push(handler);
    return () => {
      const index = this.messageHandlers.indexOf(handler);
      if (index > -1) {
        this.messageHandlers.splice(index, 1);
      }
    };
  }

  onStateUpdate(handler: StateUpdateHandler): () => void {
    this.stateUpdateHandlers.push(handler);
    return () => {
      const index = this.stateUpdateHandlers.indexOf(handler);
      if (index > -1) {
        this.stateUpdateHandlers.splice(index, 1);
      }
    };
  }

  onConnection(handler: ConnectionHandler): () => void {
    this.connectionHandlers.push(handler);
    return () => {
      const index = this.connectionHandlers.indexOf(handler);
      if (index > -1) {
        this.connectionHandlers.splice(index, 1);
      }
    };
  }

  onQuestionsUpdate(handler: QuestionsUpdateHandler): () => void {
    this.questionsUpdateHandlers.push(handler);
    return () => {
      const index = this.questionsUpdateHandlers.indexOf(handler);
      if (index > -1) {
        this.questionsUpdateHandlers.splice(index, 1);
      }
    };
  }

  onPlayersUpdate(handler: PlayersUpdateHandler): () => void {
    this.playersUpdateHandlers.push(handler);
    return () => {
      const index = this.playersUpdateHandlers.indexOf(handler);
      if (index > -1) {
        this.playersUpdateHandlers.splice(index, 1);
      }
    };
  }

  onAnswersUpdate(handler: AnswersUpdateHandler): () => void {
    this.answersUpdateHandlers.push(handler);
    return () => {
      const index = this.answersUpdateHandlers.indexOf(handler);
      if (index > -1) {
        this.answersUpdateHandlers.splice(index, 1);
      }
    };
  }

  private notifyStateUpdateHandlers(state: GameState): void {
    this.stateUpdateHandlers.forEach(handler => handler(state));
  }

  private notifyConnectionHandlers(connected: boolean): void {
    this.connectionHandlers.forEach(handler => handler(connected));
  }

  private notifyQuestionsUpdateHandlers(action: string, data?: any): void {
    this.questionsUpdateHandlers.forEach(handler => handler(action, data));
  }

  private notifyPlayersUpdateHandlers(action: string, data?: any): void {
    this.playersUpdateHandlers.forEach(handler => handler(action, data));
  }

  private notifyAnswersUpdateHandlers(action: string, data?: any): void {
    this.answersUpdateHandlers.forEach(handler => handler(action, data));
  }

  // Utility methods
  getConnectionState(): boolean {
    return this.isConnected;
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopPing();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.notifyConnectionHandlers(false);
  }
}

export default new WebSocketService();
export type { GameState, WebSocketMessage };