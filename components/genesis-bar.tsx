import Link from 'next/link'
import type { GenesisStatus } from '@/lib/store'

/** Live Genesis 200 progress banner showing exact claimed/remaining free spots and the post-200 standard rate. */
export function GenesisBar({ genesis, showCta = false }: { genesis: GenesisStatus; showCta?: boolean }) {
  const pct = genesis.cap > 0 ? Math.min(100, Math.round((genesis.claimed / genesis.cap) * 100)) : 100
  return (
    <div className="genesis-bar" role="region" aria-label="Genesis 200 free spots status">
      <div className="genesis-top">
        <div className="genesis-copy">
          <span className="pill genesis">Genesis {genesis.cap}</span>
          {genesis.free_open ? (
            <strong>
              {genesis.remaining} of {genesis.cap} free spots left
            </strong>
          ) : (
            <strong>
              All {genesis.cap} Genesis spots claimed · Standard listing {genesis.listing_usd} USD one-time
            </strong>
          )}
        </div>
        {showCta && (
          <Link className="genesis-cta" href="/list">
            {genesis.free_open ? 'Claim a free spot →' : `List for ${genesis.listing_usd} USD →`}
          </Link>
        )}
      </div>
      <div
        className="genesis-track"
        role="progressbar"
        aria-label="Genesis 200 spots claimed"
        aria-valuemin={0}
        aria-valuemax={genesis.cap}
        aria-valuenow={genesis.claimed}
      >
        <span className="genesis-fill" style={{ width: `${Math.max(pct, genesis.claimed > 0 ? 3 : 0)}%` }} />
      </div>
      <p className="genesis-sub">
        {genesis.free_open
          ? `${genesis.claimed}/${genesis.cap} claimed. First ${genesis.cap} projects list free forever with a permanent Genesis badge; after ${genesis.cap}, standard listings are ${genesis.listing_usd} USD one-time via NervixPay.`
          : `Genesis ${genesis.cap} members stay free forever. New projects publish permanently for ${genesis.listing_usd} USD in USDT or USDC via NervixPay (0% cut on your sales).`}
      </p>
    </div>
  )
}
