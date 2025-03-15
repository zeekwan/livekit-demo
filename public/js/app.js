document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const talkButton = document.getElementById('talk-button');
  const statusDiv = document.getElementById('status');
  const playbackButton = document.getElementById('playback-button');
  const audioLevelMeter = document.getElementById('audio-level-meter');
  const audioLevelValue = document.getElementById('audio-level-value');
  const speechStatus = document.getElementById('speech-status');
  const audioStats = document.getElementById('audio-stats');
  const conversationDiv = document.getElementById('conversation');
  const thresholdSlider = document.getElementById('speech-threshold');
  const thresholdValue = document.getElementById('threshold-value');

  // LiveKit Room
  let room = null;
  let audioTrack = null;
  let isListening = false;

  // Replace the LiveKit Sandbox Configuration section with:d
  const TOKEN_ENDPOINT = 'http://localhost:3001/get-token';
  const DEFAULT_ROOM_NAME = 'voice-assistant-room';

  // Add these new variables at the top with your other declarations
  let mediaRecorder = null;
  let audioChunks = [];
  let recordedAudio = null;
  let speechThreshold = 0.1; // Default threshold

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
              // Enhanced speaker logging
              if (speakers.length > 0) {
                  const speakerNames = speakers.map(speaker => speaker.identity).join(', ');
                  log(`Active speakers: ${speakerNames}`, 'info');
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
      log(`Starting audio capture (Speech threshold: ${speechThreshold.toFixed(2)})...`);
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
      mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'audio/webm' });
      
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
              recordedAudio.remove();
          }
          recordedAudio = document.createElement('audio');
          recordedAudio.src = URL.createObjectURL(audioBlob);
          recordedAudio.controls = true;
          document.body.appendChild(recordedAudio);
          log('Audio player created');
      };

      // Start recording immediately
      mediaRecorder.start(1000);
      log('Started recording');

      // Set up audio level monitoring
      audioTrack.on(LivekitClient.TrackEvent.AudioLevelChanged, (level) => {
          const percentage = Math.min(level * 100, 100);
          
          // Log significant changes
          if (percentage > (speechThreshold * 100)) {
              log(`Audio level: ${percentage.toFixed(1)}% (Threshold: ${(speechThreshold * 100).toFixed(1)}%)`);
          }
          
          // Update speech status
          if (level > speechThreshold) {
              speechStatus.textContent = 'Speech Detected';
              speechStatus.classList.add('speaking');
          } else {
              speechStatus.textContent = 'No Speech Detected';
              speechStatus.classList.remove('speaking');
          }
      });

      // Monitor active speakers
      room.on(LivekitClient.RoomEvent.ActiveSpeakersChanged, (speakers) => {
          log(`Active speakers changed: ${speakers.length} speakers`);
          
          const localParticipant = speakers.find(
              speaker => speaker.identity === room.localParticipant.identity
          );
          
          if (localParticipant) {
              log('Local participant is speaking');
              speechStatus.textContent = 'Active Speaker';
              speechStatus.classList.add('speaking');
          }
      });

      // Add audio statistics monitoring
      audioTrack.on(LivekitClient.TrackEvent.StatisticsUpdated, (stats) => {
          const audioStats = document.getElementById('audio-stats');
          const statsInfo = {
              packetsLost: stats.packetsLost || 0,
              jitter: (stats.jitter || 0).toFixed(2),
              bandwidth: ((stats.bandwidth || 0) / 1000).toFixed(2)
          };
          
          log(`Audio stats - Bandwidth: ${statsInfo.bandwidth}kbps, Jitter: ${statsInfo.jitter}ms`);
          
          audioStats.innerHTML = `
              <div>Packets Lost: ${statsInfo.packetsLost}</div>
              <div>Jitter: ${statsInfo.jitter}ms</div>
              <div>Bandwidth: ${statsInfo.bandwidth} kbps</div>
          `;
      });

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
    
    // Reset displays
    audioLevelMeter.style.width = '0%';
    audioLevelValue.textContent = 'Audio Level: 0';
    speechStatus.textContent = 'No Speech Detected';
    speechStatus.classList.remove('speaking');
    audioStats.innerHTML = '';
    
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

  // Add some CSS classes for visual feedback
  const styles = `
    .status.speaking {
      color: green;
      font-weight: bold;
    }
    
    .audio-metrics {
      margin-top: 10px;
      padding: 10px;
      background: #f5f5f5;
      border-radius: 4px;
    }
  `;

  // Add the styles to the document
  const styleSheet = document.createElement('style');
  styleSheet.innerText = styles;
  document.head.appendChild(styleSheet);

  // Add styles for log entries
  const logStyles = `
      ${styles}
      
      .log-entry {
          padding: 5px;
          margin: 2px 0;
          font-family: monospace;
          border-radius: 4px;
      }
      
      .log-entry.info {
          color: #0d47a1;
      }
      
      .log-entry.warn {
          color: #ef6c00;
      }
      
      .log-entry.error {
          color: #b71c1c;
      }
  `;

  // Add the styles to the document
  const logStyleSheet = document.createElement('style');
  logStyleSheet.innerText = logStyles;
  document.head.appendChild(logStyleSheet);

  // Add the slider event listener
  thresholdSlider.addEventListener('input', (e) => {
      // Convert slider value (0-50) to threshold (0-0.5)
      speechThreshold = e.target.value / 100;
      thresholdValue.textContent = speechThreshold.toFixed(2);
      log(`Speech detection threshold set to: ${speechThreshold.toFixed(2)}`, 'info');
  });
});