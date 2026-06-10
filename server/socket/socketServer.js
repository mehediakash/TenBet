const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

class SocketServer {
  constructor(server) {
    this.io = socketIO(server, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      }
    });
    
    this.connectedUsers = new Map();
    this.setupMiddleware();
    this.setupEventHandlers();
  }

  // Setup JWT authentication middleware
  setupMiddleware() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
          return next(new Error('Authentication error: No token provided'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user || !user.isActive || user.isBlocked) {
          return next(new Error('Authentication error: User not found or inactive'));
        }

        socket.userId = user._id;
        socket.user = user;
        next();
      } catch (error) {
        next(new Error('Authentication error: Invalid token'));
      }
    });
  }

  // Setup event handlers
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`User ${socket.userId} connected`);
      
      // Add user to connected users map
      this.connectedUsers.set(socket.userId, socket.id);

      // Join user to their personal room
      socket.join(`user_${socket.userId}`);
      
      // Join user to appropriate rooms based on role
      if (socket.user.role !== 'user') {
        socket.join(`agents_${socket.user.role}`);
      }

      // Handle live score subscriptions
      this.handleLiveScores(socket);

      // Handle notification subscriptions
      this.handleNotifications(socket);

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`User ${socket.userId} disconnected`);
        this.connectedUsers.delete(socket.userId);
      });

      // Handle errors
      socket.on('error', (error) => {
        console.error(`Socket error for user ${socket.userId}:`, error);
      });
    });
  }

  // Handle live score subscriptions
  handleLiveScores(socket) {
    socket.on('subscribe_live_scores', (sports) => {
      if (Array.isArray(sports)) {
        sports.forEach(sport => {
          socket.join(`live_scores_${sport}`);
          console.log(`User ${socket.userId} subscribed to ${sport} live scores`);
        });
      }
    });

    socket.on('unsubscribe_live_scores', (sports) => {
      if (Array.isArray(sports)) {
        sports.forEach(sport => {
          socket.leave(`live_scores_${sport}`);
          console.log(`User ${socket.userId} unsubscribed from ${sport} live scores`);
        });
      }
    });
  }

  // Handle notification subscriptions
  handleNotifications(socket) {
    socket.on('subscribe_notifications', () => {
      socket.join(`notifications_${socket.userId}`);
    });

    socket.on('unsubscribe_notifications', () => {
      socket.leave(`notifications_${socket.userId}`);
    });
  }

  // Send notification to specific user
  sendToUser(userId, event, data) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).emit(event, data);
    }
  }

  // Send notification to user room
  sendToUserRoom(userId, event, data) {
    this.io.to(`user_${userId}`).emit(event, data);
  }

  // Broadcast to all connected users
  broadcast(event, data) {
    this.io.emit(event, data);
  }

  // Send to specific room
  sendToRoom(room, event, data) {
    this.io.to(room).emit(event, data);
  }

  // Update live scores
  updateLiveScores(sport, scores) {
    this.io.to(`live_scores_${sport}`).emit('live_scores_update', {
      sport,
      scores,
      timestamp: new Date()
    });
  }

  // Send notification
  sendNotification(userId, notification) {
    this.sendToUserRoom(userId, 'new_notification', notification);
  }

  // Update user balance in real-time
  updateUserBalance(userId, balance) {
    this.sendToUserRoom(userId, 'balance_update', {
      balance,
      timestamp: new Date()
    });
  }

  // Get connected users count
  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }

  // Get connected users list
  getConnectedUsers() {
    return Array.from(this.connectedUsers.keys());
  }
}

module.exports = SocketServer;