import { createBrowserRouter } from "react-router";
import { Root } from "./Root";
import Dashboard from "./Dashboard";
import { DataProviders } from "./DataProviders";
import Analytics from "./Analytics";
import Rewards from "./Rewards";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: Dashboard },
      { path: "providers", Component: DataProviders },
      { path: "delegation", Component: DataProviders },
      { path: "staking", Component: DataProviders },
      { path: "rewards", Component: Rewards },
      { path: "analytics", Component: Analytics },
    ],
  },
]);
