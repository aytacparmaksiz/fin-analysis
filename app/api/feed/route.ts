import { NextResponse } from 'next/server';
import { fetchLiveBistNewsFeed, getCompanyNewsFeed } from '@/lib/news-service';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const ticker = searchParams.get('ticker') || undefined;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const feed = await fetchLiveBistNewsFeed({
      category,
      tickers: ticker ? [ticker] : undefined,
      limit,
    });

    return NextResponse.json({
      success: true,
      count: feed.length,
      feed,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    const fallback = getCompanyNewsFeed();
    return NextResponse.json({
      success: true,
      count: fallback.length,
      feed: fallback,
      isFallback: true,
      error: error?.message,
    });
  }
}
