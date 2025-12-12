const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});

const io = new Server(server, { 
  cors: { origin: "*" } 
});

io.on('connection', (socket) => {
  console.log('Client connected');
  
  // Relay specific events to all other clients
  ['productChange', 'billChange', 'userChange'].forEach(event => {
    socket.on(event, (data) => {
      socket.broadcast.emit(event, data);
    });
  });
});
