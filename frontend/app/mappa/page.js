// The map IS the landing page now — keep /mappa as a permanent redirect
// so old links and the nav muscle-memory keep working.
import { redirect } from "next/navigation";

export default function MappaPage() {
  redirect("/");
}
