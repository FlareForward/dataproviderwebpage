import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "./ui/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "dark" | "gradient";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    const variants = {
      primary: "bg-[#EE1A58] text-white hover:opacity-90",
      secondary: "bg-[#1D2430] text-[#FAFAFA] hover:bg-[#2E3F56]",
      outline: "bg-transparent text-[#FAFAFA] border-2 border-[#2E3F56] hover:bg-[#1D2430]",
      ghost: "bg-transparent text-[#FAFAFA] hover:bg-[#1D2430]",
      dark: "bg-gradient-to-br from-[#EE1A58] to-[#E85A95] text-white hover:opacity-90",
      gradient: "bg-gradient-to-br from-[#EE1A58] via-[#E85A95] to-[#F0A8C8] text-white hover:opacity-90",
    };

    const sizes = {
      sm: "h-9 px-3 text-[13px] rounded-md",
      md: "h-10 px-4 text-[14px] rounded-lg",
      lg: "h-11 px-8 text-[16px] rounded-lg",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-semibold font-['Inter'] transition-all disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
