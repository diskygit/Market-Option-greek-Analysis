const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const WebSocket = require('ws');
const cors = require('cors');
const contractManager = require('./contract_manager');
const candleManager = require('./candle_manager');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Broker Config
const BROKER_WS_URL = "ws://115.242.15.134:19101";
const CREDENTIALS = {
    LoginId: "funneltest",
    Password: "funneltest"
};

let brokerSocket = null;
let manualDisconnect = false;
let isAuthenticated = false;

// Multi-Monitor State
let activeMonitors = new Map(); // Key: ID (e.g. SYMBOL-STRIKE-EXPIRY), Value: MonitorConfig

// Initialize Contracts
contractManager.loadContracts();

function connectBroker() {
    if (brokerSocket) return;

    manualDisconnect = false;
    console.log("Connecting to Broker WS...");
    brokerSocket = new WebSocket(BROKER_WS_URL);

    brokerSocket.on('open', () => {
        console.log("Connected to Broker.");
        brokerSocket.send(JSON.stringify({
            Type: "Login",
            Data: CREDENTIALS
        }));
        console.log("Sent Login Request");
    });

    brokerSocket.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            handleBrokerMessage(msg);
        } catch (e) {
            console.error("Error parsing broker message:", e);
        }
    });

    brokerSocket.on('close', () => {
        brokerSocket = null;
        isAuthenticated = false;
        io.emit('broker_status', 'disconnected');

        if (!manualDisconnect) {
            console.log("Broker Disconnected. Reconnecting in 5s...");
            setTimeout(connectBroker, 5000);
        } else {
            console.log("Broker Disconnected manually.");
        }
    });

    brokerSocket.on('error', (err) => {
        console.error("Broker Socket Error:", err.message);
    });
}

const closedCandles = new Map(); // Key: token-interval-startTime, Value: candle
let alertsHistory = [];

function handleBrokerMessage(msg) {
    const { Type, Data } = msg;

    if (Type === 'Login') {
        if (Data.Error === null) {
            console.log("Login Success!");
            isAuthenticated = true;
            io.emit('broker_status', 'connected');
            startHeartbeat();

            if (activeMonitors.size > 0) {
                console.log("Resuming subscriptions for all active monitors...");
                resubscribeAll();
            }
        } else {
            console.error("Login Failed:", Data.Error);
        }
    } else if (Type === 'MarketData') {
        if (Data && Data.LTP) {
            setImmediate(() => {
                const { updates, closed } = candleManager.processTick(Data.Tkn, Data.LTP, Data.Symbol || Data.Tkn);
                io.emit('candle_update', updates);
                if (closed.length > 0) processClosedCandles(closed);
            });
        }
    } else if (Type === 'IndexData') {
        const items = Array.isArray(Data) ? Data : [Data];
        // Normalization: Remove spaces and convert to upper
        const symbolToToken = {
            'NIFTY50': '999200',
            'NIFTYBANK': '999202',
            'NIFTYFINSERVICE': '999217',
            'SENSEX': '999203',
            'NIFTY': '999200',
            'BANKNIFTY': '999202',
            'FINNIFTY': '999217',
            'BSX': '999203',
            'BANKEX': '999211'
        };

        items.forEach(item => {
            const rawSym = (item.Symbol || item.S || "").toString().trim();
            const normSym = rawSym.toUpperCase().replace(/\s+/g, '');
            const tkn = symbolToToken[normSym] || rawSym;
            const ltp = parseFloat(item.Price || item.LTP || item.Ltp || 0);

            if (tkn && ltp > 0) {
                setImmediate(() => {
                    let candleSym = rawSym;
                    if (tkn === '999200') candleSym = 'NIFTY';
                    else if (tkn === '999202') candleSym = 'BANKNIFTY';
                    else if (tkn === '999217') candleSym = 'FINNIFTY';
                    else if (tkn === '999203') candleSym = 'BSX';
                    else if (tkn === '999211') candleSym = 'BANKEX';

                    const { updates, closed } = candleManager.processTick(tkn, ltp, candleSym);
                    io.emit('candle_update', updates);
                    if (closed.length > 0) processClosedCandles(closed);
                });
            }
        });
    }
}

