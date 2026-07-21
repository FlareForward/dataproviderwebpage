import { ReactNode } from "react";
import { cn } from "./ui/utils";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "glass-card overflow-hidden text-[#FAFAFA]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("relative px-6 py-5 border-b border-white/8", className)}>{children}</div>;
}

export function CardTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <h3 className={cn("text-[1.25rem] font-semibold tracking-tight text-[#FAFAFA]", className)}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn("text-[0.875rem] text-[#8FA0B8] mt-1.5", className)}>{children}</p>;
}

export function CardContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("relative p-6", className)}>{children}</div>;
}
