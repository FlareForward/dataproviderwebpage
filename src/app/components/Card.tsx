import { ReactNode } from "react";
import { cn } from "./ui/utils";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "bg-[#243552] border border-[#2E3F56] rounded-[8px] overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.3)] text-[#FAFAFA]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-6 py-5 border-b border-[#2E3F56]", className)}>{children}</div>;
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
  return <div className={cn("p-6", className)}>{children}</div>;
}
