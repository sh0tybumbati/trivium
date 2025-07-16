const express = require('express');
const router = express.Router();

module.exports = (db, wss) => {
  // Get all players
  router.get('/', (req, res) => {
    db.getAllPlayers((err, players) => {
      if (err) {
        console.error('Error fetching players:', err);
        return res.status(500).json({ error: 'Failed to fetch players' });
      }
      res.json(players);
    });
  });

  // Unified join/login endpoint - creates player if doesn't exist, logs in if exists
  router.post('/join-or-login', (req, res) => {
    const { name, password } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Player name is required' });
    }

    if (!password || password.trim().length === 0) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const playerName = name.trim();

    // First, try to authenticate existing player
    db.authenticatePlayer(playerName, password, (err, existingPlayer) => {
      if (err) {
        console.error('Error checking authentication:', err);
        return res.status(500).json({ error: 'Failed to authenticate' });
      }

      if (existingPlayer) {
        // Player exists and password is correct - log them in
        db.updatePlayerConnection(existingPlayer.id, true, (connErr) => {
          if (connErr) {
            console.error('Error updating player connection:', connErr);
            return res.status(500).json({ error: 'Failed to update connection status' });
          }

          // Broadcast player reconnected event
          if (wss) {
            const message = JSON.stringify({
              type: 'player_reconnected',
              player: { ...existingPlayer, connected: true }
            });
            
            wss.clients.forEach(client => {
              if (client.readyState === client.OPEN) {
                client.send(message);
              }
            });
          }

          res.json({ ...existingPlayer, connected: true });
        });
      } else {
        // Player doesn't exist or password doesn't match - check if name is taken
        db.getPlayerByName(playerName, (nameErr, playerWithName) => {
          if (nameErr) {
            console.error('Error checking player name:', nameErr);
            return res.status(500).json({ error: 'Failed to check player name' });
          }

          if (playerWithName) {
            // Name exists but password doesn't match
            return res.status(401).json({ error: 'Invalid password for this name' });
          }

          // Name doesn't exist - create new player
          db.addPlayer(playerName, password, (addErr, newPlayer) => {
            if (addErr) {
              console.error('Error adding player:', addErr);
              return res.status(500).json({ error: 'Failed to add player' });
            }

            // Broadcast player joined event
            if (wss) {
              const message = JSON.stringify({
                type: 'player_joined',
                player: newPlayer
              });
              
              wss.clients.forEach(client => {
                if (client.readyState === client.OPEN) {
                  client.send(message);
                }
              });
            }

            res.status(201).json(newPlayer);
          });
        });
      }
    });
  });

  // Join game (register player)
  router.post('/join', (req, res) => {
    const { name, password } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Player name is required' });
    }

    if (!password || password.trim().length === 0) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const playerName = name.trim();

    // Check game settings for player join timeout
    db.getGameSettings((err, settings) => {
      if (err) {
        console.error('Error getting game settings:', err);
        return res.status(500).json({ error: 'Failed to check game settings' });
      }

      // Check if player joining is allowed based on timeout setting
      if (settings && settings.player_join_timeout > 0) {
        // Get game state to check if game is running and when it started
        // This is a simplified check - in practice you might want more sophisticated timing
        const gameState = require('../gameState'); // You might need to pass this as parameter
        // For now, we'll implement a basic check that players can only join before game starts
        // or within the timeout window after starting
        
        // TODO: Implement more sophisticated join window logic if needed
        // For now, allow joining at any time and let the host control this via settings UI
      }

      // Check if player name already exists
      db.getPlayerByName(playerName, (err, existingPlayer) => {
        if (err) {
          console.error('Error checking existing player:', err);
          return res.status(500).json({ error: 'Failed to check player name' });
        }

        if (existingPlayer) {
          return res.status(400).json({ error: 'Player name already taken' });
        }

        // Add new player
        db.addPlayer(playerName, password, (err, player) => {
          if (err) {
            console.error('Error adding player:', err);
            return res.status(500).json({ error: 'Failed to add player' });
          }

          // Broadcast player joined event to all WebSocket clients
          if (wss) {
            const message = JSON.stringify({
              type: 'player_joined',
              player: player
            });
            
            wss.clients.forEach(client => {
              if (client.readyState === client.OPEN) {
                client.send(message);
              }
            });
          }

          res.status(201).json(player);
        });
      });
    });
  });

  // Login existing player
  router.post('/login', (req, res) => {
    const { name, password } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Player name is required' });
    }

    if (!password || password.trim().length === 0) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const playerName = name.trim();

    // Authenticate player
    db.authenticatePlayer(playerName, password, (err, player) => {
      if (err) {
        console.error('Error authenticating player:', err);
        return res.status(500).json({ error: 'Failed to authenticate player' });
      }

      if (!player) {
        return res.status(401).json({ error: 'Invalid name or password' });
      }

      // Update player as connected
      db.updatePlayerConnection(player.id, true, (err) => {
        if (err) {
          console.error('Error updating player connection:', err);
          return res.status(500).json({ error: 'Failed to update connection status' });
        }

        // Broadcast player reconnected event to all WebSocket clients
        if (wss) {
          const message = JSON.stringify({
            type: 'player_reconnected',
            player: { ...player, connected: true }
          });
          
          wss.clients.forEach(client => {
            if (client.readyState === client.OPEN) {
              client.send(message);
            }
          });
        }

        res.json({ ...player, connected: true });
      });
    });
  });

  // Update player score
  router.put('/:id/score', (req, res) => {
    const playerId = parseInt(req.params.id);
    const { score } = req.body;

    if (isNaN(playerId) || typeof score !== 'number') {
      return res.status(400).json({ error: 'Invalid player ID or score' });
    }

    db.updatePlayerScore(playerId, score, (err) => {
      if (err) {
        console.error('Error updating player score:', err);
        return res.status(500).json({ error: 'Failed to update player score' });
      }

      // Broadcast score update to all WebSocket clients
      if (wss) {
        const message = JSON.stringify({
          type: 'player_score_updated',
          playerId: playerId,
          score: score
        });
        
        wss.clients.forEach(client => {
          if (client.readyState === client.OPEN) {
            client.send(message);
          }
        });
      }

      res.json({ success: true });
    });
  });

  // Update player connection status
  router.put('/:id/connection', (req, res) => {
    const playerId = parseInt(req.params.id);
    const { connected } = req.body;

    if (isNaN(playerId) || typeof connected !== 'boolean') {
      return res.status(400).json({ error: 'Invalid player ID or connection status' });
    }

    db.updatePlayerConnection(playerId, connected, (err) => {
      if (err) {
        console.error('Error updating player connection:', err);
        return res.status(500).json({ error: 'Failed to update player connection' });
      }

      // Broadcast connection update to all WebSocket clients
      if (wss) {
        const message = JSON.stringify({
          type: 'player_connection_updated',
          playerId: playerId,
          connected: connected
        });
        
        wss.clients.forEach(client => {
          if (client.readyState === client.OPEN) {
            client.send(message);
          }
        });
      }

      res.json({ success: true });
    });
  });

  // Reset individual player score
  router.put('/:id/reset-score', (req, res) => {
    const playerId = parseInt(req.params.id);

    if (isNaN(playerId)) {
      return res.status(400).json({ error: 'Invalid player ID' });
    }

    db.updatePlayerScore(playerId, 0, (err) => {
      if (err) {
        console.error('Error resetting player score:', err);
        return res.status(500).json({ error: 'Failed to reset player score' });
      }

      // Broadcast score reset to all WebSocket clients
      if (wss) {
        const message = JSON.stringify({
          type: 'player_score_updated',
          playerId: playerId,
          score: 0
        });
        
        wss.clients.forEach(client => {
          if (client.readyState === client.OPEN) {
            client.send(message);
          }
        });
      }

      res.json({ success: true });
    });
  });

  // Reset all player scores
  router.put('/reset-all-scores', (req, res) => {
    // First get all players, then reset each one
    db.getAllPlayers((err, players) => {
      if (err) {
        console.error('Error getting players for score reset:', err);
        return res.status(500).json({ error: 'Failed to reset scores' });
      }

      if (players.length === 0) {
        return res.json({ success: true, message: 'No players to reset' });
      }

      // Reset each player's score to 0
      let completed = 0;
      let hasError = false;

      players.forEach(player => {
        db.updatePlayerScore(player.id, 0, (err) => {
          if (err && !hasError) {
            hasError = true;
            console.error('Error resetting player score:', err);
            return res.status(500).json({ error: 'Failed to reset some scores' });
          }

          completed++;
          if (completed === players.length && !hasError) {
            // Broadcast scores reset to all WebSocket clients
            if (wss) {
              const message = JSON.stringify({
                type: 'all_scores_reset'
              });
              
              wss.clients.forEach(client => {
                if (client.readyState === client.OPEN) {
                  client.send(message);
                }
              });
            }

            res.json({ success: true });
          }
        });
      });
    });
  });

  // Change player password
  router.put('/:id/change-password', (req, res) => {
    const playerId = parseInt(req.params.id);
    const { oldPassword, newPassword } = req.body;

    if (isNaN(playerId)) {
      return res.status(400).json({ error: 'Invalid player ID' });
    }

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Old password and new password are required' });
    }

    if (newPassword.length < 1) {
      return res.status(400).json({ error: 'New password must be at least 1 character long' });
    }

    db.changePlayerPassword(playerId, oldPassword, newPassword, (err, success) => {
      if (err) {
        console.error('Error changing player password:', err);
        return res.status(400).json({ error: err.message });
      }

      if (success) {
        res.json({ success: true, message: 'Password changed successfully' });
      } else {
        res.status(400).json({ error: 'Failed to change password' });
      }
    });
  });

  // Reset player password (host only)
  router.put('/:id/reset-password', (req, res) => {
    const playerId = parseInt(req.params.id);
    const { newPassword } = req.body;

    if (isNaN(playerId)) {
      return res.status(400).json({ error: 'Invalid player ID' });
    }

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    if (newPassword.length < 1) {
      return res.status(400).json({ error: 'New password must be at least 1 character long' });
    }

    db.resetPlayerPassword(playerId, newPassword, (err, success) => {
      if (err) {
        console.error('Error resetting player password:', err);
        return res.status(500).json({ error: 'Failed to reset password' });
      }

      if (success) {
        // Broadcast password reset event to all WebSocket clients
        if (wss) {
          const message = JSON.stringify({
            type: 'player_password_reset',
            playerId: playerId
          });
          
          wss.clients.forEach(client => {
            if (client.readyState === client.OPEN) {
              client.send(message);
            }
          });
        }

        res.json({ success: true, message: 'Password reset successfully' });
      } else {
        res.status(400).json({ error: 'Failed to reset password' });
      }
    });
  });

  // Clear all players
  router.delete('/clear', (req, res) => {
    db.clearAllPlayers((err) => {
      if (err) {
        console.error('Error clearing players:', err);
        return res.status(500).json({ error: 'Failed to clear players' });
      }

      // Broadcast players cleared event to all WebSocket clients
      if (wss) {
        const message = JSON.stringify({
          type: 'players_cleared'
        });
        
        wss.clients.forEach(client => {
          if (client.readyState === client.OPEN) {
            client.send(message);
          }
        });
      }

      res.json({ success: true });
    });
  });

  return router;
};