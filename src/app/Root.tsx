import { useState } from "react";
import { Outlet, NavLink } from "react-router";
import { LayoutDashboard, Search, Server, Menu, X } from "lucide-react";
import { Button } from "./components/Button";
import { ConnectWallet } from "./components/ConnectWallet";
import { ImageWithFallback } from "./components/figma/ImageWithFallback";
import logoImage from "../imports/flareforward_logo.png";

export function Root() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="relative min-h-screen bg-[#1C2D47] text-[#FAFAFA] font-['Inter'] flex overflow-hidden">
      {/* Ambient background glows — the "liquid glass" backdrop */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -left-40 h-[36rem] w-[36rem] rounded-full bg-[#EE1A58]/20 blur-[130px]" />
        <div className="absolute top-1/3 -right-48 h-[40rem] w-[40rem] rounded-full bg-[#7C3AED]/15 blur-[140px]" />
        <div className="absolute -bottom-48 left-1/4 h-[32rem] w-[32rem] rounded-full bg-[#E85A95]/15 blur-[130px]" />
      </div>

      {/* Sidebar */}
      <aside className="relative z-10 w-64 border-r border-white/8 glass-surface hidden lg:flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-white/8">
          <div className="flex items-center gap-3">
            <ImageWithFallback src={logoImage} alt="FlareForward Logo" className="h-8 w-auto object-contain" />
            <span className="font-extrabold text-lg tracking-tight bg-gradient-to-br from-[#EE1A58] to-[#E85A95] bg-clip-text text-transparent">
              FlareForward
            </span>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <NavItem to="/" icon={<LayoutDashboard size={20} />} label="Overview" />
          <NavItem to="/providers" icon={<Server size={20} />} label="Infrastructure Providers" />
        </nav>
        <div className="p-4 border-t border-white/8">
          <div className="glass-panel p-4">
            <h4 className="font-semibold text-sm mb-1">Network Status</h4>
            <div className="flex items-center gap-2 text-xs text-[#8FA0B8]">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Flare Mainnet - Operational
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-white/8 glass-surface sticky top-0 z-20 flex items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-4 lg:hidden">
            <Button
              variant="ghost"
              size="sm"
              className="px-2"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </Button>
            <div className="flex items-center gap-2">
              <ImageWithFallback src={logoImage} alt="FlareForward Logo" className="h-7 w-auto object-contain" />
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-2 glass-panel px-3 py-1.5 w-80 focus-within:border-[#EE1A58]/60 transition-colors">
            <Search size={16} className="text-[#8FA0B8]" />
            <input
              type="text"
              placeholder="Search providers, validators, or tokens..."
              className="bg-transparent border-none outline-none text-sm w-full placeholder:text-[#8FA0B8] text-[#FAFAFA]"
            />
          </div>

          <div className="flex items-center gap-3">
            <ConnectWallet />
          </div>
        </header>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="lg:hidden relative z-10 border-b border-white/8 glass-surface p-4 space-y-1">
            <NavItem
              to="/"
              icon={<LayoutDashboard size={20} />}
              label="Overview"
              onClick={() => setMobileMenuOpen(false)}
            />
            <NavItem
              to="/providers"
              icon={<Server size={20} />}
              label="Infrastructure Providers"
              onClick={() => setMobileMenuOpen(false)}
            />
          </nav>
        )}

        {/* Dynamic Content */}
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function NavItem({
  icon,
  label,
  to,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  to: string;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
          isActive
            ? "bg-[#EE1A58]/15 text-[#EE1A58] border border-[#EE1A58]/30 glass-glow"
            : "text-[#8FA0B8] hover:text-[#FAFAFA] hover:bg-white/5"
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}
