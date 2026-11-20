# MCNP Action Grinder - AFK Minecraft Bot with Web Dashboard 🎮🤖

An automated Minecraft AFK Bot designed for `mcnp.network` (and compatible Minecraft networks) with a real-time web dashboard for 24/7 hosting on **Railway**, Render, or VPS.

---

## 🌟 Key Features

1. **Automated Join & Login Routine**:
   - Joins server `mcnp.network` as `BreezeGuy`.
   - Sends `/login tynorix` (customizable in dashboard).
   - Automatically switches to the **2nd hotbar slot** and triggers item use to open the Server Selector chest menu.
   - Automatically detects and clicks the **Diamond Pickaxe (Slot #11)** in the GUI to join Survival.
   - Upon arriving in the Survival server, runs `/sit` and `/afk` sequentially.
   - Subtle **Anti-AFK keep-alive** routines (arm swing, look rotation) to prevent inactivity kicks.

2. **Full-Featured Web Control Panel (Railway Ready)**:
   - 🛑 **Stop the bot**: Immediately disconnects the bot and halts auto-reconnects.
   - ▶️ **Resume / Start the bot**: Connects the bot and runs the routine.
   - 💬 **Live Chat & Commands**: Type and send any chat message or Minecraft command in real time with quick action chips (`/sit`, `/afk`, `/spawn`, `/home`, etc.).
   - ⚙️ **On-the-fly Configuration**:
     - Change Server IP & Port (e.g. `mcnp.network:25565`).
     - Change Password or Login command.
     - Change Hotbar Slot (1-9) for the server selector.
     - Change Target GUI slot or tool (`diamond_pickaxe`, `netherite_pickaxe`, `netherite_sword`, etc.).
     - Interactive 3x9 visual chest GUI replicating in-game layout for 1-click slot selection!
     - Auto-reconnect & Anti-AFK settings.
   - 📜 **Live Terminal / Chat Console**: Real-time websocket stream showing server messages, whispers, and bot status logs.

---

## 🚀 How to Host on Railway (24/7)

1. Go to [Railway.app](https://railway.app) and sign in.
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select this repository: `mcnp-action-grinder`.
4. Railway will automatically detect the Node.js project and deploy it.
5. In your Railway service settings:
   - Go to **Networking** → **Generate Domain**.
6. Click the generated Railway domain link (e.g. `https://mcnp-action-grinder.up.railway.app`).
7. You will see the live control dashboard with the bot controls, chat feed, and settings!

---

## 💻 Running Locally

```bash
# Clone the repository
git clone https://github.com/AsbinPaneru79/mcnp-action-grinder.git
cd mcnp-action-grinder

# Install dependencies
npm install

# Start the dashboard and bot
npm start
```

Open your browser at `http://localhost:3000` to access the dashboard.

---

## 📁 Project Structure

```
├── botManager.js     # Minecraft bot lifecycle & automation routines (Mineflayer)
├── config.json       # Persistent bot settings (IP, password, slots, commands)
├── package.json      # Dependencies and startup scripts
├── Procfile          # Process file for cloud hosting (Railway/Heroku)
├── railway.json      # Nixpacks deployment configuration
├── server.js         # Express + Socket.IO web server
└── public/
    └── index.html    # Modern Cyber/Dark Web Dashboard with interactive GUI selector
```

---

## 🔒 Security Note
Do not commit sensitive passwords to public repositories if you do not want them visible. The password can also be changed directly from the protected web dashboard after deployment.
