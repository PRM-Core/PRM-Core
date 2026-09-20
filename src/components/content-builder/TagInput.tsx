import { useEffect, useRef, useState } from "react";
import { X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getAllTags } from "@/lib/api/contacts.functions";
import { t as tr } from "@/lib/i18n";

// Tags already used on contacts, fetched once per page load and shared by every
// TagInput instance — the list is small and identical for all of them.
let cachedTags: string[] | null = null;
let inFlight: Promise<string[]> | null = null;

function loadTags(): Promise<string[]> {
  if (cachedTags) return Promise.resolve(cachedTags);
  if (!inFlight) {
    inFlight = getAllTags()
      .then((tags) => {
        cachedTags = tags;
        return tags;
      })
      .catch(() => [])
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Multi-tag field: type to filter existing tags, Enter to add either the highlighted suggestion or a brand new tag. */
export function TagInput({
  value,
  onChange,
  placeholder = tr("Wpisz tag i naciśnij Enter…"),
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [known, setKnown] = useState<string[]>(cachedTags ?? []);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTags().then(setKnown);
  }, []);

  // Clicking anywhere else closes the suggestion list.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const query = draft.trim().toLowerCase();
  const suggestions = known
    .filter((t) => !value.includes(t))
    .filter((t) => (query ? t.toLowerCase().includes(query) : true))
    .slice(0, 8);

  // Offer "create new tag" only when what's typed isn't already known or picked.
  const trimmed = draft.trim();
  const canCreate =
    !!trimmed && !known.some((t) => t.toLowerCase() === query) && !value.includes(trimmed);

  const addTag = (tag: string) => {
    const clean = tag.trim();
    if (!clean || value.includes(clean)) return;
    onChange([...value, clean]);
    setDraft("");
    setOpen(false);
    if (!known.includes(clean)) {
      const next = [...known, clean].sort((a, b) => a.localeCompare(b, "pl"));
      setKnown(next);
      cachedTags = next;
    }
  };

  return (
    <div ref={wrapRef} className="space-y-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 font-normal">
              {tag}
              <button
                type="button"
                aria-label={tr("Usuń tag {tag}", { tag: tag })}
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="relative">
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag(draft || suggestions[0] || "");
            } else if (e.key === "Backspace" && !draft && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          placeholder={placeholder}
          className="text-xs"
        />

        {open && (suggestions.length > 0 || canCreate) && (
          <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-48 overflow-y-auto">
            {canCreate && (
              <button
                type="button"
                onClick={() => addTag(draft)}
                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-xs hover:bg-accent text-left"
              >
                <Plus className="h-3 w-3 text-primary shrink-0" />
                {tr("Utwórz tag „")}
                {draft.trim()}"
              </button>
            )}
            {suggestions.map((tag, i) => (
              <button
                key={tag}
                type="button"
                onClick={() => addTag(tag)}
                className={cn(
                  "block w-full px-2.5 py-1.5 text-xs hover:bg-accent text-left",
                  i === 0 && !canCreate && "bg-muted/40",
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
