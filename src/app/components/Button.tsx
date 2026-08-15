import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "./ui/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "dark" | "gradient" | "action";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    const variants = {
      primary: "bg-[#EE1A58] text-white glass-glow hover:opacity-90",
      secondary:
        "bg-white/5 text-[#FAFAFA] border border-white/10 backdrop-blur-md hover:bg-white/10 hover:border-white/20",
      outline:
        "bg-white/5 text-[#FAFAFA] border border-white/15 backdrop-blur-md hover:bg-white/10 hover:border-[#EE1A58]/50",
      ghost: "bg-transparent text-[#FAFAFA] hover:bg-white/5",
      dark: "bg-gradient-to-br from-[#EE1A58] to-[#E85A95] text-white glass-glow hover:opacity-90",
      gradient:
        "bg-gradient-to-br from-[#EE1A58] via-[#E85A95] to-[#F0A8C8] text-white glass-glow hover:opacity-90",
      /* Quiet until hovered, then shimmer + ripple. See .btn-action in
         theme.css. For the things we want people to enjoy doing. */
      action: "btn-action",
    };

    const sizes = {
      sm: "h-9 px-3 text-[13px] rounded-lg",
      md: "h-10 px-4 text-[14px] rounded-xl",
      lg: "h-11 px-8 text-[16px] rounded-xl",
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
