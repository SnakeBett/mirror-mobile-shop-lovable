import { useEffect, useState } from "react";

const DURATION_SECONDS = 16 * 60 * 60;

export function OfferCountdown({ productId }: { productId: string }) {
  const [seconds, setSeconds] = useState(DURATION_SECONDS);

  useEffect(() => {
    const key = `vt_offer_deadline:${productId}`;
    let deadline = Date.now() + DURATION_SECONDS * 1000;
    try {
      const saved = Number(localStorage.getItem(key));
      if (Number.isFinite(saved) && saved > 0) deadline = saved;
      else localStorage.setItem(key, String(deadline));
    } catch {
      // O contador funciona nesta visita mesmo sem armazenamento disponível.
    }
    const update = () => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [productId]);

  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const remaining = String(seconds % 60).padStart(2, "0");
  return (
    <span className="offer-banner-countdown" role="timer" aria-label={seconds > 0 ? `Tempo restante: ${hours}:${minutes}:${remaining}` : "Oferta encerrada"}>
      {seconds > 0 ? <>TERMINA EM <time>{hours}:{minutes}:{remaining}</time></> : "OFERTA ENCERRADA"}
    </span>
  );
}