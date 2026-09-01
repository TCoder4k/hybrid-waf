import * as Flags from "country-flag-icons/react/3x2";

// The module only exports one named component per ISO code (no index
// signature) — this cast is what lets `FLAGS[countryCode]` do a dynamic
// lookup below.
type FlagComponent = (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element;
const FLAGS = Flags as unknown as Record<string, FlagComponent>;

interface CountryFlagProps {
  countryCode: string;
  className?: string;
}

// Real SVG flag icons, not the Unicode regional-indicator emoji trick
// (lib/flag.ts's old `countryCodeToFlagEmoji`, now removed) — Windows'
// default emoji font renders a flag emoji pair as plain two-letter text
// ("US", "AU") instead of an actual flag image, so those never looked like
// flags on a Windows demo machine. SVG icons render identically everywhere.
export function CountryFlag({ countryCode, className = "" }: CountryFlagProps) {
  const Flag = FLAGS[countryCode.toUpperCase()];
  if (!Flag) {
    return null;
  }
  return (
    <Flag
      className={`inline-block h-3.5 w-5 shrink-0 rounded-[2px] align-middle ${className}`}
    />
  );
}
