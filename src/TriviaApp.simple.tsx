import React from 'react';

const TriviaApp = () => {
  return (
    <div style={{ padding: '20px', background: '#000', color: '#fff', minHeight: '100vh' }}>
      <h1>Trivia App - Simple Test</h1>
      <p>If you can see this, React is working!</p>
      <div>
        <h2>Server Connection Test</h2>
        <button onClick={() => {
          fetch('/api/health')
            .then(r => r.json())
            .then(data => alert(`Server Status: ${data.status}`))
            .catch(err => alert(`Error: ${err.message}`));
        }}>
          Test Server Connection
        </button>
      </div>
    </div>
  );
};

export default TriviaApp;