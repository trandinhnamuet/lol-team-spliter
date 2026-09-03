"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: [href: string, label: string][] = [
  ["/", "Chia team"],
  ["/results", "Kết quả đã lưu"],
  ["/admin", "Admin"],
];

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="ml-auto flex items-center gap-1">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} className="hex-nav-link" data-active={pathname === href}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
