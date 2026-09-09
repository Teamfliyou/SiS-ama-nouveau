import { createApp } from './lib/app';
import { prisma } from './lib/prisma';

const app = createApp();

const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    if ((await prisma.user.count()) === 0) {
      console.log('No user found — open the app to run the initial setup wizard.');
    }
  } catch {
    // Database might not be migrated yet; migrations are handled by prisma commands.
  }
});