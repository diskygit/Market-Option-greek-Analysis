const fs = require('fs');
const sax = require('sax');

class ContractManager {
    constructor() {
        this.contractMap = new Map(); // Key: "SYMBOL-EXPIRY-STRIKE-TYPE", Value: { token, symbol }
        this.reverseMap = new Map(); // Key: TokenID, Value: Details Object
        this.allIndices = new Set();
        this.allExpiries = new Map(); // Symbol -> Set
        this.allStrikes = new Map(); // Symbol-Expiry -> Set
    }

    async loadContracts() {
        const files = [
            { path: 'D:\\MTClient\\AppData\\Contract\\NSEFO.xml', tag: 'NSEFO' },
            { path: 'D:\\MTClient\\AppData\\Contract\\BSEFO.xml', tag: 'BSEFO' }
        ];

        this.contractMap.clear();
        this.reverseMap.clear();
        this.allIndices.clear();
        this.allExpiries.clear();
        this.allStrikes.clear();

        for (const file of files) {
            console.log("Loading Contracts from:", file.path);
            if (fs.existsSync(file.path)) {
                try {
                    await this._parseFile(file.path, file.tag);
                } catch (err) {
                    console.error(`Error parsing ${file.path}:`, err);
                }
            } else {
                console.warn(`File not found: ${file.path}`);
            }
        }
        console.log(`Streaming complete. Loaded ${this.contractMap.size} mappable contracts.`);
    }

    _parseFile(filePath, rootTag) {
        return new Promise((resolve, reject) => {
            const saxStream = sax.createStream(true, { trim: true });
            let currentTag = null;
            let currentSecurity = {};
            let count = 0;

            const targets = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'SENSEX', 'BANKEX', 'BSX', 'BKX'];

            saxStream.on('opentag', (node) => {
                const localName = node.name.split(/[:}]/).pop();
                currentTag = localName;
                if (localName === rootTag || localName === 'RECORD') {
                    currentSecurity = {};
                }
            });

            saxStream.on('text', (text) => {
                if (currentSecurity && currentTag) {
                    currentSecurity[currentTag] = (currentSecurity[currentTag] || "") + text;
                }
            });

            saxStream.on('closetag', (tagName) => {
                const localName = tagName.split(/[:}]/).pop();
                if (localName === rootTag || localName === 'RECORD') {
                    const s = currentSecurity;
                    const symbol = (s.Symbol || "").trim().toUpperCase();
                    const token = (s.TokenNo || "").trim();
                    const expiry = (s.ExpiryDate || "").trim();
                    const strike = (s.StrikePrice || "").trim();
                    const series = (s.Series || "").trim().toUpperCase();

                    if (symbol && token && targets.some(t => symbol.includes(t))) {
                        let normStrike = "0";
                        if (strike && strike !== "0" && strike !== "-1.00000") {
                            normStrike = Math.floor(parseFloat(strike)).toString();
                        }

                        const detail = {
                            symbol,
                            expiry,
                            strike: normStrike,
                            optType: (series === 'XX' || series === 'FUT' || series === 'FUTIDX') ? 'FUT' : series,
                            token
                        };

                        this.reverseMap.set(token, detail);

                        // Populate Metadata
                        this.allIndices.add(symbol);
                        if (!this.allExpiries.has(symbol)) this.allExpiries.set(symbol, new Set());
                        if (expiry) this.allExpiries.get(symbol).add(expiry);

                        if (expiry && normStrike !== "0") {
                            const seKey = `${symbol}-${expiry}`;
                            if (!this.allStrikes.has(seKey)) this.allStrikes.set(seKey, new Set());
                            this.allStrikes.get(seKey).add(parseInt(normStrike));
                        }

                        // Populate Contract Map ({ token, symbol })
                        const contractData = { token, symbol: s.Symbol || symbol };
                        if (detail.optType === 'CE' || detail.optType === 'PE') {
                            const key = `${symbol}-${expiry}-${normStrike}-${detail.optType}`.toUpperCase();
                            this.contractMap.set(key, contractData);
                        } else if (detail.optType === 'FUT') {
                            const key = `${symbol}-FUT`.toUpperCase();
                            this.contractMap.set(key, contractData);
                        }
                    }
                    count++;
                    if (count % 20000 === 0) console.log(`Processed ${count} records...`);
                }
                currentTag = null;
            });

