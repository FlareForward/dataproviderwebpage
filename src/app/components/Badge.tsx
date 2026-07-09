import { ReactNode } from "react";
import { cn } from "./ui/utils";

interface BadgeProps {
  className?: string;
  variant?: "primary" | "rose" | "dark" | "outline" | "success";
  children: ReactNode;
}

export function Badge({ className, variant = "dark", children }: BadgeProps) {
  const variants = {
    primary: "bg-[#EE1A58] text-white",
    rose: "bg-gradient-to-r from-[#EC4899] to-[#F43F5E] text-white",
    dark: "bg-[#1D2430] text-[#FAFAFA] border border-[#2E3F56]",
    outline: "bg-transparent text-[#FAFAFA] border border-[#2E3F56]",
    success: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold font-['Inter'] transition-colors",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
