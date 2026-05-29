import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Building2, Receipt, Users, FileDown } from "lucide-react";

export default function Home() {
  return (
    <main className="flex-1">
      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Manage your PG / Hostel with ease
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
          Tenants, rooms across multiple buildings, rent collection, GST invoices and
          WhatsApp reminders — all in one place.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/login" className={buttonVariants({ size: "lg" })}>Sign in</Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-20 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { icon: Building2, t: "Multi-building", d: "Add unlimited buildings & rooms." },
          { icon: Users, t: "Tenant records", d: "Aadhar, PAN, GST, contact info." },
          { icon: Receipt, t: "Payments & invoices", d: "GST invoices, WhatsApp share." },
          { icon: FileDown, t: "Export anywhere", d: "Download CSV / PDF anytime." },
        ].map(({ icon: Icon, t, d }) => (
          <div key={t} className="rounded-xl border p-5">
            <Icon className="size-6 mb-3 text-primary" />
            <h3 className="font-semibold">{t}</h3>
            <p className="text-sm text-muted-foreground mt-1">{d}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
