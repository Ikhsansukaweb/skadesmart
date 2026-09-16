import Image from "next/image";

interface BrandLockupProps {
  size?: number;
  showText?: boolean;
  variant?: "single" | "dual";
}

// variant="single" (default): cuma logo SkadesMart - dipakai di Navbar, Home,
// dan header Landing Page.
// variant="dual": logo SMKN1 x logo SkadesMart berdampingan - KHUSUS Footer,
// sebagai identitas resmi "unit usaha sekolah ini".
export default function BrandLockup({ size = 32, showText = true, variant = "single" }: BrandLockupProps) {
  if (variant === "dual") {
    return (
      <span className="inline-flex items-center gap-2">
        <Image
          src="/logo-smkn1.png"
          alt="Logo SMK Negeri 1 Depok Sleman"
          width={size}
          height={size}
          className="object-contain shrink-0"
        />
        <span className="text-fog font-body text-sm" aria-hidden="true">x</span>
        <Image
          src="/logo-skadesmart.png"
          alt="Logo SkadesMart"
          width={40}
          height={40}
          className="object-contain shrink-0"
        />
        {showText && (
          <span className="font-heading font-semibold text-xl text-ink tracking-tight mt-0.5">SkadesMart</span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Image
        src="/logo-skadesmart.png"
        alt="Logo SkadesMart"
        width={40}
        height={40}
        className="object-contain shrink-0"
      />
      {showText && (
        <span className="font-heading font-semibold text-xl text-ink tracking-tight">SkadesMart</span>
      )}
    </span>
  );
}
