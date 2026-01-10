const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// In-memory storage (replace with database in production)
let giftCards = {};
let currentPrice = null;

// Admin credentials (use environment variables in production)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Data file paths for persistence
const CARDS_FILE = path.join(__dirname, 'data', 'cards.json');
const PRICE_FILE = path.join(__dirname, 'data', 'price.json');

// Ensure data directory exists
async function ensureDataDirectory() {
    try {
        await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
    } catch (error) {
        console.error('Error creating data directory:', error);
    }
}

// Load data from files on startup
async function loadData() {
    try {
        // Load gift cards
        try {
            const cardsData = await fs.readFile(CARDS_FILE, 'utf8');
            giftCards = JSON.parse(cardsData);
            console.log(`Loaded ${Object.keys(giftCards).length} gift cards`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Error loading gift cards:', error);
            }
            giftCards = {};
        }

        // Load price data
        try {
            const priceData = await fs.readFile(PRICE_FILE, 'utf8');
            currentPrice = JSON.parse(priceData);
            console.log('Loaded current price:', currentPrice);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Error loading price data:', error);
            }
            currentPrice = null;
        }
    } catch (error) {
        console.error('Error in loadData:', error);
    }
}

// Save data to files
async function saveData() {
    try {
        await fs.writeFile(CARDS_FILE, JSON.stringify(giftCards, null, 2));
        await fs.writeFile(PRICE_FILE, JSON.stringify(currentPrice, null, 2));
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

// Authentication middleware
function authenticate(req, res, next) {
    const { username, password } = req.body;
    
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        next();
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
}

// API Routes

// Admin login
app.post('/api/admin/login', authenticate, (req, res) => {
    res.json({ success: true, message: 'Login successful' });
});

// Get current price
app.get('/api/price', (req, res) => {
    res.json({ 
        success: true, 
        price: currentPrice 
    });
});

// Update price (admin only)
app.post('/api/admin/price', authenticate, async (req, res) => {
    try {
        const { amount, currency } = req.body;
        
        if (typeof amount !== 'number' || amount < 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid price amount' 
            });
        }
        
        if (!currency || typeof currency !== 'string') {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid currency' 
            });
        }
        
        currentPrice = {
            amount: amount,
            currency: currency,
            updatedAt: new Date().toISOString()
        };
        
        await saveData();
        
        res.json({ 
            success: true, 
            message: 'Price updated successfully',
            price: currentPrice
        });
    } catch (error) {
        console.error('Error updating price:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

// Validate gift card
app.post('/api/validate', async (req, res) => {
    try {
        const { code } = req.body;
        
        if (!code || typeof code !== 'string' || code.length > 25 || !/^[A-Z0-9]{1,25}$/.test(code)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid gift card format' 
            });
        }
        
        // If card doesn't exist, create it with pending status
        if (!giftCards[code]) {
            giftCards[code] = {
                code: code,
                status: 'pending',
                createdAt: new Date().toISOString()
            };
            await saveData();
        }
        
        const card = giftCards[code];
        
        res.json({ 
            success: true, 
            card: card,
            globalPrice: currentPrice
        });
    } catch (error) {
        console.error('Error validating card:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

// Get all cards (admin only)
app.post('/api/admin/cards', authenticate, (req, res) => {
    const cards = Object.values(giftCards);
    res.json({ 
        success: true, 
        cards: cards 
    });
});

// Update card status (admin only)
app.post('/api/admin/cards/status', authenticate, async (req, res) => {
    try {
        const { code, status } = req.body;
        
        if (!code || !giftCards[code]) {
            return res.status(404).json({ 
                success: false, 
                message: 'Gift card not found' 
            });
        }
        
        if (!['pending', 'accepted', 'declined'].includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid status' 
            });
        }
        
        giftCards[code].status = status;
        giftCards[code].updatedAt = new Date().toISOString();
        
        await saveData();
        
        res.json({ 
            success: true, 
            message: 'Status updated successfully',
            card: giftCards[code]
        });
    } catch (error) {
        console.error('Error updating card status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

// Update card price (admin only)
app.post('/api/admin/cards/price', authenticate, async (req, res) => {
    try {
        const { code, amount } = req.body;
        
        if (!code || !giftCards[code]) {
            return res.status(404).json({ 
                success: false, 
                message: 'Gift card not found' 
            });
        }
        
        if (typeof amount !== 'number' || amount < 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid price amount' 
            });
        }
        
        // Use global price currency or default to USD
        const currency = currentPrice ? currentPrice.currency : 'USD';
        
        giftCards[code].price = {
            amount: amount,
            currency: currency
        };
        giftCards[code].updatedAt = new Date().toISOString();
        
        await saveData();
        
        res.json({ 
            success: true, 
            message: 'Price updated successfully',
            card: giftCards[code]
        });
    } catch (error) {
        console.error('Error updating card price:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

// Get statistics (admin only)
app.post('/api/admin/stats', authenticate, (req, res) => {
    const cards = Object.values(giftCards);
    const stats = {
        total: cards.length,
        accepted: cards.filter(card => card.status === 'accepted').length,
        declined: cards.filter(card => card.status === 'declined').length,
        pending: cards.filter(card => card.status === 'pending').length
    };
    
    res.json({ 
        success: true, 
        stats: stats 
    });
});

// Serve HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        success: false, 
        message: 'Something went wrong!' 
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        message: 'Endpoint not found' 
    });
});

// Initialize and start server
async function startServer() {
    await ensureDataDirectory();
    await loadData();
    
    app.listen(PORT, () => {
        console.log(`Gift Card Validator server running on port ${PORT}`);
        console.log(`Customer interface: http://localhost:${PORT}`);
        console.log(`Admin interface: http://localhost:${PORT}/admin`);
        console.log(`Admin credentials: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
    });
}

// Save data on process exit
process.on('SIGINT', async () => {
    console.log('\nSaving data before exit...');
    await saveData();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Saving data before exit...');
    await saveData();
    process.exit(0);
});

startServer().catch(console.error);