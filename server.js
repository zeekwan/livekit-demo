// Basic Express server to serve static files for local development
const express = require('express');
const cors = require('cors');
const path = require('path');
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');
require('dotenv').config();

// Create a RoomService client to check room status
const roomService = new RoomServiceClient(
  process.env.LIVEKIT_WS_URL,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
);

// For room participants
const createRoomToken = async (roomName, participantName) => {
  const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity: participantName,
    ttl: '10m',
  });
  at.addGrant({ 
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true
  });

  return await at.toJwt();
};

// For analytics/dashboard visibility
const createAnalyticsToken = async () => {
  const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    ttl: '24h',
    name: 'analytics'
  });
  at.addGrant({ roomList: true });

  return await at.toJwt();
};

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// LiveKit token generation endpoint
app.post('/get-token', async (req, res) => {
  const { roomName, participantName } = req.body;
  
  if (!roomName || !participantName) {
    console.log('Token request failed: Missing room name or participant name');
    return res.status(400).json({ error: 'Room name and participant name are required' });
  }

  try {
    // Try to create/get the room first
    try {
      const rooms = await roomService.listRooms();
      console.log('Current rooms:', rooms);
      
      // Create the room if it doesn't exist
      await roomService.createRoom({
        name: roomName,
        emptyTimeout: 60 * 10, // 10 minutes
        maxParticipants: 5
      });
      console.log('Room created or already exists:', roomName);
    } catch (roomError) {
      console.log('Room service error:', roomError);
      // Continue anyway as the room might be created when the participant joins
    }

    const token = await createRoomToken(roomName, participantName);
    console.log('Token generated for:', participantName, 'room:', roomName);
    
    res.json({ 
      token,
      serverUrl: process.env.LIVEKIT_WS_URL
    });
  } catch (error) {
    console.error('Token generation failed:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});