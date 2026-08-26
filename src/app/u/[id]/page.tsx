import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { UserAvatar } from "@/components/user-avatar";
import { Avatar } from "@/components/avatar";
import { PlatformBadge } from "@/components/platform-icon";
import { getPublicProfile } from "@/lib/accounts";
import { getDict, type Lang } from "@/lib/i18n";
import { formatUsd } from "@/lib/format";

export const dynamic = "force-dynamic";

// Public profile (spec flow 4): visible only for public users — private (or
// missing) profiles 404 entirely. Resolved by the opaque public_id; auth
// uuids simply don't match any public profile. Shows supported cards.

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPublicProfile(id);
  return { title: data ? `outbidarabs.lol — ${data.profile.display_name}` : "outbidarabs.lol" };
}

export default async function PublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPublicProfile(id);
  if (!data) notFound();

  const cookieStore = await cookies();
  const lang: Lang = cookieStore.get("lang")?.value === "en" ? "en" : "ar";
  const t = getDict(lang);
  const { profile, cards } = data;
  const name = profile.display_name || "—";
  const joined = new Date(profile.created_at).toLocaleDateString(lang === "ar" ? "ar" : "en-US", {
    year: "numeric",
    month: "long",
  });

  return (
    <>
      <SiteHeader />
      <section className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-6 pb-16" dir="auto">
        <div className="rounded-3xl border bg-card p-5 text-center shadow-sm">
          <UserAvatar
            userId={profile.public_id}
            name={name}
            className="mx-auto size-20 text-3xl ring-1 ring-black/5 dark:ring-white/10"
          />
          <h1 dir="auto" className="mt-3 text-xl font-bold tracking-[-0.02em]">
            {name}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">{t.joinedAt(joined)}</p>
        </div>

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold tracking-[-0.02em]">{t.supportedCardsTitle}</h2>
          {cards.length === 0 ? (
            <p className="rounded-2xl border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
              {t.noSupportedCards}
            </p>
          ) : (
            <ul className="overflow-hidden rounded-2xl border bg-card">
              {cards.map((c) => (
                <li key={c.listing.id} className="border-t first:border-t-0">
                  <div className="flex items-center gap-2.5 px-3 py-2.5">
                    <span className="relative shrink-0">
                      <Avatar
                        name={c.listing.display_name}
                        url={c.listing.target_url || c.listing.url}
                        src={c.listing.image_url}
                        className="size-9 text-xs ring-1 ring-black/5 dark:ring-white/10"
                      />
                      <span className="absolute -bottom-0.5 -end-0.5">
                        <PlatformBadge platform={c.listing.platform} className="size-4" />
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p dir="auto" className="truncate text-xs font-bold">
                        {c.listing.display_name}
                      </p>
                      {c.rank != null && (
                        <p className="mt-0.5 text-[11px] font-bold text-primary">
                          {t.rankOnCard(c.rank)}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-bold text-primary tabular-nums">
                      {formatUsd(c.total)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
      <SiteFooter />
    </>
  );
}
