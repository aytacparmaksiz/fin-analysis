import { NextResponse } from 'next/server';
import { fetchLiveBistNewsFeed } from '@/lib/news-service';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const tickersParam = searchParams.get('tickers');
    const singleTicker = searchParams.get('ticker');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    let tickers: string[] | undefined = undefined;
    if (tickersParam) {
      tickers = tickersParam.split(',').map(t => t.trim()).filter(Boolean);
    } else if (singleTicker) {
      tickers = [singleTicker.trim()];
    }

    // Yalnızca kullanıcının analiz ettiği şirketlerin bildirimleri çekilir
    if (!tickers || tickers.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        feed: [],
        message: 'Analiz edilen şirket bulunmuyor.',
        timestamp: new Date().toISOString(),
      });
    }

    const feed = await fetchLiveBistNewsFeed({
      tickers,
      category,
      limit,
    });

    return NextResponse.json({
      success: true,
      count: feed.length,
      feed,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    // Asla mock veri dönme, kurumsal boş yanıt ve hata detayını ilet
    return NextResponse.json({
      success: true,
      count: 0,
      feed: [],
      error: error?.message,
      timestamp: new Date().toISOString(),
    });
  }
}
