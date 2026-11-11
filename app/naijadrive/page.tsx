import type { Metadata } from "next";
import { DriveLanding } from "@/components/drive/drive-landing";
import type { ServiceCity } from "@/components/drive/types";
import { getSessionUser, isDriver } from "@/lib/auth/session";
import { listCityActivations } from "@/lib/services/core/city.service";
import { DRIVE_CITY, findPlace, findVehicleClass, type VehicleClassId } from "@/lib/config/drive";

export const metadata: Metadata = {
  title: "NaijaDrive — Your city. Your move.",
  description:
    "Book a NaijaDrive passenger ride in Lagos with a server-calculated fare, approved drivers and real trip records."
};

export const dynamic = "force-dynamic";

/**
 * Canonical NaijaDrive landing page.
 *
 * City activation is read from the same Control Center records the rest of the
 * platform uses; NaijaDrive dispatch itself is limited to Lagos in this build, and
 * the checker says so instead of implying national coverage.
 */
export default async function Page({
  searchParams
}: {
  searchParams?: { pickup?: string; dropoff?: string; class?: string };
}) {
  const user = await getSessionUser();
  let serviceCities: ServiceCity[] = [];
  try {
    serviceCities = await listCityActivations();
  } catch {
    // The checker renders an explicit unavailable message rather than inventing
    // city availability when the activation table cannot be read.
    serviceCities = [];
  }

  const pickup = findPlace(searchParams?.pickup)?.id ?? "computer-village";
  const dropoff = findPlace(searchParams?.dropoff)?.id ?? "victoria-island";
  const vehicleClass = (findVehicleClass(searchParams?.class)?.id ?? "economy") as VehicleClassId;

  return (
    <DriveLanding
      viewer={user ? { name: user.name, isDriver: isDriver(user) } : null}
      serviceCities={serviceCities}
      initial={{ pickup, dropoff, vehicleClass }}
    />
  );
}
