class CandleManager {
    constructor() {
        this.candles = new Map(); // Key: "TOKEN-INTERVAL", Value: { o, h, l, c, t, symbol, interval }
        this.intervals = {
            '1m': 60 * 1000,
            '5m': 5 * 60 * 1000,
            '10m': 10 * 60 * 1000,
            '15m': 15 * 60 * 1000,
            '30m': 30 * 60 * 1000
        };
        // We will store only the "current" candle for real-time monitoring.
        // History could be added later.
    }

    // Process a new tick (LTP) for a specific token
    processTick(token, ltp, symbol) {
        const now = Date.now();
        const updates = [];
        const closed = [];

        for (const [intervalName, duration] of Object.entries(this.intervals)) {
            const key = `${token}-${intervalName}`;
            const bucketStart = Math.floor(now / duration) * duration;
            let candle = this.candles.get(key);

            if (candle && candle.startTime !== bucketStart) {
                // The previous candle is now closed
                closed.push({ ...candle, isClosed: true });

                // Reset for new bucket
                candle = {
                    symbol,
                    token,
                    interval: intervalName,
                    startTime: bucketStart,
                    open: ltp,
                    high: ltp,
                    low: ltp,
                    close: ltp,
                    status: 'NEUTRAL'
                };
            } else if (!candle) {
                candle = {
                    symbol,
                    token,
                    interval: intervalName,
                    startTime: bucketStart,
                    open: ltp,
                    high: ltp,
                    low: ltp,
                    close: ltp,
                    status: 'NEUTRAL'
                };
            } else {
                candle.high = Math.max(candle.high, ltp);
                candle.low = Math.min(candle.low, ltp);
                candle.close = ltp;
            }

            if (candle.close > candle.open) candle.status = 'GREEN';
            else if (candle.close < candle.open) candle.status = 'RED';
            else candle.status = 'NEUTRAL';

            this.candles.set(key, candle);
            updates.push(candle);
        }

        return { updates, closed };
    }

    getAllCandles() {
        return Array.from(this.candles.values());
    }
}

module.exports = new CandleManager();
