/**
 * Development-only script to reset the admin password.
 * 
 * Usage: node scripts/reset-admin-password.cjs
 * 
 * This script:
 * - Refuses to run against production (checks DATABASE_URL)
 * - Uses Node.js crypto scrypt for password hashing
 * - Resets the admin user's password hash in the database
 * - Accepts a new password through a hidden terminal prompt
 * - Never logs or stores the plaintext password
 */

const { PrismaClient } = require('@prisma/client');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL || !DATABASE_URL.includes('localhost')) {
  console.error('ERROR: This script can only run against a local development database.');
  console.error('DATABASE_URL:', DATABASE_URL || 'not set');
  process.exit(1);
}

const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter new password for admin@naijadeals.local: ', async (password) => {
  rl.close();

  if (password.length < 8) {
    console.error('ERROR: Password must be at least 8 characters.');
    process.exit(1);
  }

  try {
    // Generate scrypt hash: scrypt$<saltHex>$<hashHex>
    const { randomBytes } = require('crypto');
    const salt = randomBytes(16);
    const { scrypt: scryptCallback, timingSafeEqual } = require('crypto');
    const { promisify } = require('util');
    const scrypt = promisify(scryptCallback);
    
    const key = await scrypt(password, salt, 64);
    const hashedPassword = `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
    
    const prisma = new PrismaClient();
    
    // Find the admin user
    const adminUser = await prisma.user.findUnique({
      where: { email: 'admin@naijadeals.local' },
      include: { roles: { include: { role: true } } }
    });

    if (!adminUser) {
      console.error('ERROR: Admin user not found in database.');
      await prisma.$disconnect();
      process.exit(1);
    }

    // Check if user has admin role (check both actorType and roles)
    const isAdminByActor = adminUser.actorType === 'ADMIN';
    const roleNames = adminUser.roles?.map(r => r.role.name) || [];
    const hasAdminRole = roleNames.includes('admin') || isAdminByActor;
    if (!hasAdminRole) {
      console.error('ERROR: Admin user does not have the admin role. Roles found:', roleNames, 'actorType:', adminUser.actorType);
      await prisma.$disconnect();
      process.exit(1);
    }

    // Update the password hash
    await prisma.user.update({
      where: { email: 'admin@naijadeals.local' },
      data: { passwordHash: hashedPassword }
    });

    console.log('SUCCESS: Admin password has been reset.');
    console.log('Login URL: http://localhost:3000/login');
    console.log('Admin identifier: admin@naijadeals.local');
    await prisma.$disconnect();
  } catch (error) {
    console.error('ERROR: Failed to reset password:', error.message);
    process.exit(1);
  }

  process.exit(0);
});