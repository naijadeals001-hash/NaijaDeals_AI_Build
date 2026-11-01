import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'admin@naijadeals.local' }, include: { roles: true } });
  console.log('Admin user found:', user ? 'YES' : 'NO');
  if (user) {
    console.log('passwordHash:', user.passwordHash);
    console.log('name:', user.name);
    console.log('actorType:', user.actorType);
    console.log('roles:', user.roles.map(r => r.role.name));
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });