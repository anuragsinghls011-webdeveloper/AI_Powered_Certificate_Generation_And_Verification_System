require('dotenv').config();
const { app, mountBulkRoutes } = require('./app');
const { connectDB } = require('./config/db');
const { seedInitialData } = require('./services/seedService');

const PORT = process.env.PORT || 8001;

async function start() {
  try {
    const db = await connectDB();

    // Mount bulk generation routes (requires db instance)
    mountBulkRoutes(db);

    // Seed default data on first run
    await seedInitialData();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Node.js Express backend server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
