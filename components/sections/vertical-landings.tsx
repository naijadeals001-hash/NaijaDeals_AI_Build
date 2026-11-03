import {
  BadgeCheck,
  Bot,
  Building2,
  CalendarCheck,
  Headphones,
  Music2,
  ShieldCheck,
  Sparkles,
  Wrench,
  Zap
} from "lucide-react";
import { ModuleLanding } from "./module-landing";

export function NaijaStayLanding() {
  return (
    <ModuleLanding
      name="NaijaStay"
      icon={Building2}
      headline="Shortlets and hotels you can verify before you pay"
      description="NaijaStay lists accommodation with power, safety and access details recorded up front. Booking opens only when verified properties, calendars and host payouts are connected."
      chips={["Verified hosts", "Escrow-protected", "Honest setup state"]}
      image={{ src: "/brand-photography/stay-waterfront-apartment.jpg", alt: "Brand illustration of a Lagos waterfront apartment at golden hour" }}
      secondaryImage={{ src: "/brand-photography/stay-courtyard-villa.jpg", alt: "Brand illustration of a courtyard villa with a pool at twilight" }}
      features={[
        { icon: BadgeCheck, title: "Verified properties", body: "Power, safety and access are recorded before a stay is published." },
        { icon: ShieldCheck, title: "Escrow hold", body: "Stay payments follow the same held-funds release rules as NaijaShop." },
        { icon: CalendarCheck, title: "No fake availability", body: "Calendars stay closed until a host and property are actually connected." }
      ]}
      status={{
        title: "Setup status",
        body: "Booking is not configured in this environment. There is no property inventory, availability calendar or host payout integration, so dates cannot be reserved rather than simulated."
      }}
      primaryCta={{ label: "Browse NaijaShop", href: "/naijashop" }}
      secondaryCta={{ label: "Become a host", href: "/sell" }}
      partner={{
        title: "Earn with NaijaStay",
        body: "Hosts keep control of their calendar and payout account; listings go live only after verification and a connected payout method.",
        links: [
          { label: "List a property", href: "/sell" },
          { label: "How verification works", href: "/help" }
        ]
      }}
    />
  );
}

export function NaijaStreamLanding() {
  return (
    <ModuleLanding
      name="NaijaStream"
      icon={Headphones}
      headline="African music, video and creator rooms in one place"
      description="NaijaStream is built for charts, creator rooms and licensed audio. Playback stays off until music licensing and a streaming provider are actually connected."
      chips={["Licensed catalogue", "Creator rooms", "Honest setup state"]}
      image={{ src: "/brand-photography/stream-studio-lagos.jpg", alt: "Brand illustration of a singer recording in a Lagos studio" }}
      secondaryImage={{ src: "/brand-photography/stream-rooftop-lagos.jpg", alt: "Brand illustration of a listener with headphones on a Lagos rooftop at sunset" }}
      features={[
        { icon: Music2, title: "Licensed catalogue", body: "Tracks are listed only with a licence that covers the market they play in." },
        { icon: Sparkles, title: "Creator rooms", body: "Artists can host rooms and releases from the same NaijaDeals account." },
        { icon: ShieldCheck, title: "No unlicensed playback", body: "Streaming is disabled rather than serving audio the platform cannot license." }
      ]}
      status={{
        title: "Setup status",
        body: "Streaming is not configured in this environment. No licensing agreement, media catalogue or playback provider is connected, so playback is disabled rather than simulated."
      }}
      primaryCta={{ label: "Explore NaijaShop", href: "/naijashop" }}
      secondaryCta={{ label: "For creators", href: "/sell" }}
      partner={{
        title: "Earn with NaijaStream",
        body: "Creators publish releases and rooms with transparent revenue terms once licensing and payout accounts are connected.",
        links: [
          { label: "Apply as a creator", href: "/sell" },
          { label: "Read the terms", href: "/help" }
        ]
      }}
    />
  );
}

export function AuraAiLanding() {
  return (
    <ModuleLanding
      name="Aura AI"
      icon={Bot}
      headline="An assistant that answers only from connected data"
      description="Aura helps across shopping, delivery and rides when a model provider and data policy are configured. Without them it stays off instead of inventing answers."
      chips={["Grounded answers", "Permission-aware", "Honest offline state"]}
      image={{ src: "/brand-photography/aura-concierge-lagos.jpg", alt: "Brand illustration of a customer using an AI concierge on her phone" }}
      secondaryImage={{ src: "/brand-photography/aura-orb-lagos.jpg", alt: "Brand illustration of a glowing assistant orb overlooking Lagos at night" }}
      features={[
        { icon: Zap, title: "Grounded answers", body: "Responses are limited to records the requesting account can actually see." },
        { icon: ShieldCheck, title: "Permission-aware", body: "Aura cannot read another account's orders, wallet or admin data." },
        { icon: Bot, title: "No invented support", body: "When no provider is configured, the assistant says so and links to human help." }
      ]}
      status={{
        title: "Setup status",
        body: "Aura is not configured in this environment. No model provider, retrieval index or data-processing agreement is connected, so the assistant is disabled rather than answering from guesses."
      }}
      primaryCta={{ label: "Browse NaijaShop", href: "/naijashop" }}
      secondaryCta={{ label: "Read how setup works", href: "/help" }}
    />
  );
}

export function NaijaGigsLanding() {
  return (
    <ModuleLanding
      name="NaijaGigs"
      icon={Wrench}
      headline="Verified pros for repairs, solar and design"
      description="NaijaGigs is the services vertical: vetted providers, scoped jobs and escrow-protected payments. Booking opens when provider onboarding and dispatch are connected."
      chips={["Vetted providers", "Escrow per job", "No invented reviews"]}
      image={{ src: "/real-photography/module-gigs.jpg", alt: "NaijaGigs brand artwork for verified service providers" }}
      features={[
        { icon: BadgeCheck, title: "Vetted providers", body: "Identity and trade evidence are checked before a provider can quote." },
        { icon: ShieldCheck, title: "Escrow per job", body: "Job funds release only when the customer confirms the work." },
        { icon: Wrench, title: "No invented reviews", body: "Ratings stay empty until real completed jobs exist." }
      ]}
      status={{
        title: "Setup status",
        body: "Job booking is not configured in this environment. Provider onboarding exists, but dispatch, scheduling and payouts are not connected, so booking is disabled rather than simulated."
      }}
      primaryCta={{ label: "Become a provider", href: "/sell" }}
      secondaryCta={{ label: "Browse NaijaShop", href: "/naijashop" }}
      partner={{
        title: "Earn with NaijaGigs",
        body: "Providers quote scoped jobs with escrow protection and a recorded completion trail.",
        links: [
          { label: "Apply as a provider", href: "/sell" },
          { label: "How payouts work", href: "/help" }
        ]
      }}
    />
  );
}
