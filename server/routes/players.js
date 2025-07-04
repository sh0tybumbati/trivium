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

  // Join game (register player)
  router.post('/join', (req, res) => {
    const { name } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Player name is required' });
    }

    const playerName = name.trim();

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
      db.addPlayer(playerName, (err, player) => {
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