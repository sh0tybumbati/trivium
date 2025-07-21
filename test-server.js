// Simple test to verify server binding behavior
const http = require('http');

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? undefined : '0.0.0.0');

console.log('Testing server binding...');
console.log('PORT:', PORT);
console.log('HOST:', HOST);
console.log('NODE_ENV:', process.env.NODE_ENV);

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', test: true }));
});

if (HOST) {
  server.listen(PORT, HOST, () => {
    console.log(`✅ Test server running on http://${HOST}:${PORT}`);
    setTimeout(() => {
      console.log('✅ Test completed - shutting down');
      server.close();
    }, 2000);
  });
} else {
  server.listen(PORT, () => {
    console.log(`✅ Test server running on port ${PORT} (production mode)`);
    setTimeout(() => {
      console.log('✅ Test completed - shutting down');
      server.close();
    }, 2000);
  });
}

server.on('error', (err) => {
  console.error('❌ Test server failed:', err);
  process.exit(1);
});