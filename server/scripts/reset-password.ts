// Sets a new password for an existing account, when nobody can log in anymore.
// The password is typed in the terminal (never passed on the command line, so it
// does not end up in the shell history).
//
//   cd server
//   npx ts-node scripts/reset-password.ts admin@example.com
import 'dotenv/config';
import readline from 'node:readline';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const BCRYPT_ROUNDS = 12; // same cost as routes/users.ts

/** Reads a line without echoing what is typed. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = rl as unknown as { _writeToOutput: (s: string) => void };
    let muted = false;
    output._writeToOutput = (s: string) => {
      if (!muted || s.includes('\n')) process.stdout.write(muted ? '\n' : s);
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Usage : npx ts-node scripts/reset-password.ts <email du compte>');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
    if (!user) {
      const emails = (await prisma.user.findMany({ select: { email: true } })).map((u) => u.email);
      console.error(`Aucun compte ${email}. Comptes existants : ${emails.join(', ') || 'aucun'}`);
      process.exit(1);
    }
    const password = await askHidden('Nouveau mot de passe (8 caractères minimum) : ');
    if (password.trim().length < 8) {
      console.error('Mot de passe trop court : rien n’a été changé.');
      process.exit(1);
    }
    const confirm = await askHidden('Confirmez le mot de passe : ');
    if (confirm !== password) {
      console.error('Les deux saisies sont différentes : rien n’a été changé.');
      process.exit(1);
    }
    await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(password, BCRYPT_ROUNDS) } });
    console.log(`Mot de passe de ${email} (${user.role}) mis à jour. Vous pouvez vous connecter.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
