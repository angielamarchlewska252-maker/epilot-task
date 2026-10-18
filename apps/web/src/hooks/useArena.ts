import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Direction, ResolvedGuess } from "@arena/shared";
import { api, ApiError } from "../api/client";
import { clearToken, readToken, saveToken } from "../lib/session";
import { useCountdown } from "./useCountdown";

async function loadPlayer() {
  const existing = readToken();
  if (!existing) {
    const created = await api.createPlayer();
    saveToken(created.token);
    return created.player;
  }

  try {
    return await api.getMe(existing);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearToken();
      const created = await api.createPlayer();
      saveToken(created.token);
      return created.player;
    }
    throw error;
  }
}

export function useArena() {
  const queryClient = useQueryClient();
  const previousActiveId = useRef<string | null>(null);
  const [banner, setBanner] = useState<ResolvedGuess | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const playerQuery = useQuery({
    queryKey: ["player"],
    queryFn: loadPlayer,
    refetchInterval: () => {
      if (import.meta.env.MODE === "test") return false;
      const current = queryClient.getQueryData<Awaited<ReturnType<typeof loadPlayer>>>(["player"]);
      return current?.activeGuess ? 3_000 : false;
    },
    refetchIntervalInBackground: false,
  });

  const priceQuery = useQuery({
    queryKey: ["price"],
    queryFn: () => api.getPrice(),
    refetchInterval: import.meta.env.MODE === "test" ? false : 8_000,
    refetchIntervalInBackground: false,
  });

  const guessMutation = useMutation({
    mutationFn: (direction: Direction) => {
      const token = readToken();
      if (!token) throw new ApiError(401, "UNAUTHORIZED", "Missing player token.");
      return api.submitGuess(token, direction);
    },
    onMutate: () => setActionError(null),
    onSuccess: (player) => {
      queryClient.setQueryData(["player"], player);
    },
    onError: (error) => {
      setActionError(
        error instanceof Error ? error.message : "The prediction could not be submitted.",
      );
    },
  });

  useEffect(() => {
    const player = playerQuery.data;
    if (!player) return;
    const activeId = player.activeGuess?.guessId ?? null;
    if (previousActiveId.current && !activeId) {
      const latest = player.recentGuesses[0];
      if (latest?.guessId === previousActiveId.current) {
        setBanner(latest);
      }
    }
    if (activeId) setBanner(null);
    previousActiveId.current = activeId;
  }, [playerQuery.data]);

  const player = playerQuery.data ?? null;
  const remainingMs = useCountdown(
    player?.activeGuess?.eligibleAt ?? null,
    player?.serverTime ?? null,
  );

  return {
    player,
    price: priceQuery.data ?? null,
    playerLoading: playerQuery.isPending,
    priceLoading: priceQuery.isPending,
    playerError: playerQuery.error instanceof Error ? playerQuery.error.message : null,
    priceError: priceQuery.isError,
    submitting: guessMutation.isPending,
    actionError,
    banner,
    remainingMs,
    submit: (direction: Direction) => guessMutation.mutate(direction),
    retryPlayer: () => playerQuery.refetch(),
    checkNow: () => playerQuery.refetch(),
    checking: playerQuery.isFetching && !playerQuery.isPending,
  };
}
