# LiveKit Demo

## Overview
This project is a demonstration of a voice room application built using LiveKit. It showcases real-time audio communication capabilities, allowing users to join and interact in a virtual room.

## Functionality
- Users can join a voice room and communicate in real-time.
- The application handles user authentication and generates tokens for room access.
- It logs participant activity and displays connection status.
- Users can adjust speech detection sensitivity and play back recorded audio.


## Prerequisites
- Node.js (version 23.7.0)
- npm (Node package manager)

## Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/zeekwan/livekit-demo.git
   cd livekit-demo
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory and add your LiveKit API keys:
   ```plaintext
   LIVEKIT_API_KEY=your_api_key
   LIVEKIT_SECRET=your_secret
   LIVEKIT_WS_URL=wss://your_livekit_url
   ```

## Usage
1. Start the server:
   ```bash
   node server.js
   ```

2. Open your browser and navigate to `http://localhost:3001` to access the application.



## Acknowledgments
- [LiveKit](https://livekit.io/) for providing the real-time communication framework.
