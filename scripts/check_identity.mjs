import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const m = await db.smsMessage.findUnique({ where: { id: 'cmu5hicgo0gunoee98proihos' } });
console.log('phone:', m.phone, '| status:', m.status);
console.log('body:', JSON.stringify(m.message));
console.log('providerResponse:', m.providerResponse);
await db.$disconnect();
