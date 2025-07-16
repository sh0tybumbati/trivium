const express = require('express');
const router = express.Router();

module.exports = (db, wss) => {
  // Get all teams
  router.get('/', (req, res) => {
    db.getAllTeams((err, teams) => {
      if (err) {
        console.error('Error fetching teams:', err);
        return res.status(500).json({ error: 'Failed to fetch teams' });
      }
      res.json(teams);
    });
  });

  // Create new team
  router.post('/', (req, res) => {
    const { name, color } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Team name is required' });
    }

    const teamName = name.trim();
    const teamColor = color || '#3B82F6';

    db.createTeam(teamName, teamColor, (err, team) => {
      if (err) {
        console.error('Error creating team:', err);
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Team name already exists' });
        }
        return res.status(500).json({ error: 'Failed to create team' });
      }

      // Broadcast team created event to all WebSocket clients
      if (wss) {
        const message = JSON.stringify({
          type: 'team_created',
          team: team
        });
        
        wss.clients.forEach(client => {
          if (client.readyState === client.OPEN) {
            client.send(message);
          }
        });
      }

      res.status(201).json(team);
    });
  });

  // Join team
  router.post('/:id/join', (req, res) => {
    const teamId = parseInt(req.params.id);
    const { playerId } = req.body;

    if (isNaN(teamId)) {
      return res.status(400).json({ error: 'Invalid team ID' });
    }

    if (!playerId || isNaN(parseInt(playerId))) {
      return res.status(400).json({ error: 'Valid player ID is required' });
    }

    db.joinTeam(parseInt(playerId), teamId, (err) => {
      if (err) {
        console.error('Error joining team:', err);
        return res.status(400).json({ error: err.message || 'Failed to join team' });
      }

      // Broadcast team joined event to all WebSocket clients
      if (wss) {
        const message = JSON.stringify({
          type: 'team_joined',
          playerId: parseInt(playerId),
          teamId: teamId
        });
        
        wss.clients.forEach(client => {
          if (client.readyState === client.OPEN) {
            client.send(message);
          }
        });
      }

      res.json({ success: true, message: 'Successfully joined team' });
    });
  });

  // Leave team
  router.post('/leave', (req, res) => {
    const { playerId } = req.body;

    if (!playerId || isNaN(parseInt(playerId))) {
      return res.status(400).json({ error: 'Valid player ID is required' });
    }

    db.leaveTeam(parseInt(playerId), (err) => {
      if (err) {
        console.error('Error leaving team:', err);
        return res.status(500).json({ error: 'Failed to leave team' });
      }

      // Broadcast team left event to all WebSocket clients
      if (wss) {
        const message = JSON.stringify({
          type: 'team_left',
          playerId: parseInt(playerId)
        });
        
        wss.clients.forEach(client => {
          if (client.readyState === client.OPEN) {
            client.send(message);
          }
        });
      }

      res.json({ success: true, message: 'Successfully left team' });
    });
  });

  // Get team by ID
  router.get('/:id', (req, res) => {
    const teamId = parseInt(req.params.id);

    if (isNaN(teamId)) {
      return res.status(400).json({ error: 'Invalid team ID' });
    }

    db.getTeamById(teamId, (err, team) => {
      if (err) {
        console.error('Error fetching team:', err);
        return res.status(500).json({ error: 'Failed to fetch team' });
      }

      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      res.json(team);
    });
  });

  // Update team score
  router.put('/:id/score', (req, res) => {
    const teamId = parseInt(req.params.id);
    const { score } = req.body;

    if (isNaN(teamId) || typeof score !== 'number') {
      return res.status(400).json({ error: 'Invalid team ID or score' });
    }

    db.updateTeamScore(teamId, score, (err) => {
      if (err) {
        console.error('Error updating team score:', err);
        return res.status(500).json({ error: 'Failed to update team score' });
      }

      // Broadcast team score update to all WebSocket clients
      if (wss) {
        const message = JSON.stringify({
          type: 'team_score_updated',
          teamId: teamId,
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

  // Delete team
  router.delete('/:id', (req, res) => {
    const teamId = parseInt(req.params.id);

    if (isNaN(teamId)) {
      return res.status(400).json({ error: 'Invalid team ID' });
    }

    db.deleteTeam(teamId, (err) => {
      if (err) {
        console.error('Error deleting team:', err);
        return res.status(500).json({ error: 'Failed to delete team' });
      }

      // Broadcast team deleted event to all WebSocket clients
      if (wss) {
        const message = JSON.stringify({
          type: 'team_deleted',
          teamId: teamId
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

  // Clear all teams
  router.delete('/clear', (req, res) => {
    db.clearAllTeams((err) => {
      if (err) {
        console.error('Error clearing teams:', err);
        return res.status(500).json({ error: 'Failed to clear teams' });
      }

      // Broadcast teams cleared event to all WebSocket clients
      if (wss) {
        const message = JSON.stringify({
          type: 'teams_cleared'
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