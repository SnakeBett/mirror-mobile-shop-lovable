import { BadgeCheck, ShieldCheck } from "lucide-react";

import { formatSold, type StoreInfo } from "@/lib/store-info";

export function StoreInfoCard({ info, logoUrl }: { info: StoreInfo; logoUrl: string | null }) {
  const showVerified = info.show_verified && info.verified;
  const showSold = info.show_sold && info.sold_count != null;
  const showRecommend = info.show_recommend && info.recommend_pct != null;
  const showTrust = info.show_trust && info.trust_pct != null;
  const showOntime = info.show_ontime && info.ontime_pct != null;
  const showReply = info.show_reply24 && info.reply24_pct != null;
  const stats = [
    showSold ? `${formatSold(info.sold_count!)} vendidos` : null,
    showRecommend ? `${info.recommend_pct}% recomendada` : null,
  ].filter(Boolean);

  return (
    <section className="store-card product-padding" aria-label={`Informações da loja ${info.name}`}>
      <div className="store-card-identity">
        <div className="store-card-logo">
          {logoUrl ? <img src={logoUrl} alt={`Logo ${info.name}`} /> : <span>{info.name.charAt(0).toUpperCase()}</span>}
        </div>
        <div className="store-card-text">
          <strong className="store-card-name">{info.name}</strong>
          {showVerified && (
            <span className="store-card-verified">
              <BadgeCheck aria-hidden="true" /> Loja verificada
            </span>
          )}
          {stats.length > 0 && (
            <span className="store-card-stats">
              <ShieldCheck aria-hidden="true" /> {stats.join(" · ")}
            </span>
          )}
        </div>
      </div>

      {showTrust && (
        <div className="store-card-trust">
          <div className="store-card-trust-row">
            <span>Confiança</span>
            <b>{info.trust_pct}%</b>
          </div>
          <div
            className="store-card-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={info.trust_pct!}
            aria-label="Confiança"
          >
            <i style={{ width: `${info.trust_pct}%` }} />
          </div>
        </div>
      )}

      {(showOntime || showReply) && (
        <div className="store-card-service">
          {showOntime && (
            <p><b>{info.ontime_pct}%</b> <span>envios pontuais</span></p>
          )}
          {showReply && (
            <p><b>{info.reply24_pct}%</b> <span>responde em 24 horas</span></p>
          )}
        </div>
      )}
    </section>
  );
}
