import { createBrowserRouter } from "react-router";
import { Root } from "./Root";
import Home from "./Home";
import { DataProviders } from "./DataProviders";
import Analytics from "./Analytics";
import Rewards from "./Rewards";
import NftRewards from "./NftRewards";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: Home },
      { path: "providers", Component: DataProviders },
      { path: "delegation", Component: DataProviders },
      { path: "staking", Component: DataProviders },
      { path: "rewards", Component: Rewards },
      { path: "nft", Component: NftRewards },
      { path: "analytics", Component: Analytics },
    ],
  },
]);