function processClosedCandles(closed) {
    closed.forEach(c => {
        const key = `${c.token}-${c.interval}-${c.startTime}`;
        closedCandles.set(key, c);

        // Trigger alert check for relevant monitors
        activeMonitors.forEach(monitor => {
            if (monitor.interval === c.interval && (monitor.tokens.spot.token === c.token || monitor.tokens.ce.token === c.token || monitor.tokens.pe.token === c.token)) {
                checkMonitorAlert(monitor, c.startTime);
            }
        });
    });

    // Cleanup old closed candles (older than 1 hour)
    const oneHourAgo = Date.now() - 3600000;
    for (const [key, c] of closedCandles.entries()) {
        if (c.startTime < oneHourAgo) closedCandles.delete(key);
    }
}

function checkMonitorAlert(monitor, startTime) {
    const spotKey = `${monitor.tokens.spot.token}-${monitor.interval}-${startTime}`;
    const ceKey = `${monitor.tokens.ce.token}-${monitor.interval}-${startTime}`;
    const peKey = `${monitor.tokens.pe.token}-${monitor.interval}-${startTime}`;

    const spot = closedCandles.get(spotKey);
    const ce = closedCandles.get(ceKey);
    const pe = closedCandles.get(peKey);

    if (spot && ce && pe) {
        // Prevent duplicate alerts for same timestamp
        const alertId = `${monitor.symbol}-${monitor.ceStrike}-${monitor.peStrike}-${monitor.interval}-${startTime}`;
        if (alertsHistory.some(a => a.alertId === alertId)) return;

        let alertName = "";
        const s = spot.status;
        const c = ce.status;
        const p = pe.status;

        // 2A - index-green, call-red, put-green ---> Put gammaBlast
        if (s === 'GREEN' && c === 'RED' && p === 'GREEN') alertName = "Put gammaBlast";
        // 2B - index-red, call-green, put-red  ---> call gammaBlast
        else if (s === 'RED' && c === 'GREEN' && p === 'RED') alertName = "Call gammaBlast";
        // 2C - index-red, call-red, put-red   ----> Theta decay
        else if (s === 'RED' && c === 'RED' && p === 'RED') alertName = "Theta decay";
        // 2D - index-red, call-green, put-green ---> either side gammaBlast
        else if (s === 'RED' && c === 'GREEN' && p === 'GREEN') alertName = "either side gammaBlast";

        if (alertName) {
            const newAlert = {
                alertId,
                timestamp: new Date(startTime).toLocaleTimeString(),
                index: monitor.symbol,
                strike: `C:${monitor.ceStrike} P:${monitor.peStrike}`,
                prices: { spot: spot.close, ce: ce.close, pe: pe.close },
                name: alertName
            };
            alertsHistory.unshift(newAlert);
            if (alertsHistory.length > 100) alertsHistory.pop();
            io.emit('new_alert', newAlert);
        }
    }
}

function resubscribeAll() {
    activeMonitors.forEach(monitor => {
        subscribeMonitor(monitor);
    });
}

function subscribeMonitor(monitor) {
    if (!isAuthenticated || !brokerSocket) return;
    const { symbol, expiry, ceStrike, peStrike } = monitor;

    const isBSE = ['SENSEX', 'BANKEX', 'BSX'].includes(symbol.toUpperCase());
    const spotXchg = isBSE ? 'BSE' : 'NSE';
    const optXchg = isBSE ? 'BSEFO' : 'NSEFO';

    // Spot
    const spotResult = contractManager.getToken(symbol, null, null, 'SPOT');
    if (spotResult) sendSub(spotResult, spotXchg);

    // Options
    const ceResult = contractManager.getToken(symbol, expiry, ceStrike, 'CE');
    const peResult = contractManager.getToken(symbol, expiry, peStrike, 'PE');
    if (ceResult) sendSub(ceResult, optXchg);
    if (peResult) sendSub(peResult, optXchg);

    // Attach details for candle processing
    monitor.tokens = { spot: spotResult, ce: ceResult, pe: peResult };
}

