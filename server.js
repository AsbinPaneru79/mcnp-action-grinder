const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const BotManager = require('./botManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const CONFIG_PATH = path.join(__dirname, 'config.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Bot Manager
const botManager = new BotManager(CONFIG_PATH, (eventType, data) => {
  io.emit(eventType, data);
});

// REST API Endpoints
app.get('/api/status', (req, res) => {
  res.json(botManager.getStatus());
});

app.post('/api/start', (req, res) => {
  botManager.start();
  res.json({ success: true, message: 'Bot started' });
});

app.post('/api/stop', (req, res) => {
  botManager.stop();
  res.json({ success: true, message: 'Bot stopped' });
});

app.post('/api/rerun', (req, res) => {
  const result = botManager.rerunRoutine();
  res.json(result);
});

app.post('/api/chat', (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ success: false, error: 'Message is required' });
  }
  const result = botManager.sendChat(message);
  res.json(result);
});

app.get('/api/config', (req, res) => {
  res.json(botManager.config);
});

app.post('/api/config', (req, res) => {
  const newConfig = req.body;
  const result = botManager.saveConfig(newConfig);
  if (result.success) {
    io.emit('config_updated', botManager.config);
    res.json({ success: true, config: botManager.config });
  } else {
    res.status(500).json({ success: false, error: result.error });
  }
});

// Socket.IO Events
io.on('connection', (socket) => {
  // Send current state and recent logs on connection
  socket.emit('init', botManager.getStatus());

  socket.on('send_chat', (msg) => {
    botManager.sendChat(msg);
  });

  socket.on('start_bot', () => {
    botManager.start();
  });

  socket.on('stop_bot', () => {
    botManager.stop();
  });

  socket.on('save_config', (cfg) => {
    botManager.saveConfig(cfg);
    io.emit('config_updated', botManager.config);
  });
});

// Start web server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`  MCNP Action Grinder - AFK Bot Dashboard`);
  console.log(`  Server listening on: http://0.0.0.0:${PORT}`);
  console.log(`  Railway Port: ${PORT}`);
  console.log(`===============================================`);

  // Auto-start bot on boot if desired
  botManager.start();
});
