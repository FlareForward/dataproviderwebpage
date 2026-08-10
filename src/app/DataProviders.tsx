import * as Tabs from "@radix-ui/react-tabs";
import { useLocation } from "react-router";
import { Delegation } from "./Delegation";
import { Staking } from "./Staking";

/**
 * /delegation and /staking — the action center. Both journeys target
 * FlareForward only: this site offers no directory of other providers or
 * validators. (The old /providers route lands here too, on the delegate tab.)
 */
export function DataProviders() {
  const location = useLocation();
  const defaultTab = location.pathname.includes("staking") ? "staking" : "delegation";

  return (
    <div className="p-4 lg:p-8 flex-1 flex flex-col h-full overflow-hidden">
      <div className="max-w-7xl mx-auto w-full space-y-6 flex-1 flex flex-col">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
            Delegate &amp; Stake with FlareForward
          </h1>
          <p className="text-[#8FA0B8] text-sm mt-1">
            Put your FLR to work with the builders — non-custodial, reversible,
            and done in about a minute.
          </p>
        </div>

        <Tabs.Root defaultValue={defaultTab} className="flex-1 flex flex-col">
          <Tabs.List className="flex border-b border-white/8 mb-6">
            <Tabs.Trigger
              value="delegation"
              className="px-6 py-3 text-sm font-medium text-[#8FA0B8] hover:text-[#FAFAFA] border-b-2 border-transparent data-[state=active]:border-[#EE1A58] data-[state=active]:text-[#EE1A58] transition-colors"
            >
              Delegate WFLR
            </Tabs.Trigger>
            <Tabs.Trigger
              value="staking"
              className="px-6 py-3 text-sm font-medium text-[#8FA0B8] hover:text-[#FAFAFA] border-b-2 border-transparent data-[state=active]:border-[#EE1A58] data-[state=active]:text-[#EE1A58] transition-colors"
            >
              Stake on P-chain
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="delegation" className="flex-1 outline-none">
            <Delegation />
          </Tabs.Content>

          <Tabs.Content value="staking" className="flex-1 outline-none">
            <Staking />
          </Tabs.Content>
        </Tabs.Root>
      </div>
    </div>
  );
}
