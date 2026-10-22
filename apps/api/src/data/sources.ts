// Display metadata for every data source, used in the evidence footer of each answer.
import type { SourceKind } from '@clearway/core';

export const SOURCES = {
  'bts-monthly-api': {
    label: 'BTS T-100 Segment Summary by Origin Airport',
    kind: 'cached-api',
    url: 'https://data.transportation.gov/d/r495-tyji',
  },
  't100-segment-file': {
    label: 'BTS T-100 Segment, All Carriers',
    kind: 'file',
    url: 'https://www.transtats.bts.gov/Fields.asp?gnoyr_VQ=FMG',
  },
  'delay-causes-file': {
    label: 'BTS Airline On-Time Delay Causes',
    kind: 'file',
    url: 'https://www.transtats.bts.gov/ot_delay/ot_delaycause1.asp',
  },
  ourairports: {
    label: 'OurAirports reference data',
    kind: 'file',
    url: 'https://ourairports.com/data/',
  },
  'faa-nas-status': {
    label: 'FAA NAS airport status',
    kind: 'live-api',
    url: 'https://nasstatus.faa.gov/',
  },
  'noaa-metar': {
    label: 'NOAA Aviation Weather Center METAR',
    kind: 'live-api',
    url: 'https://aviationweather.gov/data/api/',
  },
} as const satisfies Record<string, { label: string; kind: SourceKind; url: string }>;

export type SourceId = keyof typeof SOURCES;
