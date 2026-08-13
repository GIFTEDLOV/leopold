import { notFound } from "next/navigation";

import LeopoldClosureClient from "./closure-client";

export default function LeopoldClosureRoute() {
  if (process.env.NODE_ENV === "production") notFound();
  return <LeopoldClosureClient />;
}