function sendSub(contract, xchg = 'NSEFO') {
    if (!brokerSocket || brokerSocket.readyState !== WebSocket.OPEN) return;
    const { token, symbol } = contract;
    const subRequest = {
        Type: "TokenRequest",
        Data: {
            SubType: true,
            FeedType: 1,
            quotes: [{ Xchg: xchg, Tkn: token, Symbol: symbol }]
        }
    };
    console.log(`[SUBSCRIPTION] Sent for ${symbol} (Token: ${token}) on ${xchg}`);
    brokerSocket.send(JSON.stringify(subRequest));
}

function startHeartbeat() {
    if (global.hbTimer) clearInterval(global.hbTimer);
    global.hbTimer = setInterval(() => {
        if (brokerSocket && brokerSocket.readyState === WebSocket.OPEN) {
            brokerSocket.send(JSON.stringify({ Type: "Info", Data: { InfoType: "HB", InfoMsg: "Heartbeat" } }));
        }
    }, 5000);
}

// Start Connection
connectBroker();

// REST Endpoints
app.post('/subscribe', (req, res) => {
    const { action, monitor } = req.body;
    handleSubscribeAction(action, monitor);
    res.json({ success: true, count: activeMonitors.size });
});

function handleSubscribeAction(action, monitor) {
    const id = `${monitor.symbol}-${monitor.ceStrike}-${monitor.peStrike}-${monitor.expiry}-${monitor.interval}`;
    if (action === 'add') {
        const { symbol, expiry, ceStrike, peStrike } = monitor;
        const tokens = {
            spot: contractManager.getToken(symbol, null, null, 'SPOT'),
            ce: contractManager.getToken(symbol, expiry, ceStrike, 'CE'),
            pe: contractManager.getToken(symbol, expiry, peStrike, 'PE')
        };

        if (!tokens.spot || !tokens.ce || !tokens.pe) {
            console.warn(`[WARNING] Incomplete tokens for ${id}:`, tokens);
        } else {
            console.log(`[SUBSCRIPTION] Tokens resolved for ${id}:`, tokens);
        }

        const updatedMonitor = { ...monitor, tokens };
        activeMonitors.set(id, updatedMonitor);
        subscribeMonitor(updatedMonitor);
    } else if (action === 'remove') {
        activeMonitors.delete(id);
    }
    io.emit('monitors_updated', Array.from(activeMonitors.values()));
}

app.get('/strikes_around', (req, res) => {
    const { symbol, expiry, center } = req.query;
    res.json(contractManager.getStrikesAround(symbol, expiry, center));
});

app.get('/atm', (req, res) => {
    const { symbol, expiry, spot } = req.query;
    const atm = contractManager.getATMStrike(symbol, expiry, parseFloat(spot));
    res.json({ atm });
});

app.get('/indices', (req, res) => res.json(contractManager.getIndices()));
app.get('/expiries', (req, res) => res.json(contractManager.getExpiries(req.query.symbol)));
app.get('/strikes', (req, res) => res.json(contractManager.getStrikes(req.query.symbol, req.query.expiry)));

io.on('connection', (socket) => {
    console.log("Frontend Connected");
    socket.emit('broker_status', isAuthenticated ? 'connected' : 'disconnected');
    socket.emit('monitors_updated', Array.from(activeMonitors.values()));

    socket.on('subscribe', ({ action, monitor }) => {
        console.log(`Socket Subscribe: ${action} ${monitor.symbol} CE:${monitor.ceStrike} PE:${monitor.peStrike}`);
        handleSubscribeAction(action, monitor);
    });

    socket.on('toggle_broker', (enable) => {
        if (enable) {
            connectBroker();
        } else if (brokerSocket) {
            manualDisconnect = true;
            brokerSocket.close();
        }
    });

    socket.on('disconnect', () => console.log("Frontend Disconnected"));
});

server.listen(4001, () => {
    console.log("Server running on port 4001");
});
