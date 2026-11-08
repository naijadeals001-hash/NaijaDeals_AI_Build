import {
  BatteryCharging,
  Building,
  Cpu,
  Droplet,
  ExternalLink,
  Palette,
  Users,
  Wrench,
} from "lucide-react";

const categoryIcon = (name: string) => {
  const key = name.toLowerCase();
  if (/electric|solar|power|energy/.test(key)) return BatteryCharging;
  if (/plumb|pipe|water/.test(key)) return Droplet;
  if (/carp|build|wood|frame/.test(key)) return Building;
  if (/clean|wash|sanit/.test(key)) return ExternalLink;
  if (/design|creative|art|graphic/.test(key)) return ExternalLink;
  if (/dev|code|software|app|tech|digital/.test(key)) return Cpu;
  if (/cater|food|event|cook/.test(key)) return Users;
  return Wrench;
};

export { categoryIcon };