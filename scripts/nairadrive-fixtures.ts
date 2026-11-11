/**
 * Isolated NaijaDrive browser/E2E fixtures.
 *
 * These accounts exist only in the explicitly chosen test database. They are
 * labelled `e2e-` so they cannot be mistaken for production partners, and the
 * password is a local test value, not a production credential.
 *
 * Usage:
 *   DATABASE_URL=<isolated test db> npx tsx scripts/nairadrive-fixtures.ts
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";

const prisma = new PrismaClient();

export const E2E_PASSWORD = "NairadriveE2E123!";
export const E2E_CUSTOMER_EMAIL = "e2e-customer@naijadeals.local";
export const E2E_DRIVER_EMAIL = "e2e-driver@naijadeals.local";
export const E2E_DRIVER2_EMAIL = "e2e-driver2@naijadeals.local";

async function role(name: string, description: string) {
  return prisma.role.upsert({
    where: { name },
    update: {},
    create: { name, description }
  });
}

export async function ensureNairadriveFixtures() {
  const [customerRole, driverRole] = await Promise.all([
    role("customer", "Buyer account"),
    role("driver", "NaijaDrive driver")
  ]);
  const passwordHash = await hashPassword(E2E_PASSWORD);

  const customer = await prisma.user.upsert({
    where: { email: E2E_CUSTOMER_EMAIL },
    update: { name: "E2E Rider", phone: "08030000001", passwordHash, actorType: "CUSTOMER" },
    create: {
      email: E2E_CUSTOMER_EMAIL,
      name: "E2E Rider",
      phone: "08030000001",
      passwordHash,
      actorType: "CUSTOMER",
      verifiedAt: new Date(),
      roles: { create: { roleId: customerRole.id } }
    }
  });
  const driverUser = await prisma.user.upsert({
    where: { email: E2E_DRIVER_EMAIL },
    update: { name: "E2E Driver", phone: "08030000002", passwordHash, actorType: "DRIVER" },
    create: {
      email: E2E_DRIVER_EMAIL,
      name: "E2E Driver",
      phone: "08030000002",
      passwordHash,
      actorType: "DRIVER",
      verifiedAt: new Date(),
      roles: { create: { roleId: driverRole.id } }
    }
  });

  const customerWallet = await prisma.wallet.findFirst({
    where: { userId: customer.id, ownerType: "CUSTOMER" }
  });
  if (customerWallet) {
    await prisma.wallet.update({
      where: { id: customerWallet.id },
      data: { availableKobo: 10_000_000n, heldKobo: 0n }
    });
  } else {
    await prisma.wallet.create({
      data: { ownerType: "CUSTOMER", userId: customer.id, availableKobo: 10_000_000n, heldKobo: 0n }
    });
  }

  const driverWallet = await prisma.wallet.findFirst({
    where: { userId: driverUser.id, ownerType: "DRIVER" }
  });
  if (!driverWallet) {
    await prisma.wallet.create({
      data: { ownerType: "DRIVER", userId: driverUser.id, availableKobo: 0n, heldKobo: 0n }
    });
  }

  const driver2User = await prisma.user.upsert({
    where: { email: E2E_DRIVER2_EMAIL },
    update: { name: "E2E Second Driver", phone: "08030000003", passwordHash, actorType: "DRIVER" },
    create: {
      email: E2E_DRIVER2_EMAIL,
      name: "E2E Second Driver",
      phone: "08030000003",
      passwordHash,
      actorType: "DRIVER",
      verifiedAt: new Date(),
      roles: { create: { roleId: driverRole.id } }
    }
  });

  const driver = await prisma.driverProfile.upsert({
    where: { userId: driverUser.id },
    update: {
      status: "approved",
      active: true,
      vehicleClass: "comfort",
      vehicleMake: "Toyota",
      vehicleModel: "Camry",
      vehiclePlate: "E2E-482-XA",
      licenseNumber: "E2E-DRV-0001",
      serviceZone: "Lagos",
      online: false,
      suspendedReason: null,
      foodDeliveryEnabled: false
    },
    create: {
      userId: driverUser.id,
      licenseNumber: "E2E-DRV-0001",
      status: "approved",
      vehicleClass: "comfort",
      vehicleMake: "Toyota",
      vehicleModel: "Camry",
      vehiclePlate: "E2E-482-XA",
      active: true,
      serviceZone: "Lagos"
    }
  });

  const driver2 = await prisma.driverProfile.upsert({
    where: { userId: driver2User.id },
    update: {
      status: "approved",
      active: true,
      vehicleClass: "economy",
      vehicleMake: "Honda",
      vehicleModel: "Accord",
      vehiclePlate: "E2E-771-YB",
      licenseNumber: "E2E-DRV-0002",
      serviceZone: "Lagos",
      online: false,
      suspendedReason: null,
      foodDeliveryEnabled: false
    },
    create: {
      userId: driver2User.id,
      licenseNumber: "E2E-DRV-0002",
      status: "approved",
      vehicleClass: "economy",
      vehicleMake: "Honda",
      vehicleModel: "Accord",
      vehiclePlate: "E2E-771-YB",
      active: true,
      serviceZone: "Lagos"
    }
  });

  const driver2Wallet = await prisma.wallet.findFirst({
    where: { userId: driver2User.id, ownerType: "DRIVER" }
  });
  if (!driver2Wallet) {
    await prisma.wallet.create({
      data: { ownerType: "DRIVER", userId: driver2User.id, availableKobo: 0n, heldKobo: 0n }
    });
  }

  // Clean only this fixture's work so repeated runs start from a known state.
  await prisma.ride.deleteMany({
    where: { OR: [{ riderId: customer.id }, { driverId: { in: [driver.id, driver2.id] } }] }
  });
  await prisma.locationPing.deleteMany({ where: { userId: { in: [driverUser.id, driver2User.id] } } });
  await prisma.systemEvent.deleteMany({
    where: {
      entity: "DriverProfile",
      entityId: { in: [driver.id, driver2.id] },
      type: { in: ["driver.online", "driver.offline"] }
    }
  });
  await prisma.driverProfile.updateMany({ where: { id: { in: [driver.id, driver2.id] } }, data: { online: false } });

  return {
    customer: { id: customer.id, email: customer.email, name: customer.name },
    driver: { id: driver.id, userId: driverUser.id, email: driverUser.email, name: driverUser.name },
    driver2: { id: driver2.id, userId: driver2User.id, email: driver2User.email, name: driver2User.name },
    password: E2E_PASSWORD
  };
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/nairadrive-fixtures.ts")) {
  ensureNairadriveFixtures()
    .then((result) => {
      console.log(
        JSON.stringify(
          {
            customer: result.customer.email,
            driver: result.driver.email,
            driver2: result.driver2.email,
            driverProfile: result.driver.id,
            driver2Profile: result.driver2.id,
            note: "Isolated E2E fixtures; no production data."
          },
          null,
          2
        )
      );
    })
    .finally(() => prisma.$disconnect());
}
