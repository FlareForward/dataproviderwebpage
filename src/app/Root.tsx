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
    <div className="min-h-screen bg-[#1C2D47] text-[#FAFAFA] font-['Inter'] flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-[#2E3F56] bg-[#1C2D47] hidden lg:flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-[#2E3F56]">
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
        <div className="p-4 border-t border-[#2E3F56]">
          <div className="bg-[#243552] rounded-lg p-4 border border-[#2E3F56]">
            <h4 className="font-semibold text-sm mb-1">Network Status</h4>
            <div className="flex items-center gap-2 text-xs text-[#8FA0B8]">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Flare Mainnet - Operational
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-[#2E3F56] bg-[#1C2D47]/80 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between px-4 lg:px-8">
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

          <div className="hidden lg:flex items-center gap-2 bg-[#243552] border border-[#2E3F56] rounded-md px-3 py-1.5 w-80 focus-within:border-[#EE1A58] transition-colors">
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
          <nav className="lg:hidden border-b border-[#2E3F56] bg-[#1C2D47] p-4 space-y-1">
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
        `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          isActive
            ? "bg-[#EE1A58]/10 text-[#EE1A58] border border-[#EE1A58]/20"
            : "text-[#8FA0B8] hover:text-[#FAFAFA] hover:bg-[#2E3F56]/50"
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}
