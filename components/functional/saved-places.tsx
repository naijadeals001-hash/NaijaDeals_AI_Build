"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Loader2, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { ApiRequestError, apiClient, type ApiSavedPlace } from "@/lib/api-client";
import { DRIVE_PLACES, findPlace } from "@/lib/config/drive";

type LoadState = "idle" | "loading" | "ready" | "error";

/**
 * A rider's own nicknames for bookable Lagos landmarks ("Mum's place", "Office").
 * Saved per account on the server, so they follow the rider to any device. Every
 * nickname still points at a landmark the fare engine can price — nothing here
 * invents an address.
 */
export function SavedPlaces() {
  const [places, setPlaces] = useState<ApiSavedPlace[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [filter, setFilter] = useState("");
  const [nickname, setNickname] = useState("");
  const [placeId, setPlaceId] = useState(DRIVE_PLACES[0]?.id ?? "");
  const [busy, setBusy] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNickname, setEditNickname] = useState("");
  const [editPlaceId, setEditPlaceId] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const data = await apiClient.driveSavedPlaces();
      setPlaces(data);
      setState("ready");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Unable to load your saved places.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return places;
    return places.filter((place) => {
      const landmark = findPlace(place.placeId);
      return (
        place.nickname.toLowerCase().includes(needle) ||
        (landmark?.label.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [places, filter]);

  function describeError(err: unknown, fallback: string) {
    if (err instanceof ApiRequestError) return err.message;
    return err instanceof Error ? err.message : fallback;
  }

  async function addPlace() {
    setBusy("add");
    setError("");
    setNotice("");
    try {
      const created = await apiClient.driveSavePlace({ nickname, placeId });
      setPlaces((current) => [...current, created]);
      setNickname("");
      setNotice(`Saved “${created.nickname}”.`);
    } catch (err) {
      setError(describeError(err, "Unable to save this place."));
    } finally {
      setBusy("");
    }
  }

  function startEdit(place: ApiSavedPlace) {
    setEditingId(place.id);
    setEditNickname(place.nickname);
    setEditPlaceId(place.placeId);
    setError("");
    setNotice("");
  }

  async function saveEdit(id: string) {
    setBusy(`save-${id}`);
    setError("");
    setNotice("");
    try {
      const updated = await apiClient.driveUpdateSavedPlace(id, {
        nickname: editNickname,
        placeId: editPlaceId
      });
      setPlaces((current) => current.map((place) => (place.id === id ? updated : place)));
      setEditingId(null);
      setNotice(`Updated “${updated.nickname}”.`);
    } catch (err) {
      setError(describeError(err, "Unable to update this place."));
    } finally {
      setBusy("");
    }
  }

  async function removePlace(id: string) {
    setBusy(`delete-${id}`);
    setError("");
    setNotice("");
    try {
      await apiClient.driveDeleteSavedPlace(id);
      setPlaces((current) => current.filter((place) => place.id !== id));
      if (editingId === id) setEditingId(null);
      setNotice("Saved place removed.");
    } catch (err) {
      setError(describeError(err, "Unable to remove this place."));
    } finally {
      setBusy("");
    }
  }

  const atLimit = places.length >= 20;

  return (
    <section aria-labelledby="saved-places-heading" className="rounded-2xl border border-border-soft bg-canvas p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          <MapPin className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="saved-places-heading" className="font-display text-lg font-extrabold">
            Saved places
          </h2>
          <p className="mt-1 text-sm text-muted">
            Give a bookable Lagos landmark a nickname like “Mum’s place” or “Office”. Saved to your
            account, so it is here next time.
          </p>
        </div>
      </div>

      {notice ? (
        <p role="status" className="mt-3 rounded-xl bg-primary-soft p-3 text-sm font-bold text-primary">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-crimson/30 bg-crimson-soft p-3 text-sm font-bold text-crimson">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {state === "loading" ? (
        <p className="mt-4 flex items-center gap-2 text-sm font-bold text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading your saved places…
        </p>
      ) : state === "error" ? (
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-border-soft px-3 text-xs font-bold"
        >
          Retry
        </button>
      ) : (
        <>
          {places.length > 0 ? (
            <>
              <label htmlFor="saved-filter" className="mt-4 block text-xs font-black uppercase tracking-wide text-muted">
                Search saved places
              </label>
              <input
                id="saved-filter"
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter by nickname or landmark"
                className="mt-1 min-h-11 w-full rounded-xl border border-border-soft bg-surface-low px-3 text-sm"
              />

              {filtered.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No saved places match “{filter}”.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {filtered.map((place) => {
                    const landmark = findPlace(place.placeId);
                    const isEditing = editingId === place.id;
                    return (
                      <li key={place.id} className="rounded-xl bg-surface-low p-3">
                        {isEditing ? (
                          <div className="space-y-2">
                            <label htmlFor={`edit-name-${place.id}`} className="block text-xs font-bold text-muted">
                              Nickname
                            </label>
                            <input
                              id={`edit-name-${place.id}`}
                              value={editNickname}
                              onChange={(event) => setEditNickname(event.target.value)}
                              maxLength={40}
                              className="min-h-11 w-full rounded-lg border border-border-soft bg-canvas px-3 text-sm"
                            />
                            <label htmlFor={`edit-landmark-${place.id}`} className="block text-xs font-bold text-muted">
                              Landmark
                            </label>
                            <select
                              id={`edit-landmark-${place.id}`}
                              value={editPlaceId}
                              onChange={(event) => setEditPlaceId(event.target.value)}
                              className="min-h-11 w-full rounded-lg border border-border-soft bg-canvas px-3 text-sm"
                            >
                              {DRIVE_PLACES.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void saveEdit(place.id)}
                                disabled={busy === `save-${place.id}` || editNickname.trim().length < 2}
                                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-bold text-white disabled:opacity-50"
                              >
                                {busy === `save-${place.id}` ? (
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : (
                                  <Check className="h-4 w-4" aria-hidden="true" />
                                )}
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border-soft px-3 text-sm font-bold text-muted"
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-extrabold">{place.nickname}</p>
                              <p className="mt-0.5 truncate text-xs text-muted">
                                {landmark ? landmark.label : "Unknown landmark"}
                              </p>
                            </div>
                            <div className="flex shrink-0 gap-1">
                              <button
                                type="button"
                                onClick={() => startEdit(place)}
                                aria-label={`Edit ${place.nickname}`}
                                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border-soft text-muted"
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void removePlace(place.id)}
                                disabled={busy === `delete-${place.id}`}
                                aria-label={`Remove ${place.nickname}`}
                                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-crimson/30 text-crimson disabled:opacity-50"
                              >
                                {busy === `delete-${place.id}` ? (
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : (
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <p className="mt-4 rounded-xl bg-surface-low p-3 text-sm text-muted">
              No saved places yet. Add one below.
            </p>
          )}

          <div className="mt-4 rounded-xl border border-border-soft p-3">
            <p className="text-xs font-black uppercase tracking-wide text-muted">Add a place</p>
            <label htmlFor="new-nickname" className="mt-2 block text-xs font-bold text-muted">
              Nickname
            </label>
            <input
              id="new-nickname"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={40}
              placeholder="e.g. Mum’s place, Office"
              className="mt-1 min-h-11 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm"
            />
            <label htmlFor="new-landmark" className="mt-2 block text-xs font-bold text-muted">
              Landmark
            </label>
            <select
              id="new-landmark"
              value={placeId}
              onChange={(event) => setPlaceId(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm"
            >
              {DRIVE_PLACES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void addPlace()}
              disabled={busy === "add" || nickname.trim().length < 2 || atLimit}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy === "add" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              Save place
            </button>
            {atLimit ? (
              <p className="mt-2 text-xs text-muted">You have reached the 20 saved-place limit. Remove one to add another.</p>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
