import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ProfileClient } from "./profile-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "outbidarabs.lol — حسابي · My profile" };

export default function ProfilePage() {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={<div className="mx-auto flex w-full max-w-4xl flex-1" />}>
        <section className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-6 pb-16">
          <ProfileClient />
        </section>
      </Suspense>
      <SiteFooter />
    </>
  );
}
