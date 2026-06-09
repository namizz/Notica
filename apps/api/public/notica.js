(function () {
  let _apiKey = null;
  let _recipientId = null;
  let _apiUrl = 'http://localhost:8000';
  let _wsUrl = 'http://localhost:8000';
  let _socket = null;
  let _listeners = [];

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  const Notica = {
    init(config) {
      if (!config.apiKey) {
        console.error('[Notica SDK] API Key is required');
        return;
      }
      _apiKey = config.apiKey;
      if (config.apiUrl) _apiUrl = config.apiUrl;
      if (config.wsUrl) _wsUrl = config.wsUrl;
      console.log('[Notica SDK] Initialized successfully');
      return this;
    },

    identify(recipientId) {
      _recipientId = recipientId;
      console.log(`[Notica SDK] Identified recipient: ${recipientId}`);
      
      // If listeners were registered before identify, establish socket connection now
      if (_listeners.length > 0) {
        this._connectRealtime();
      }
      return this;
    },

    onNotification(callback) {
      if (typeof callback !== 'function') {
        console.error('[Notica SDK] Callback must be a function');
        return;
      }
      _listeners.push(callback);

      if (_recipientId) {
        this._connectRealtime();
      } else {
        console.warn('[Notica SDK] Identified recipient is missing. Call Notica.identify() to receive real-time notifications.');
      }
      return this;
    },

    async registerPush(swPath = '/sw.js') {
      if (!_apiKey || !_recipientId) {
        console.error('[Notica SDK] Notica must be initialized and recipient identified before registering push.');
        return false;
      }

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('[Notica SDK] Web Push is not supported by this browser.');
        return false;
      }

      try {
        // 1. Request Notification Permission
        let permission = Notification.permission;
        if (permission === 'default') {
          permission = await Notification.requestPermission();
        }

        if (permission !== 'granted') {
          console.warn('[Notica SDK] Notification permission denied.');
          return false;
        }

        // 2. Fetch VAPID Public Key from Notica API
        const keyRes = await fetch(`${_apiUrl}/device-tokens/vapid-key`, {
          headers: { 'x-api-key': _apiKey }
        });
        
        if (!keyRes.ok) {
          throw new Error('Failed to fetch VAPID public key from server');
        }
        
        const { publicKey } = await keyRes.json();
        
        // 3. Register Service Worker
        const registration = await navigator.serviceWorker.register(swPath);
        console.log('[Notica SDK] Service Worker registered successfully', registration);

        // 4. Subscribe to Push Manager
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        console.log('[Notica SDK] Browser push subscription created', subscription);

        // 5. Send Subscription to Notica API
        const regRes = await fetch(`${_apiUrl}/device-tokens/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': _apiKey,
          },
          body: JSON.stringify({
            recipientId: _recipientId,
            token: subscription,
            platform: 'WEB'
          })
        });

        if (!regRes.ok) {
          throw new Error('Failed to register subscription with Notica server');
        }

        console.log('[Notica SDK] Push subscription registered successfully.');
        return true;
      } catch (e) {
        console.error('[Notica SDK] Error during push registration', e);
        return false;
      }
    },

    _connectRealtime() {
      if (_socket) {
        _socket.disconnect();
      }

      if (typeof io === 'undefined') {
        console.error('[Notica SDK] Socket.io client script is missing. Please load: <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>');
        return;
      }

      const socketUrl = `${_wsUrl}/realtime`;
      console.log(`[Notica SDK] Connecting to Realtime Gateway: ${socketUrl}`);

      _socket = io(socketUrl, {
        query: {
          apiKey: _apiKey,
          recipientId: _recipientId,
        },
        transports: ['websocket'],
      });

      _socket.on('connect', () => {
        console.log('[Notica SDK] Realtime WebSocket connection established');
      });

      _socket.on('notification', (data) => {
        console.log('[Notica SDK] Real-time notification received:', data);
        _listeners.forEach((listener) => {
          try {
            listener(data);
          } catch (e) {
            console.error('[Notica SDK] Error in notification listener callback', e);
          }
        });
      });

      _socket.on('disconnect', () => {
        console.log('[Notica SDK] Realtime WebSocket disconnected');
      });

      _socket.on('connect_error', (err) => {
        console.error('[Notica SDK] Realtime connection error:', err);
      });
    }
  };

  window.Notica = Notica;
})();
