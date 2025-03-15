document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const talkButton = document.getElementById('talk-button');
  const statusDiv = document.getElementById('status');
  const playbackButton = document.getElementById('playback-button');
  const conversationDiv = document.getElementById('conversation');

  // LiveKit Room
  let room = null;
  let audioTrack = null;
  let isListening = false;

  // Replace the LiveKit Sandbox Configuration section with:
  const TOKEN_ENDPOINT = 'http://localhost:3001/get-token';
  const DEFAULT_ROOM_NAME = 'voice-assistant-room';

  // Add these new variables at the top with your other declarations
  let mediaRecorder = null;
  let audioChunks = [];
  let recordedAudio = null;

  // Add logging function at the top
  function log(message, type = 'info') {
      // Console log
      console.log(message);
      
      // Add to conversation div
      const logEntry = document.createElement('div');
      logEntry.className = `log-entry ${type}`;
      
      const timestamp = new Date().toLocaleTimeString();
      logEntry.textContent = `[${timestamp}] ${message}`;
      
      conversationDiv.appendChild(logEntry);
      conversationDiv.scrollTop = conversationDiv.scrollHeight;
  }

  // Replace the getLiveKitToken function with:
  async function getLiveKitToken(roomName = DEFAULT_ROOM_NAME) {
    try {
      const participantName = 'user-' + Date.now();
      
      const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          roomName: roomName,
          participantName: participantName
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get token from server');
      }

      const data = await response.json();
      return {
        serverUrl: data.serverUrl,
        token: data.token,
        roomName: roomName,
        participantName: participantName
      };
    } catch (error) {
      console.error('Error getting LiveKit token:', error);
      updateStatus('Failed to get LiveKit token', 'error');
      throw error;
    }
  }

  // Connect to LiveKit room
  async function connectToLiveKit() {
    try {
      updateStatus('Connecting to LiveKit...', 'processing');
      
      // Get token from LiveKit sandbox
      const { serverUrl, token } = await getLiveKitToken();
      
      // Create and connect to room
      room = new LivekitClient.Room({
        adaptiveStream: true,
        dynacast: true,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      // Add these new event listeners
      room
          .on(LivekitClient.RoomEvent.Connected, () => {
              log('Room connection established', 'info');
          })
          .on(LivekitClient.RoomEvent.Disconnected, () => {
              log('Room disconnected', 'warn');
          })
          .on(LivekitClient.RoomEvent.Reconnecting, () => {
              log('Room connection lost, attempting to reconnect...', 'warn');
          })
          .on(LivekitClient.RoomEvent.Reconnected, () => {
              log('Room connection reestablished', 'info');
          })
          .on(LivekitClient.RoomEvent.ConnectionQualityChanged, (quality, participant) => {
              if (participant.identity === room.localParticipant.identity) {
                  log(`Local connection quality changed to: ${quality}`, quality === 'excellent' ? 'info' : 'warn');
              }
          })
          .on(LivekitClient.RoomEvent.AudioPlaybackStatusChanged, () => {
              const canPlayback = room.canPlaybackAudio;
              log(`Audio playback status changed: ${canPlayback ? 'enabled' : 'disabled'}`, canPlayback ? 'info' : 'warn');
          })
          .on(LivekitClient.RoomEvent.MediaDevicesError, (e) => {
              log(`Media device error: ${e.message}`, 'error');
          })
          .on(LivekitClient.RoomEvent.LocalTrackPublished, (track) => {
              log(`Local track published: ${track.kind}`, 'info');
          })
          .on(LivekitClient.RoomEvent.LocalTrackUnpublished, (track) => {
              log(`Local track unpublished: ${track.kind}`, 'info');
          })
          .on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
              log(`Subscribed to ${participant.identity}'s ${track.kind} track`, 'info');
              
              // Play audio tracks when subscribed
              if (track.kind === 'audio') {
                  track.attach();  // This automatically creates and attaches an audio element
                  log(`Playing audio from ${participant.identity}`, 'info');
              }
          })
          .on(LivekitClient.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
              log(`Unsubscribed from ${participant.identity}'s ${track.kind} track`, 'info');
              
              // Clean up audio tracks when unsubscribed
              if (track.kind === 'audio') {
                  track.detach();
                  log(`Stopped playing audio from ${participant.identity}`, 'info');
              }
          })
          .on(LivekitClient.RoomEvent.TrackStreamStateChanged, (track, streamState) => {
              log(`Track stream state changed to ${streamState}`, streamState === 'active' ? 'info' : 'warn');
          })
          .on(LivekitClient.RoomEvent.LocalAudioSilenceDetected, () => {
              log('Local audio silence detected', 'warn');
          })
          .on(LivekitClient.RoomEvent.ParticipantConnected, (participant) => {
              log(`Participant joined: ${participant.identity}`, 'info');
          })
          .on(LivekitClient.RoomEvent.ParticipantDisconnected, (participant) => {
              log(`Participant left: ${participant.identity}`, 'warn');
          })
          .on(LivekitClient.RoomEvent.RoomMetadataChanged, (metadata) => {
              log(`Room metadata changed: ${metadata}`, 'info');
          })
          .on(LivekitClient.RoomEvent.ParticipantMetadataChanged, (participant, prevMetadata) => {
              log(`Participant ${participant.identity} metadata changed`, 'info');
          })
          .on(LivekitClient.RoomEvent.ActiveSpeakersChanged, (speakers) => {
              // Enhanced speaker monitoring with detailed logging
              if (speakers.length > 0) {
                  const speakerNames = speakers.map(speaker => speaker.identity).join(', ');
                  log(`Active speakers: ${speakerNames}`, 'info');
                  
                  // Check if local participant is speaking
                  const localParticipant = speakers.find(
                      speaker => speaker.identity === room.localParticipant.identity
                  );

                  if (localParticipant) {
                      log('You are currently speaking', 'info');
                      updateStatus('Speaking...', 'listening');
                  } else {
                      // When others are speaking but you're not
                      log('Others are speaking', 'info');
                      updateStatus('Others speaking...', 'listening');
                  }
              } else {
                  // No one is speaking
                  log('Silence detected', 'info');
                  updateStatus('Listening...', 'listening');
              }
          });
      
      // Set up voice activity event listener
      room.on(LivekitClient.RoomEvent.VoiceActivityChanged, handleVoiceActivity);
      
      // Connect to the room
      await room.connect(serverUrl, token);
      console.log('Connected to LiveKit room:', room.name);
      
      updateStatus('Connected to LiveKit', 'success');
      return true;
    } catch (error) {
      console.error('LiveKit connection error:', error);
      updateStatus('Connection failed', 'error');
      return false;
    }
  }

  // Start capturing audio
  async function startListening() {
    try {
      log('Starting audio capture...');
      updateStatus('Accessing microphone...', 'processing');
      
      // Connect to LiveKit if not already connected
      if (!room || room.state !== 'connected') {
        log('Connecting to LiveKit...');
        await connectToLiveKit();
      }
      
      // Create and publish local audio track with noise suppression
      audioTrack = await LivekitClient.createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      });

      // Set up MediaRecorder
      const mediaStream = new MediaStream([audioTrack.mediaStreamTrack]);
      mediaRecorder = new MediaRecorder(mediaStream, { 
        mimeType: 'audio/webm',
        audioBitsPerSecond: 128000 // 128 kbps for good quality voice
      });
      
      // Clear previous recording
      audioChunks = [];
      
      mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
              audioChunks.push(event.data);
              log('Audio chunk recorded');
          }
      };
      
      mediaRecorder.onstop = () => {
          log('Recording stopped');
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          if (recordedAudio) {
              URL.revokeObjectURL(recordedAudio.src); // Clean up old URL
              recordedAudio.remove();
          }
          recordedAudio = document.createElement('audio');
          recordedAudio.src = URL.createObjectURL(audioBlob);
          recordedAudio.controls = true;
          document.getElementById('recordings-container').appendChild(recordedAudio);
          log('Audio player created');
      };

      mediaRecorder.onerror = (event) => {
          log(`MediaRecorder error: ${event.error.message}`, 'error');
          stopListening();
      };

      // Start recording immediately
      mediaRecorder.start(1000);
      log('Started recording');

      // Publish the track to the room
      await room.localParticipant.publishTrack(audioTrack);
      
      isListening = true;
      talkButton.classList.add('active');
      talkButton.textContent = 'Stop';
      updateStatus('Listening...', 'listening');
      
      return true;
    } catch (error) {
      log(`Error: ${error.message}`, 'error');
      updateStatus('Microphone access failed', 'error');
      return false;
    }
  }

  // Stop listening and clean up
  async function stopListening() {
    log('Stopping audio capture...');
    
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        log('MediaRecorder stopped');
    }
    
    if (audioTrack) {
        await room.localParticipant.unpublishTrack(audioTrack);
        audioTrack.stop();
        audioTrack = null;
        log('Audio track unpublished and stopped');
    }

    // Disconnect from the room entirely
    if (room) {
        await room.disconnect();
        room = null;
        log('Disconnected from room');
    }
    
    isListening = false;
    talkButton.classList.remove('active');
    talkButton.textContent = 'Talk';
    updateStatus('Ready', '');
    
    log('Audio capture cleanup complete');
  }

  // Handle voice activity events from LiveKit
  function handleVoiceActivity(participant, speaking) {
    if (participant.identity === room.localParticipant.identity) {
      console.log('Voice activity detected:', speaking ? 'speaking' : 'silent');
      
      if (speaking) {
        updateStatus('Speaking detected...', 'listening');
      }
    }
  }

  // Update status message
  function updateStatus(message, className = '') {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + className;
  }

  // Event listeners
  talkButton.addEventListener('click', async () => {
    if (!isListening) {
      await startListening();
    } else {
      await stopListening();
    }
  });

  // Optional: Add a function to manually play the last recording
  function playLastRecording() {
    if (recordedAudio) {
      recordedAudio.play();
      log('Playing last recording');
    } else {
      log('No recording available to play', 'warn');
    }
  }

  // Initialize
  updateStatus('Ready', '');

  playbackButton.addEventListener('click', playLastRecording);
});