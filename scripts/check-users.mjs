import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: { roles: { include: { role: true } }, vendors: true }
  });
  console.log('Users count:', users.length);
  users.forEach(u => {
    console.log(' -', u.email, 'actorType:', u.actorType, 'roles:', u.roles.map(r => r.role.name));
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });