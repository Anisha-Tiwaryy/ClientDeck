import { createApp } from './app.js';
import { migrate } from './db.js';

if (process.argv.includes('--migrate')) await migrate();
const port = Number(process.env.PORT || 5000);
createApp().listen(port, () => console.log(`ClientDeck API on http://localhost:${port}`));