            saxStream.on('end', () => resolve());
            saxStream.on('error', (err) => reject(err));

            fs.createReadStream(filePath).pipe(saxStream);
        });
    }

    getToken(symbol, expiry, strike, type) {
        const spotMap = {
            'NIFTY': '999200',
            'BANKNIFTY': '999202',
            'FINNIFTY': '999217',
            'SENSEX': '999203',
            'BSX': '999203',
            'BANKEX': '999211'
        };

        if (type === 'SPOT') {
            const tkn = spotMap[symbol.toUpperCase()];
            return tkn ? { token: tkn, symbol: symbol.toUpperCase() } : null;
        }

        const sym = symbol.toUpperCase();
        let key = `${sym}-${expiry}-${strike}-${type}`.toUpperCase();
        if (type === 'FUT') key = `${sym}-FUT`.toUpperCase();

        let data = this.contractMap.get(key);
        if (!data && sym === 'BSX') {
            const altKey = key.replace('BSX', 'SENSEX');
            data = this.contractMap.get(altKey);
        }
        return data; // Returns { token, symbol }
    }

    getATMStrike(symbol, expiry, spotPrice) {
        const sym = symbol.toUpperCase();
        let key = `${sym}-${expiry}`;
        let strikes = this.allStrikes.get(key);
        if (!strikes && sym === 'BSX') strikes = this.allStrikes.get(`SENSEX-${expiry}`);

        if (!strikes || strikes.size === 0) return null;

        let closest = null;
        let minDiff = Infinity;

        for (const s of strikes) {
            const diff = Math.abs(s - spotPrice);
            if (diff < minDiff) {
                minDiff = diff;
                closest = s.toString();
            }
        }
        return closest;
    }

    getIndices() {
        const filtered = ['NIFTY', 'BANKNIFTY', 'BSX'];
        return filtered.filter(f => {
            const searchTerms = [f.toUpperCase()];
            if (f === 'BSX') searchTerms.push('SENSEX');
            return Array.from(this.allIndices).some(i =>
                searchTerms.some(term => i.toUpperCase().includes(term))
            );
        });
    }

    getExpiries(symbol) {
        const sym = symbol.toUpperCase();
        let set = this.allExpiries.get(sym);
        if (!set && sym === 'BSX') set = this.allExpiries.get('SENSEX');
        if (!set) return [];

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        return Array.from(set)
            .filter(e => new Date(e) >= now)
            .sort();
    }

    getStrikes(symbol, expiry) {
        const sym = symbol.toUpperCase();
        let key = `${sym}-${expiry}`;
        let set = this.allStrikes.get(key);
        if (!set && sym === 'BSX') set = this.allStrikes.get(`SENSEX-${expiry}`);
        return set ? Array.from(set).sort((a, b) => a - b).map(s => s.toString()) : [];
    }

    getStrikesAround(symbol, expiry, centerStrike) {
        const sym = symbol.toUpperCase();
        let key = `${sym}-${expiry}`;
        let all = this.allStrikes.get(key);
        if (!all && sym === 'BSX') all = this.allStrikes.get(`SENSEX-${expiry}`);
        if (!all) return [];

        const sorted = Array.from(all).sort((a, b) => a - b);
        const center = parseInt(centerStrike);

        // Find index of the strike closest to center
        let idx = sorted.findIndex(s => s >= center);
        if (idx === -1) idx = sorted.length - 1;

        // Get 4 above and 4 below
        const start = Math.max(0, idx - 4);
        const end = Math.min(sorted.length, idx + 5);
        return sorted.slice(start, end).map(s => s.toString());
    }
}

module.exports = new ContractManager();
