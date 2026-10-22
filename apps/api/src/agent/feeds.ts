// Pure parsers for the live feeds (no I/O): FAA NAS airport status (XML) and NOAA METAR (JSON).

export interface FaaEvent {
  airport: string;
  category: string; // the feed's Delay_type name, e.g. 'Ground Delay Programs'
  reason: string | null;
  avgDelay: string | null;
  maxDelay: string | null;
  minDelay: string | null;
  trend: string | null;
  direction: string | null; // Arrival or Departure, for general delays
  endTime: string | null;
  start: string | null; // as the feed gives it, without a year ("May 27 at 18:26 UTC.")
  reopen: string | null;
  notamText: string | null; // the NOTAM text without its validity window, for closures
  validFrom: string | null; // ISO, from the NOTAM's own validity window
  validTo: string | null; // ISO; null with permanent = true for PERM
  permanent: boolean;
}

export interface FaaStatus {
  updateTime: string | null;
  events: FaaEvent[];
}

const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();

const tag = (xml: string, name: string): string | null => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? decode(m[1] as string) : null;
};

const notamDate = (d: string): string | null => {
  const iso = `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}T${d.slice(6, 8)}:${d.slice(8, 10)}:00Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
};

/**
 * Reads the validity window a NOTAM ends with: YYMMDDHHMM-YYMMDDHHMM in UTC, the end optionally
 * PERM or followed by EST. The feed's own Start and Reopen fields carry no year, so this is the
 * only reliable way to tell whether a closure is in force.
 */
export function notamWindow(text: string | null): { notamText: string | null; validFrom: string | null; validTo: string | null; permanent: boolean } {
  if (!text) return { notamText: null, validFrom: null, validTo: null, permanent: false };
  const m = /\s(\d{10})-(\d{10}|PERM)(?:EST)?\s*$/.exec(text);
  if (!m) return { notamText: text, validFrom: null, validTo: null, permanent: false };
  const permanent = m[2] === 'PERM';
  return {
    notamText: text.slice(0, m.index).trim(),
    validFrom: notamDate(m[1] as string),
    validTo: permanent ? null : notamDate(m[2] as string),
    permanent,
  };
}

/** true or false when the event has a validity window, null when the feed gives none. */
export function inForceAt(e: Pick<FaaEvent, 'validFrom' | 'validTo' | 'permanent'>, now: Date): boolean | null {
  if (!e.validFrom) return null;
  const t = now.getTime();
  if (t < Date.parse(e.validFrom)) return false;
  return e.permanent || (e.validTo != null && t <= Date.parse(e.validTo));
}

/**
 * Parses the FAA feed with plain string matching on its known elements. No XML library and
 * no DTD or entity expansion, so a hostile feed cannot pull in external entities.
 */
export function parseFaaStatus(xml: string): FaaStatus {
  const events: FaaEvent[] = [];
  for (const block of xml.match(/<Delay_type>[\s\S]*?<\/Delay_type>/g) ?? []) {
    const category = tag(block, 'Name') ?? 'Unknown';
    for (const m of block.matchAll(/<(Program|Ground_Delay|Delay|Airport)>([\s\S]*?)<\/\1>/g)) {
      const item = m[2] as string;
      const airport = tag(item, 'ARPT');
      if (!airport) continue;
      const dirMatch = /<Arrival_Departure\s+Type="([^"]+)"/.exec(item);
      const reason = tag(item, 'Reason');
      const isNotam = reason?.startsWith('!') ?? false;
      events.push({
        airport: airport.toUpperCase(),
        category,
        reason,
        avgDelay: tag(item, 'Avg'),
        maxDelay: tag(item, 'Max'),
        minDelay: tag(item, 'Min'),
        trend: tag(item, 'Trend'),
        direction: dirMatch ? (dirMatch[1] as string) : null,
        endTime: tag(item, 'End_Time'),
        start: tag(item, 'Start'),
        reopen: tag(item, 'Reopen'),
        ...(isNotam ? notamWindow(reason) : { notamText: null, validFrom: null, validTo: null, permanent: false }),
      });
    }
  }
  return { updateTime: tag(xml, 'Update_Time'), events };
}

export interface Metar {
  icao: string;
  observedAt: string | null;
  flightCategory: string | null; // VFR, MVFR, IFR, LIFR
  windDirDeg: number | null;
  windKt: number | null;
  visibility: string | null;
  cloudCover: string | null;
  raw: string | null;
}

export function mapMetar(r: Record<string, unknown>): Metar | null {
  const icao = typeof r.icaoId === 'string' ? r.icaoId : null;
  if (!icao) return null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const s = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null);
  return {
    icao,
    observedAt: s(r.reportTime),
    flightCategory: s(r.fltCat),
    windDirDeg: n(r.wdir),
    windKt: n(r.wspd),
    visibility: s(r.visib),
    cloudCover: s(r.cover),
    raw: s(r.rawOb),
  };
}
