const mineflayer = require('mineflayer');
const fs = require('fs');
const path = require('path');

class BotManager {
  constructor(configPath, onEvent) {
    this.configPath = configPath;
    this.onEvent = onEvent || (() => {});
    this.bot = null;
    this.config = this.loadConfig();
    this.isManualStop = false;
    this.reconnectTimer = null;
    this.antiAfkTimer = null;
    this.state = 'offline';
    this.hasClickedGui = false;
    this.postCommandsSent = false;
    this.loginSent = false;
    this.chatHistory = [];
    this.actionLogs = [];
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('Failed to load config.json:', err);
    }
    return {
      host: 'mcnp.network',
      port: 25565,
      username: 'BreezeGuy',
      auth: 'offline',
      version: false,
      password: 'tynorix',
      autoLogin: true,
      loginDelayMs: 3000,
      hotbarSlot: 2,
      useItemAfterSwitch: true,
      useItemDelayMs: 2000,
      guiTargetMode: 'name_or_slot',
      guiTargetItem: 'diamond_pickaxe',
      guiTargetSlot: 11,
      postCommands: ['/sit', '/afk'],
      postCommandsDelayMs: 6000,
      autoReconnect: true,
      reconnectDelayMs: 10000,
      antiAfk: true,
      antiAfkIntervalMs: 30000
    };
  }

  saveConfig(newConfig) {
    try {
      this.config = { ...this.config, ...newConfig };
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
      this.log('system', 'Configuration saved successfully.');
      return { success: true, config: this.config };
    } catch (err) {
      this.log('error', `Failed to save configuration: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  log(type, text) {
    const entry = {
      timestamp: new Date().toLocaleTimeString(),
      type,
      text
    };
    this.actionLogs.push(entry);
    if (this.actionLogs.length > 300) this.actionLogs.shift();
    this.onEvent('log', entry);
    console.log(`[${entry.timestamp}] [${type.toUpperCase()}] ${text}`);
  }

  updateState(newState, details = '') {
    this.state = newState;
    this.onEvent('state', { state: this.state, details });
    this.log('status', `Status changed: ${newState.toUpperCase()} ${details ? `(${details})` : ''}`);
  }

  start() {
    if (this.bot) {
      this.log('warn', 'Bot is already running or connecting.');
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.isManualStop = false;
    this.hasClickedGui = false;
    this.postCommandsSent = false;
    this.loginSent = false;

    this.updateState('connecting', `Connecting to ${this.config.host}:${this.config.port} as ${this.config.username}`);

    const botOptions = {
      host: this.config.host,
      port: parseInt(this.config.port, 10) || 25565,
      username: this.config.username,
      auth: this.config.auth || 'offline',
      checkTimeoutInterval: 60000,
      hideErrors: false
    };

    if (this.config.version && typeof this.config.version === 'string' && this.config.version.trim() !== '') {
      botOptions.version = this.config.version.trim();
    }

    try {
      this.bot = mineflayer.createBot(botOptions);
      this.bindBotEvents();
    } catch (err) {
      this.log('error', `Bot creation error: ${err.message}`);
      this.updateState('error', err.message);
      this.handleAutoReconnect();
    }
  }

  stop() {
    this.isManualStop = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopAntiAfk();

    if (this.bot) {
      this.log('system', 'Stopping bot by user request...');
      try {
        this.bot.quit();
      } catch (e) {
        // ignore
      }
      this.bot = null;
    }
    this.updateState('stopped', 'Bot manually stopped');
  }

  bindBotEvents() {
    const bot = this.bot;

    bot.on('login', () => {
      this.log('minecraft', `Bot logged in to server protocol. Waiting for world spawn...`);
      this.updateState('logging_in');
    });

    bot.once('spawn', () => {
      this.log('minecraft', `Bot spawned in world! Position: ${bot.entity?.position ? bot.entity.position.floored() : 'unknown'}`);
      this.updateState('spawned');
      this.executeJoinSequence();
    });

    // Handle respawn or server change (BungeeCord / Velocity transfer to survival)
    bot.on('respawn', () => {
      this.log('minecraft', 'Server respawn / dimension change detected.');
      if (this.hasClickedGui && !this.postCommandsSent) {
        this.log('system', 'Detected server transfer to Survival after GUI click.');
        this.scheduleSurvivalCommands();
      }
    });

    bot.on('message', (jsonMsg) => {
      const plainText = jsonMsg.toString().trim();
      if (!plainText) return;

      const chatEntry = {
        timestamp: new Date().toLocaleTimeString(),
        text: plainText
      };
      this.chatHistory.push(chatEntry);
      if (this.chatHistory.length > 300) this.chatHistory.shift();

      this.onEvent('chat', chatEntry);

      // Check for login / auth prompts in chat
      const lower = plainText.toLowerCase();
      if ((lower.includes('/login') || lower.includes('please login')) && !this.loginSent) {
        this.log('system', 'Server requested /login. Executing login command...');
        this.executeLoginCommand();
      }
    });

    bot.on('windowOpen', (window) => {
      this.handleWindowOpen(window);
    });

    bot.on('kicked', (reason) => {
      let kickReason = '';
      try {
        kickReason = typeof reason === 'string' ? reason : JSON.stringify(reason);
      } catch (e) {
        kickReason = 'Unknown kick reason';
      }
      this.log('error', `Bot was kicked: ${kickReason}`);
      this.updateState('kicked', kickReason);
    });

    bot.on('end', (reason) => {
      this.log('warn', `Bot connection ended: ${reason || 'Disconnected'}`);
      this.stopAntiAfk();
      this.bot = null;
      if (!this.isManualStop) {
        this.updateState('offline', 'Disconnected');
        this.handleAutoReconnect();
      } else {
        this.updateState('stopped', 'Stopped by user');
      }
    });

    bot.on('error', (err) => {
      this.log('error', `Bot network/client error: ${err.message}`);
      this.updateState('error', err.message);
    });
  }

  executeLoginCommand() {
    if (!this.bot || this.loginSent) return;
    const pwd = this.config.password || 'tynorix';
    this.log('command', `Sending: /login ${pwd}`);
    this.bot.chat(`/login ${pwd}`);
    this.loginSent = true;
  }

  executeJoinSequence() {
    // Step 1: Login after delay
    const loginDelay = parseInt(this.config.loginDelayMs, 10) || 3000;
    setTimeout(() => {
      if (!this.bot) return;

      if (this.config.autoLogin && !this.loginSent) {
        this.executeLoginCommand();
      }

      // Step 2: Switch to configured hotbar slot (default 2 -> index 1)
      const useItemDelay = parseInt(this.config.useItemDelayMs, 10) || 2000;
      setTimeout(() => {
        if (!this.bot) return;

        const slotNumber = parseInt(this.config.hotbarSlot, 10) || 2;
        const quickBarIndex = Math.max(0, Math.min(8, slotNumber - 1));
        this.log('action', `Switching to hotbar slot ${slotNumber} (index ${quickBarIndex})...`);
        
        try {
          this.bot.setQuickBarSlot(quickBarIndex);
          this.updateState('opening_menu', `Selected hotbar slot ${slotNumber}`);

          if (this.config.useItemAfterSwitch) {
            setTimeout(() => {
              if (!this.bot) return;
              this.log('action', 'Activating held item to open server selector GUI...');
              try {
                this.bot.activateItem();
              } catch (e) {
                this.log('warn', `activateItem error: ${e.message}`);
              }
            }, 800);
          }
        } catch (err) {
          this.log('error', `Failed to switch hotbar slot: ${err.message}`);
        }
      }, useItemDelay);

    }, loginDelay);
  }

  handleWindowOpen(window) {
    this.log('minecraft', `Chest/Inventory GUI opened: "${window.title || 'Chest'}" (Total Slots: ${window.slots.length})`);
    this.updateState('clicking_item', 'Navigating Server Selector');

    setTimeout(() => {
      if (!this.bot) return;

      let targetSlot = null;
      const targetItemName = (this.config.guiTargetItem || 'diamond_pickaxe').toLowerCase();
      const preferredSlot = parseInt(this.config.guiTargetSlot, 10);

      // Scan slots
      for (let i = 0; i < window.slots.length; i++) {
        const item = window.slots[i];
        if (!item) continue;

        const itemName = (item.name || '').toLowerCase();
        const customName = item.customName ? item.customName.toLowerCase() : '';

        // Match by item name (e.g. diamond_pickaxe)
        if (itemName.includes(targetItemName) || targetItemName.includes(itemName)) {
          targetSlot = i;
          this.log('action', `Found target item "${item.name}" at slot ${i}!`);
          break;
        }
      }

      // If name search didn't match or mode requires slot
      if (targetSlot === null && !isNaN(preferredSlot) && preferredSlot >= 0 && preferredSlot < window.slots.length) {
        targetSlot = preferredSlot;
        const slotItem = window.slots[preferredSlot];
        this.log('action', `Using fallback slot ${preferredSlot} (Item: ${slotItem ? slotItem.name : 'empty'}).`);
      }

      if (targetSlot !== null) {
        this.log('action', `Clicking slot ${targetSlot} in GUI to join Survival...`);
        try {
          this.bot.clickWindow(targetSlot, 0, 0); // 0 = left click, 0 = normal click
          this.hasClickedGui = true;
          this.updateState('transferring', `Clicked slot ${targetSlot}. Transferring to Survival...`);

          // Fallback timer: if no respawn event fires, still schedule post commands
          setTimeout(() => {
            if (!this.postCommandsSent && this.bot) {
              this.scheduleSurvivalCommands();
            }
          }, parseInt(this.config.postCommandsDelayMs, 10) || 6000);

        } catch (err) {
          this.log('error', `Failed to click window slot ${targetSlot}: ${err.message}`);
        }
      } else {
        this.log('warn', `Could not find "${targetItemName}" or slot ${preferredSlot} in open window.`);
      }
    }, 1200);
  }

  scheduleSurvivalCommands() {
    if (this.postCommandsSent) return;
    this.postCommandsSent = true;

    this.log('system', 'Bot entered Survival server! Preparing commands...');
    this.updateState('in_survival', 'Survival Mode Active');

    const commands = Array.isArray(this.config.postCommands) ? this.config.postCommands : ['/sit', '/afk'];
    let delay = 1000;

    commands.forEach((cmd, idx) => {
      setTimeout(() => {
        if (!this.bot) return;
        const cleanCmd = cmd.trim();
        if (cleanCmd) {
          this.log('command', `Sending: ${cleanCmd}`);
          this.bot.chat(cleanCmd);
        }

        if (idx === commands.length - 1) {
          this.log('system', 'All post-join commands completed! AFK routine active.');
          if (this.config.antiAfk) {
            this.startAntiAfk();
          }
        }
      }, delay);
      delay += 2000;
    });
  }

  startAntiAfk() {
    this.stopAntiAfk();
    const interval = Math.max(10000, parseInt(this.config.antiAfkIntervalMs, 10) || 30000);
    this.log('system', `Anti-AFK keep-alive routine enabled (every ${interval / 1000}s).`);

    this.antiAfkTimer = setInterval(() => {
      if (!this.bot || this.state !== 'in_survival') return;
      try {
        // Subtle arm swing
        this.bot.swingArm('right');
        // Subtle sneak toggle or head turn
        if (this.bot.entity) {
          const newYaw = this.bot.entity.yaw + (Math.random() * 0.1 - 0.05);
          this.bot.look(newYaw, this.bot.entity.pitch, true);
        }
      } catch (e) {
        // ignore subtle action errors
      }
    }, interval);
  }

  stopAntiAfk() {
    if (this.antiAfkTimer) {
      clearInterval(this.antiAfkTimer);
      this.antiAfkTimer = null;
    }
  }

  handleAutoReconnect() {
    if (this.isManualStop || !this.config.autoReconnect) {
      return;
    }

    const delay = parseInt(this.config.reconnectDelayMs, 10) || 10000;
    this.log('system', `Auto-reconnect triggered. Reconnecting in ${delay / 1000}s...`);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (!this.isManualStop) {
        this.log('system', 'Attempting reconnect now...');
        this.start();
      }
    }, delay);
  }

  sendChat(msg) {
    if (!this.bot) {
      return { success: false, error: 'Bot is not currently connected.' };
    }
    const clean = msg.trim();
    if (!clean) {
      return { success: false, error: 'Message cannot be empty.' };
    }
    this.log('user_chat', `Manual message sent: ${clean}`);
    this.bot.chat(clean);
    return { success: true };
  }

  rerunRoutine() {
    if (!this.bot) {
      this.start();
      return { success: true, message: 'Bot started and executing routine.' };
    }
    this.hasClickedGui = false;
    this.postCommandsSent = false;
    this.loginSent = false;
    this.log('system', 'Manually re-running routine (Hotbar -> GUI -> Survival)...');
    this.executeJoinSequence();
    return { success: true, message: 'Routine restarted.' };
  }

  getStatus() {
    return {
      state: this.state,
      isManualStop: this.isManualStop,
      botUsername: this.config.username,
      host: this.config.host,
      port: this.config.port,
      health: this.bot?.health || null,
      food: this.bot?.food || null,
      position: this.bot?.entity?.position ? this.bot.entity.position.floored() : null,
      config: this.config,
      recentLogs: this.actionLogs.slice(-50),
      recentChat: this.chatHistory.slice(-50)
    };
  }
}

module.exports = BotManager;
