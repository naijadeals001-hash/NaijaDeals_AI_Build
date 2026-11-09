-- AddForeignKey
ALTER TABLE "FoodDispatch" ADD CONSTRAINT "FoodDispatch_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "FoodOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
