import { cleanAndParseJson } from './valuation.ts';

/**
 * Gateway Timeout, kurumsal proxy ve HTML hata sayfalarını yakalayan güvenli API yanıt ayrıştırıcısı.
 * Hem istemci (`src/app/page.tsx`) hem de testler tarafından tek kaynak olarak kullanılır.
 */
export async function parseApiResponse(
  res: Response,
  defaultError: string,
  context?: 'bist' | 'extract' | 'analyze'
): Promise<any> {
  const status = res.status;
  const rawText = await res.text();

  const isHtml =
    rawText.trim().startsWith('<!DOCTYPE') ||
    rawText.trim().startsWith('<html') ||
    rawText.includes('<body') ||
    rawText.includes('</html>');

  const isTimeout =
    status === 504 ||
    status === 524 ||
    status === 408 ||
    /function_invocation_timeout/i.test(rawText) ||
    /gateway\s*time-?out/i.test(rawText) ||
    /notification:\s*gateway_timeout/i.test(rawText) ||
    /timed?\s*out/i.test(rawText) ||
    /time-?out\s+occurred/i.test(rawText);

  const isPayloadTooLarge =
    status === 413 ||
    /function_payload_too_large/i.test(rawText) ||
    /payload\s*too\s*large/i.test(rawText);

  if (isTimeout) {
    if (context === 'bist' || /bist/i.test(defaultError)) {
      throw new Error(
        'BIST veri sunucusu yanıt süresi aşıldı (Zaman Aşımı / HTTP 504). Lütfen birkaç saniye sonra analizi tekrar deneyin.'
      );
    }
    if (context === 'analyze' || /değerleme/i.test(defaultError)) {
      throw new Error(
        'Değerleme raporu hesaplama süresi aşıldı (Zaman Aşımı / HTTP 504). Lütfen analizi tekrar başlatın.'
      );
    }
    throw new Error(
      'Sunucu yanıt süresi aşıldı (Gateway Timeout). Lütfen sadece finansal tabloları içeren sayfaları yüklemeyi deneyin.'
    );
  }

  if (isPayloadTooLarge) {
    throw new Error(
      'Yüklenen dosya boyutu sunucu sınırını aştı (Payload Too Large). Lütfen daha az sayıda veya daha küçük boyutlu PDF yükleyin.'
    );
  }

  if (isHtml) {
    throw new Error(
      `Sunucu veya ağ geçidi beklenmeyen bir HTML yanıtı döndürdü (HTTP ${status}). Lütfen internet bağlantınızı veya kurumsal proxy ayarlarınızı kontrol edip tekrar deneyin.`
    );
  }

  let parsed: any = null;
  try {
    parsed = cleanAndParseJson(rawText);
  } catch {
    if (!res.ok) {
      throw new Error(`Sunucu hatası (HTTP ${status}): ${rawText.slice(0, 150)}`);
    }
    throw new Error('Sunucudan geçersiz veri formatı alındı.');
  }

  if (!parsed || typeof parsed !== 'object') {
    if (!res.ok) {
      throw new Error(`Sunucu hatası (HTTP ${status}): ${rawText.slice(0, 150)}`);
    }
    throw new Error('Sunucudan geçersiz veri formatı alındı.');
  }

  if (!res.ok) {
    if (status === 429) {
      throw new Error(
        parsed?.error || parsed?.message || 'Gemini API hız kotası aşıldı (429). Lütfen birkaç saniye sonra tekrar deneyin.'
      );
    }
    throw new Error(parsed?.error || parsed?.message || defaultError || `İşlem başarısız oldu (HTTP ${status}).`);
  }

  return parsed;
}
