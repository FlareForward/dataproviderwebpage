import { createBrowserRouter } from "react-router";
import { Root } from "./Root";
import Dashboard from "./Dashboard";
import { DataProviders } from "./DataProviders";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: Dashboard },
      { path: "providers", Component: DataProviders },
      { path: "delegation", Component: DataProviders },
    ],
  },
]);
