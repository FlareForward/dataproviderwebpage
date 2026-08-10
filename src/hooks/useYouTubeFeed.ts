import { useQuery } from "@tanstack/react-query";

export interface YouTubeVideo {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  published_unix: number | null;
}

interface YouTubeFeedData {
  generated_at_unix: number;
  channel_id: string;
  videos: YouTubeVideo[];
}

/**
 * Latest FlareForward YouTube videos via the same-origin Worker proxy
 * (worker/index.ts, `/api/youtube`). Override with VITE_YOUTUBE_URL in local
 * dev. The endpoint soft-fails to an empty list, so callers should render a
 * channel-link fallback when `videos` is empty.
 */
const YOUTUBE_URL = import.meta.env.VITE_YOUTUBE_URL ?? "/api/youtube";

export function useYouTubeFeed() {
  const query = useQuery({
    queryKey: ["youtube-feed"],
    staleTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<YouTubeFeedData> => {
      const res = await fetch(YOUTUBE_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error(`Failed to load videos (${res.status})`);
      return (await res.json()) as YouTubeFeedData;
    },
  });

  return {
    videos: query.data?.videos ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
