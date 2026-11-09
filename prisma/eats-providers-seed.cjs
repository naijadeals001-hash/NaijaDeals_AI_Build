/**
 * Demonstration delivery providers for NaijaEats dispatch testing.
 *
 * Creates isolated, clearly labelled providers on BOTH platforms:
 *   - NaijaSend couriers (motorcycle) — foodDeliveryEnabled, online, in zone.
 *   - NaijaDrive drivers (motorcycle and car) — opted in, insulated bag.
 *
 * These are test fixtures for the local TEST database only. They are named
 * "Demo" and belong to accounts under @naijaeats.demo so they can never be
 * mistaken for real riders.
 *
 * Idempotent. Usage: node prisma/eats-providers-seed.cjs
 */
const { PrismaClient } = require("@prisma/client");
const { scryptSync, randomBytes } = require("node:crypto");

const prisma = new PrismaClient();
const hash = (password) => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`;
};

const COURIERS = [
  { email: "demo.rider.moto@naijaeats.demo", name: "Demo Rider — Motorcycle", vehicleType: "motorcycle", plate: "KJA-101-DM", zone: "Lagos" },
  { email: "demo.rider.car@naijaeats.demo", name: "Demo Rider — Car (NaijaSend)", vehicleType: "car", plate: "KJB-202-DM", zone: "Lagos" }
];

const DRIVERS = [
  { email: "demo.driver.moto@naijaeats.demo", name: "Demo Driver — Motorcycle (NaijaDrive)", foodVehicleType: "motorcycle", make: "Bajaj", model: "Boxer", plate: "KJC-303-DM", zone: "Lagos" },
  { email: "demo.driver.car@naijaeats.demo", name: "Demo Driver — Car (NaijaDrive)", foodVehicleType: "car", make: "Toyota", model: "Corolla", plate: "KJD-404-DM", zone: "Lagos" }
];

(async () => {
  const summary = { couriers: 0, drivers: 0, accounts: [] };

  for (const courier of COURIERS) {
    const user = await prisma.user.upsert({
      where: { email: courier.email },
      update: { name: courier.name },
      create: { email: courier.email, name: courier.name, passwordHash: hash("NaijaEatsDemo2026!"), actorType: "COURIER" }
    });
    await prisma.courier.upsert({
      where: { userId: user.id },
      update: { name: courier.name, active: true, foodDeliveryEnabled: true, vehicleType: courier.vehicleType, vehiclePlate: courier.plate, serviceZone: courier.zone, online: true },
      create: { userId: user.id, name: courier.name, phone: "08000000000", active: true, foodDeliveryEnabled: true, vehicleType: courier.vehicleType, vehiclePlate: courier.plate, serviceZone: courier.zone, online: true }
    });
    summary.couriers += 1;
    summary.accounts.push(courier.email);
  }

  for (const driver of DRIVERS) {
    const user = await prisma.user.upsert({
      where: { email: driver.email },
      update: { name: driver.name },
      create: { email: driver.email, name: driver.name, passwordHash: hash("NaijaEatsDemo2026!"), actorType: "DRIVER" }
    });
    await prisma.driverProfile.upsert({
      where: { userId: user.id },
      update: {
        vehicleMake: driver.make,
        vehicleModel: driver.model,
        vehiclePlate: driver.plate,
        active: true,
        status: "approved",
        foodDeliveryEnabled: true,
        foodVehicleType: driver.foodVehicleType,
        insulatedBag: true,
        serviceZone: driver.zone,
        online: true
      },
      create: {
        userId: user.id,
        licenseNumber: `DEMO-${driver.plate}`,
        status: "approved",
        vehicleClass: driver.foodVehicleType === "motorcycle" ? "bike" : "car",
        vehicleMake: driver.make,
        vehicleModel: driver.model,
        vehiclePlate: driver.plate,
        active: true,
        foodDeliveryEnabled: true,
        foodVehicleType: driver.foodVehicleType,
        insulatedBag: true,
        serviceZone: driver.zone,
        online: true
      }
    });
    summary.drivers += 1;
    summary.accounts.push(driver.email);
  }

  console.log(JSON.stringify(summary, null, 1));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
