const { PrismaClient } = require("@prisma/client");

// A single shared Prisma instance for the whole process.
const prisma = new PrismaClient();

module.exports = prisma;
