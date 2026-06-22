"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { History, Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SportId } from "@/lib/sports";
import {
  parseRulesEditorInput,
  rulesToEditorText,
  type AlgorithmRulesHistoryEntry,
  type SportAlgorithmRules,
} from "@/lib/algorithm-rules";

interface AlgorithmRulesEditorProps {
  sport: SportId;
}

export function AlgorithmRulesEditor({ sport }: AlgorithmRulesEditorProps) {
  const [rulesText, setRulesText] = useState("");
  const [defaultsText, setDefaultsText] = useState("");
  const [description, setDescription] = useState("");
  const [history, setHistory] = useState<AlgorithmRulesHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const applyRules = useCallback((rules: SportAlgorithmRules) => {
    setRulesText(rulesToEditorText(rules));
    setDescription(
      (rules as { rulesDescription?: string })?.rulesDescription ?? ""
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sport/${sport}/algorithm`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load rules");
      applyRules(json.rules as SportAlgorithmRules);
      setDefaultsText(JSON.stringify(json.defaults, null, 2));
      setHistory((json.history as AlgorithmRulesHistoryEntry[]) ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [sport, applyRules]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const parsed = parseRulesEditorInput(rulesText, description, sport);
      const res = await fetch(`/api/sport/${sport}/algorithm`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: parsed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      applyRules(json.rules as SportAlgorithmRules);
      setHistory((json.history as AlgorithmRulesHistoryEntry[]) ?? []);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRestore(historyId: string) {
    setRestoringId(historyId);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/sport/${sport}/algorithm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historyId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to restore");
      applyRules(json.rules as SportAlgorithmRules);
      setHistory((json.history as AlgorithmRulesHistoryEntry[]) ?? []);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRestoringId(null);
    }
  }

  function resetToDefaults() {
    try {
      const defaults = JSON.parse(defaultsText) as SportAlgorithmRules;
      applyRules(defaults);
    } catch {
      setError("Could not parse default rules");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-betfair-border bg-white px-4 py-8 text-sm text-betfair-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading algorithm rules…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="betfair-card p-5">
        <h3 className="text-lg font-bold text-betfair-navy">Edge algorithm rules</h3>
        <p className="mt-1 text-sm text-betfair-muted">
          Configure parameters stored in this sport&apos;s database. Saving replaces the
          active rules and archives the previous version to history.
        </p>

        <label className="mt-4 block text-sm font-semibold text-betfair-navy">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-betfair-border px-3 py-2 text-sm font-normal text-betfair-navy"
          />
        </label>

        <label className="mt-4 block text-sm font-semibold text-betfair-navy">
          Rules
          <textarea
            value={rulesText}
            onChange={(e) => setRulesText(e.target.value)}
            rows={16}
            spellCheck={false}
            placeholder="Paste your algorithm worksheet or JSON parameters…"
            className="mt-1 w-full rounded-md border border-betfair-border bg-betfair-surface/30 px-3 py-2 font-mono text-xs text-betfair-navy whitespace-pre-wrap"
          />
        </label>
        <p className="mt-2 text-xs text-betfair-muted">
          Plain-text worksheets are saved as-is. JSON is also supported for scan parameters
          (football: stake, homeMaxPrice, minMatchedVolume).
        </p>

        {error ? <p className="mt-3 text-sm text-betfair-red">{error}</p> : null}
        {saved ? (
          <p className="mt-3 text-sm font-semibold text-betfair-green">Rules saved.</p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-betfair-yellow font-bold text-betfair-navy hover:bg-betfair-yellow/90"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save rules
          </Button>
          <Button type="button" variant="outline" onClick={resetToDefaults} className="border-betfair-border">
            <RotateCcw className="h-4 w-4" />
            Reset to defaults
          </Button>
        </div>
      </div>

      <div className="betfair-card p-5">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-betfair-muted" />
          <h3 className="text-lg font-bold text-betfair-navy">Rules history</h3>
        </div>
        <p className="mt-1 text-sm text-betfair-muted">
          Previous versions appear here when you save again with different rules. The first save
          becomes active immediately; the second save archives the first to history.
        </p>

        {history.length === 0 ? (
          <p className="mt-4 text-sm text-betfair-muted">No archived versions yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-betfair-border rounded-md border border-betfair-border">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-betfair-navy">
                    {entry.description ?? "Previous rules"}
                  </p>
                  <p className="text-xs text-betfair-muted">
                    Replaced {format(new Date(entry.replacedAt), "d MMM yyyy HH:mm")}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={restoringId === entry.id}
                  onClick={() => handleRestore(entry.id)}
                  className="shrink-0 border-betfair-border"
                >
                  {restoringId === entry.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-betfair-border bg-white px-4 py-3 text-xs text-betfair-muted">
        <p className="font-semibold text-betfair-navy">Racing keys</p>
        <p className="mt-1">
          jkThreshold, stake, spCap, minWeightLbs, minFieldSize, maxFieldSize, targetDistances
        </p>
        <p className="mt-3 font-semibold text-betfair-navy">Football keys</p>
        <p className="mt-1">stake, homeMaxPrice, minMatchedVolume</p>
      </div>
    </div>
  );
}
