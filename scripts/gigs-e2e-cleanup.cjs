/**
 * Removes the isolated NaijaGigs e2e fixture created by gigs-e2e-tests.mjs.
 * Deletes the fixture professional's data and reverses the money it moved:
 * the funded booking, the ledger postings and the fixture user's wallet.
 * Existing platform data is untouched.
 *
 * Usage: node scripts/gigs-e2e-cleanup.cjs <stamp>
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const stamp = process.argv[2];
  if (!stamp || !/^[a-z0-9]+$/i.test(stamp)) {
    console.error("Usage: node scripts/gigs-e2e-cleanup.cjs <stamp>");
    process.exit(1);
  }
  const email = `gigspro-${stamp}@test.local`;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(JSON.stringify({ status: "nothing_to_clean", email }));
    await prisma.$disconnect();
    return;
  }

  const profiles = await prisma.professionalProfile.findMany({ where: { userId: user.id }, select: { id: true } });
  const profileIds = profiles.map((profile) => profile.id);
  const listings = await prisma.serviceListing.findMany({ where: { professionalId: { in: profileIds } }, select: { id: true } });
  const listingIds = listings.map((listing) => listing.id);
  const bookings = await prisma.serviceBooking.findMany({ where: { professionalId: user.id } });

  // 1) Reverse the money with balanced postings BEFORE removing anything, so
  //    wallet balances stay aligned with the retained ledger history.
  //    Completed booking shape: customer funded AMOUNT; on release the pro
  //    received AMOUNT - commission and SYSTEM received commission.
  for (const booking of bookings) {
    if (booking.paymentStatus === "RELEASED") {
      const amount = booking.amountKobo;
      const commission = amount * BigInt(booking.commissionBps) / 10000n;
      const net = amount - commission;
      const customer = await prisma.wallet.findFirstOrThrow({ where: { userId: booking.customerId } });
      const system = await prisma.wallet.findFirstOrThrow({ where: { ownerType: "SYSTEM" } });
      const proWallet = await prisma.wallet.findFirst({ where: { userId: user.id } });
      await prisma.$transaction(async (tx) => {
        const existing = await tx.walletTransaction.findUnique({ where: { reference: `gig:${booking.reference}:reversal` } });
        if (existing) return;
        await tx.wallet.update({ where: { id: customer.id }, data: { availableKobo: { increment: amount } } });
        await tx.wallet.update({ where: { id: system.id }, data: { availableKobo: { decrement: commission } } });
        if (proWallet) {
          await tx.wallet.update({ where: { id: proWallet.id }, data: { availableKobo: { decrement: net } } });
        }
        await tx.walletTransaction.create({
          data: {
            walletId: customer.id,
            type: "refund",
            amountKobo: amount,
            reference: `gig:${booking.reference}:reversal`,
            description: `NaijaGigs e2e fixture reversal for ${booking.reference}`,
            ledger: {
              create: [
                { walletId: customer.id, direction: "CREDIT", amountKobo: amount, memo: "Fixture booking reversed to customer" },
                { walletId: system.id, direction: "DEBIT", amountKobo: commission, memo: "Fixture commission reversed" },
                ...(proWallet ? [{ walletId: proWallet.id, direction: "DEBIT", amountKobo: net, memo: "Fixture earnings reversed" }] : [])
              ]
            }
          }
        });
      }, { isolationLevel: "Serializable" });
    }
  }

  // 2) Remove fixture content rows. Ledger history is KEPT (balanced above);
  //    deleting the user nulls its wallet userId, leaving an orphaned
  //    zero-balance wallet that reconciliation can still see and verify.
  await prisma.$transaction(async (tx) => {
    await tx.serviceReview.deleteMany({ where: { professionalId: user.id } });
    await tx.message.deleteMany({ where: { conversation: { professionalId: user.id } } });
    await tx.conversation.deleteMany({ where: { professionalId: user.id } });
    await tx.bookingMilestone.deleteMany({ where: { bookingId: { in: bookings.map((b) => b.id) } } });
    await tx.serviceDispute.deleteMany({ where: { bookingId: { in: bookings.map((b) => b.id) } } });
    await tx.serviceBooking.deleteMany({ where: { id: { in: bookings.map((b) => b.id) } } });
    await tx.serviceListingImage.deleteMany({ where: { listingId: { in: listingIds } } });
    await tx.serviceListing.deleteMany({ where: { id: { in: listingIds } } });
    await tx.portfolioItem.deleteMany({ where: { professionalId: { in: profileIds } } });
    await tx.serviceArea.deleteMany({ where: { professionalId: { in: profileIds } } });
    await tx.availabilitySlot.deleteMany({ where: { professionalId: { in: profileIds } } });
    await tx.professionalCategory.deleteMany({ where: { professionalId: { in: profileIds } } });
    await tx.professionalProfile.deleteMany({ where: { id: { in: profileIds } } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.userRole.deleteMany({ where: { userId: user.id } });
    await tx.auditLog.deleteMany({ where: { actorId: user.id } });
    await tx.systemEvent.deleteMany({ where: { actorId: user.id } });
    await tx.user.delete({ where: { id: user.id } });
  });

  console.log(JSON.stringify({ status: "cleaned", email, bookings: bookings.length, listings: listingIds.length, reversalsPosted: bookings.filter((b) => b.paymentStatus === "RELEASED").length }));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
