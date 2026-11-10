/**
 * Proves the durable dispatch sweeper and the worker supervision guarantees.
 *
 *   npx tsx scripts/worker-verify.ts
 *
 * Starts TWO worker processes against the same queue, creates rides whose
 * assignment deadline has already passed, and fires two sweeps so both workers
 * race. Each ride must be released exactly once — one event row, one status
 * change — no matter how many workers run.
 *
 * Cleans up every row it creates.
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { Queue } from "bullmq";
import { prisma } from "../lib/prisma";
import { readHeartbeat } from "../lib/infra/heartbeat";
import { queuePrefix } from "../lib/infra/queue";
import { closeCache } from "../lib/infra/cache";

const runId = randomUUID().slice(0, 8);
const children: ChildProcess[] = [];
type Row = { name: string; status: "PASS" | "FAIL"; detail: string };
const rows: Row[] = [];

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function check(name: string, run: () => Promise<string>) {
  try {
    rows.push({ name, status: "PASS", detail: await run() });
  } catch (error) {
    rows.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
}

function startWorker(label: string): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn("cmd.exe", ["/d", "/c", "npx", "tsx", "scripts/infra-worker.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, WORKER_LABEL: label },
      windowsHide: true
    });
    let started = false;
    const timer = setTimeout(() => reject(new Error(`${label} did not start within 40s`)), 40_000);
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      if (!started && chunk.includes("worker.started")) {
        started = true;
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.stderr?.setEncoding("utf8");
    child.on("exit", (code) => {
      if (!started) {
        clearTimeout(timer);
        reject(new Error(`${label} exited early (code ${code})`));
      }
    });
    children.push(child);
  });
}

async function main() {
  const rider = await prisma.user.create({
    data: { email: `worker-verify-rider-${runId}@example.test`, name: "Sweep Rider", actorType: "CUSTOMER" }
  });
  const driverUser = await prisma.user.create({
    data: { email: `worker-verify-driver-${runId}@example.test`, name: "Sweep Driver", actorType: "DRIVER" }
  });
  const driver = await prisma.driverProfile.create({
    data: {
      userId: driverUser.id,
      licenseNumber: `LIC-${runId}`,
      vehicleMake: "Toyota",
      vehicleModel: "Corolla",
      vehiclePlate: `ND${runId.slice(0, 5).toUpperCase()}`
    }
  });

  const rideIds: string[] = [];
  for (const index of [1, 2]) {
    const ride = await prisma.ride.create({
      data: {
        rideNumber: `SWEEP-${runId}-${index}`,
        riderId: rider.id,
        driverId: driver.id,
        status: "driver_assigned",
        pickupLabel: "Marina",
        pickupLat: 6.4531,
        pickupLng: 3.3941,
        pickupAddress: "Marina, Lagos Island",
        dropoffLabel: "Ikeja",
        dropoffLat: 6.6018,
        dropoffLng: 3.3506,
        dropoffAddress: "Allen Avenue, Ikeja",
        vehicleClass: "economy",
        distanceMeters: 22_000,
        durationMinutes: 19,
        fareKobo: BigInt(1_900_000),
        paymentMethod: "cash",
        acceptedAt: new Date(Date.now() - 20 * 60_000),
        assignmentExpiresAt: new Date(Date.now() - 5 * 60_000)
      }
    });
    rideIds.push(ride.id);
  }

  try {
    await check("two worker processes start", async () => {
      await startWorker("worker-a");
      await startWorker("worker-b");
      return "both workers reached worker.started";
    });

    await check("heartbeat is written", async () => {
      const beat = await readHeartbeat();
      if (!beat) throw new Error("no heartbeat key");
      return `heartbeat from pid ${beat.pid}, queues ${beat.queues.join(",")}`;
    });

    await check("concurrent sweeps release each ride exactly once", async () => {
      const parsed = new URL(process.env.VALKEY_URL!);
      const queue = new Queue("drive-expiry", {
        prefix: queuePrefix(),
        connection: {
          host: parsed.hostname,
          port: Number(parsed.port || 6379),
          password: decodeURIComponent(parsed.password || "")
        }
      });

      // Two jobs, two workers: the same sweep runs concurrently.
      await queue.add("sweep", { verification: runId }, { jobId: `verify-a-${runId}` });
      await queue.add("sweep", { verification: runId }, { jobId: `verify-b-${runId}` });
      await queue.close();

      const deadline = Date.now() + 60_000;
      let pending = rideIds.length;
      while (Date.now() < deadline) {
        pending = await prisma.ride.count({ where: { id: { in: rideIds }, status: "driver_assigned" } });
        if (pending === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      assert(pending === 0, `${pending} ride(s) were never released`);

      const events = await prisma.rideEvent.groupBy({
        by: ["rideId"],
        where: { rideId: { in: rideIds }, label: { contains: "did not respond" } },
        _count: { _all: true }
      });
      for (const rideId of rideIds) {
        const row = events.find((event) => event.rideId === rideId);
        if (!row) throw new Error(`no expiry event for ${rideId}`);
        assert(row._count._all === 1, `ride ${rideId} produced ${row._count._all} expiry events`);
      }

      const released = await prisma.ride.findMany({
        where: { id: { in: rideIds } },
        select: { status: true, driverId: true }
      });
      assert(released.every((ride) => ride.status === "requested" && ride.driverId === null), "a ride is not back in the queue");
      return `2 rides released, 1 event each, status requested, driver cleared`;
    });

    await check("expiry notification queued once per rider", async () => {
      const notes = await prisma.notification.findMany({
        where: { userId: rider.id, eventType: "dispatch.ride_expired" }
      });
      assert(notes.length === rideIds.length, `${notes.length} notifications for ${rideIds.length} rides`);
      return `${notes.length} notifications, one per released ride`;
    });
  } finally {
    for (const child of children) {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    }
    await prisma.rideEvent.deleteMany({ where: { rideId: { in: rideIds } } }).catch(() => undefined);
    await prisma.ride.deleteMany({ where: { id: { in: rideIds } } }).catch(() => undefined);
    await prisma.partnerNotification.deleteMany({ where: { userId: rider.id } }).catch(() => undefined);
    await prisma.notification.deleteMany({ where: { entityId: { in: rideIds } } }).catch(() => undefined);
    await prisma.driverProfile.deleteMany({ where: { id: driver.id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [rider.id, driverUser.id] } } }).catch(() => undefined);
  }

  const width = Math.max(...rows.map((row) => row.name.length));
  for (const row of rows) {
    console.log(`${row.status.padEnd(4)} ${row.name.padEnd(width)}  ${row.detail}`);
  }
  const failed = rows.filter((row) => row.status === "FAIL").length;
  console.log(`\n${rows.length - failed} passed, ${failed} failed`);

  await closeCache();
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (error) => {
  console.error("worker verification crashed:", error);
  for (const child of children) {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  }
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
