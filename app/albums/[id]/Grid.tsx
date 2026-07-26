"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const CYCLE = ["not_started", "tracking", "tracked", "done"] as const;
type Status = (typeof CYCLE)[number];

export type Song = { id: string; title: string };

function keyOf(songId: string, instrument: string) {
  return `${songId}::${instrument}`;
}

export default function Grid({
  songs,
  instruments,
  initial,
}: {
  songs: Song[];
  instruments: string[];
  initial: Record<string, Status>;
}) {
  const [cells, setCells] = useState<Record<string, Status>>(initial);

  const progress = useMemo(() => {
    const total = songs.length * instruments.length;
    if (total === 0) return 0;
    let done = 0;
    for (const s of songs) {
      for (const inst of instruments) {
        if (cells[keyOf(s.id, inst)] === "done") done++;
      }
    }
    return Math.round((done / total) * 100);
  }, [cells, songs, instruments]);

  async function cycle(songId: string, instrument: string) {
    const k = keyOf(songId, instrument);
    const current: Status = cells[k] ?? "not_started";
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];

    setCells((c) => ({ ...c, [k]: next })); // optimistic

    const supabase = createClient();
    const { error } = await supabase.from("song_tracks").upsert(
      {
        song_id: songId,
        instrument,
        status: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "song_id,instrument" },
    );

    if (error) {
      setCells((c) => ({ ...c, [k]: current })); // revert on failure
      alert("Couldn't save that change: " + error.message);
    }
  }

  if (songs.length === 0) {
    return (
      <p className="empty">
        Add your first song above — then the recording grid appears here.
      </p>
    );
  }

  return (
    <div>
      <div className="progress-wrap">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="progress-label mono">{progress}% complete</div>
      </div>

      <div className="grid-scroll">
        <table className="grid">
          <thead>
            <tr>
              <th className="song-col">Song</th>
              {instruments.map((inst) => (
                <th key={inst}>{inst}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {songs.map((s) => (
              <tr key={s.id}>
                <td className="song-col">{s.title}</td>
                {instruments.map((inst) => {
                  const status = cells[keyOf(s.id, inst)] ?? "not_started";
                  const cls =
                    status === "not_started" ? "" : ` ${status}`;
                  return (
                    <td key={inst}>
                      <button
                        className={`cell${cls}`}
                        onClick={() => cycle(s.id, inst)}
                        title={`${s.title} · ${inst}: ${status.replace("_", " ")}`}
                        aria-label={`${s.title} ${inst} ${status}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="legend">
        <span><i className="swatch" style={{ background: "var(--grey)" }} /> Not started</span>
        <span><i className="swatch" style={{ background: "var(--amber)" }} /> Tracking</span>
        <span><i className="swatch" style={{ background: "var(--accent)" }} /> Tracked</span>
        <span><i className="swatch" style={{ background: "var(--green)" }} /> Done</span>
      </div>
    </div>
  );
}
