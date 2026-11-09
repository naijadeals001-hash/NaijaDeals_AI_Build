-- AddForeignKey
ALTER TABLE "BulkQuoteRequest" ADD CONSTRAINT "BulkQuoteRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ProduceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
