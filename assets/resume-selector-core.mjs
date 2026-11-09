// The resume selector's pure core: the URL is the whole selection state, so
// parsing and serialising it are plain functions with no DOM. The browser
// module and the tests import these; nothing here fetches or stores anything.

function asStrings(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

// The query lists the ids to include, comma-separated under `include`.
// Absent or empty means the canonical default: every id except the entries
// the PDF leaves out. Unknown ids are ignored. An explicitly empty selection
// is the single reserved token `none`, so clearing every section survives a
// reload without turning a typo into a blank page.
const NONE = "none";

export function parseSelection(search, options = {}) {
  const allIds = asStrings(options?.allIds);
  const defaultOmitted = new Set(asStrings(options?.defaultOmitted));
  const fallback = allIds.filter((id) => !defaultOmitted.has(id));

  if (typeof search !== "string") return { included: fallback };

  let params;
  try {
    params = new URLSearchParams(search);
  } catch {
    return { included: fallback };
  }

  if (!params.has("include")) return { included: fallback };

  const requested = params
    .getAll("include")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  if (requested.length === 1 && requested[0] === NONE) return { included: [] };
  if (requested.length === 0) return { included: fallback };

  const known = new Set(allIds);
  const selected = new Set(requested.filter((id) => known.has(id)));
  if (selected.size === 0) return { included: fallback };

  return { included: allIds.filter((id) => selected.has(id)) };
}

export function toSearch(selection) {
  const seen = new Set();
  const ids = asStrings(selection?.included).filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  if (ids.length === 0) return `?include=${NONE}`;
  return `?include=${ids.map((id) => encodeURIComponent(id)).join(",")}`;
}
