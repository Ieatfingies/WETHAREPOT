import { useMemo, useState } from "react";

type EventRecord = { id: string; date: string; title: string; type: string; summary: string; locations: string[]; impact: string; sources: { label: string; url: string }[] };

const KSDMA = "https://ksdma.karnataka.gov.in/storage/pdf-files/ActionplanforFloodriskmanagement2021.pdf";
const events: EventRecord[] = [
  { id: "2024", date: "22 OCT 2024", title: "Heavy rain and city flooding", type: "Reported event", summary: "Contemporary reporting documented flooded roads, fallen trees, rescue activity and a building collapse during severe rainfall. Reuters reported a northern weather station's 186 mm daily total for Monday, October 21.", locations: ["Yelahanka", "Vidyaranyapura", "north Bengaluru"], impact: "Road flooding and disruption; rescue and evacuation activity was reported. No event-specific flood-depth raster is provided here.", sources: [{ label: "Reuters  |  23 Oct 2024", url: "https://www.reuters.com/world/india/heavy-rain-creates-havoc-indias-tech-hub-bengaluru-again-2024-10-22/" }, { label: "Indian Express  |  22 Oct 2024", url: "https://indianexpress.com/article/cities/bangalore/bengaluru-rain-building-collapse-schools-closed-flooding-overflowing-lakes-9633673/" }] },
  { id: "2022-sep", date: "05 SEP 2022", title: "September rainfall and inundation", type: "Reported event", summary: "IMD rainfall figures reported by Indian Express recorded 131.6 mm in 24 hours. BBMP figures reported on 9 September said about 126 city lakes overflowed.", locations: ["Bellandur", "Sarjapur Road", "Whitefield", "Outer Ring Road", "Koramangala", "Varthur", "K.R. Puram", "Mahadevpura zone", "Bommanahalli zone"], impact: "Waterlogged roads, stranded residents and transport disruption were reported. Locality names are not precise inundation boundaries.", sources: [{ label: "Indian Express  |  5 Sep 2022", url: "https://indianexpress.com/article/cities/bangalore/bengaluru-rains-city-records-wettest-september-2014-8132270/" }, { label: "BBMP figures via Times of India  |  9 Sep 2022", url: "https://timesofindia.indiatimes.com/city/bengaluru/karnataka-126-lakes-overflowed-in-bengaluru/articleshow/94105604.cms" }] },
  { id: "2022-aug", date: "31 AUG 2022", title: "August flood scenario analysis", type: "Model analysis + reported context", summary: "RMSI's event advisory cites IMD rainfall of 364.2 mm for August to date and 12.8 mm on Monday. It documents reported waterlogging and lake overflow, then presents a separate proprietary flood scenario analysis. Its map is an analytical product, not an observed flood-depth survey.", locations: ["Marathahalli", "Bellandur", "Sarjapura Road", "Whitefield", "Outer Ring Road", "BEML Layout"], impact: "RMSI reported overflowing Bellandur, Bakshi, Kanmanike and Sheshagiri village lakes. It separately estimated potential infrastructure exposure across Bengaluru Urban and neighboring districts, and cautioned that modeled extents and intensities may differ from actual conditions.", sources: [{ label: "RMSI  |  31 Aug 2022", url: "https://pieronline.rmsi.com/EventAdvisory/Advisories/RMSI_Bengaluru%20Flood_2022.pdf" }, { label: "NIDM Journal  |  Jan - Jun 2023", url: "https://nidm.gov.in/journal/PDF/Journal/NIDMJOURNAL_JanJun2023/NIDMJOURNAL_JanJun2023.pdf" }] },
  { id: "historic-years", date: "2005  |  2007  |  2015  |  2017  |  2018  |  2020", title: "Recurring inundation years", type: "Vulnerability context", summary: "Karnataka's Flood Risk Management Action Plan identifies these years in its Bengaluru flood-risk context. It identifies 200 Flood Vulnerable Areas, including 58 severely vulnerable locations.", locations: ["Bengaluru  |  official vulnerable-area inventory"], impact: "Historical vulnerability context only. The catalogue does not infer event-specific depths or boundaries from this list of years.", sources: [{ label: "Karnataka State Flood Risk Management Action Plan  |  2021", url: KSDMA }] },
];

const references = [
  ["Karnataka State Disaster Management Authority", "Karnataka State Flood Risk Management Action Plan", KSDMA],
  ["RMSI", "Floods in Bengaluru: August 2022  |  31 Aug 2022", "https://pieronline.rmsi.com/EventAdvisory/Advisories/RMSI_Bengaluru%20Flood_2022.pdf"],
  ["National Institute of Disaster Management", "Increasing Frequency of Urban Floods: Lessons from Bengaluru Floods, 2022", "https://nidm.gov.in/journal/PDF/Journal/NIDMJOURNAL_JanJun2023/NIDMJOURNAL_JanJun2023.pdf"],
  ["Indian Institute of Science", "Urban Floods: Case Study of Bangalore  |  2009", "https://wgbis.ces.iisc.ac.in/energy/water/paper/urbanfloods_bangalore/"],
  ["ATREE", "Strategy and Action Plan for Bengaluru  |  released 26 Mar 2024", "https://www.atree.org/projects/strategy-and-action-plan-for-bengaluru-building-resilience-to-urban-floods/"],
  ["Comptroller and Auditor General", "Performance Audit on Disaster Management in Karnataka  |  2025", "https://cag.gov.in/webroot/uploads/download_audit_report/2025/REPORT-8-OF-2025---ENGLISH-0694389fd547e10.69426873.pdf"],
  ["Reuters", "Heavy rain creates havoc in India's tech hub Bengaluru again  |  Oct 2024", "https://www.reuters.com/world/india/heavy-rain-creates-havoc-indias-tech-hub-bengaluru-again-2024-10-22/"],
  ["Times of India", "BBMP figures: 126 lakes overflowed in Bengaluru  |  9 Sep 2022", "https://timesofindia.indiatimes.com/city/bengaluru/karnataka-126-lakes-overflowed-in-bengaluru/articleshow/94105604.cms"],
];

export function PastFloodEventsPage({ onBack }: { onBack: () => void }) {
  const [selectedId, setSelectedId] = useState(events[0].id);
  const [query, setQuery] = useState("");
  const selected = events.find((event) => event.id === selectedId) ?? events[0];
  const visible = useMemo(() => events.filter((event) => `${event.date} ${event.title} ${event.locations.join(" ")}`.toLowerCase().includes(query.toLowerCase())), [query]);

  return <main className="past-flood-page">
    <header className="past-flood-header"><button onClick={onBack} className="past-back">BACK TO ATLAS</button><span className="past-kicker">WETHAREPOT / HISTORICAL ARCHIVE</span><span className="past-live-status">SOURCE-LINKED RECORDS</span></header>
    <section className="past-intro"><div><p className="past-eyebrow">BENGALURU  |  DOCUMENTED FLOOD EVENTS</p><h1>Past Flood<br/><em>Events</em></h1></div><p className="past-intro-copy">A sourced record of reported rainfall, inundation and vulnerability. Reports, analytical scenarios and modeled reconstructions are kept distinct.</p></section>
    <div className="past-rule"><span>01  -  EVENT CHRONOLOGY</span><span>4 RECORDS / 8 REFERENCES</span></div>
    <section className="past-browser">
      <aside className="past-event-list"><label htmlFor="past-search">SEARCH ARCHIVE</label><input id="past-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Year or locality..." />
        {visible.map((event, index) => <button key={event.id} onClick={() => setSelectedId(event.id)} className={`past-event-row ${selectedId === event.id ? "selected" : ""}`}><span className="past-index">0{index + 1}</span><span><small>{event.date}</small><strong>{event.title}</strong></span><b>&rarr;</b></button>)}
        {visible.length === 0 && <p className="past-no-results">No matching event records.</p>}
      </aside>
      <article className="past-detail"><div className="past-detail-top"><span className="past-kind">{selected.type}</span><span className="past-confidence">{selected.type === "Vulnerability context" ? "CONTEXT ONLY" : selected.type.startsWith("Model") ? "REPORTED + ANALYSIS" : "REPORTED"}</span></div><p className="past-detail-date">{selected.date}</p><h2>{selected.title}</h2><p className="past-summary">{selected.summary}</p>
        <div className="past-facts"><div><span>REPORTED LOCALITIES</span><p>{selected.locations.join("  |  ")}</p></div><div><span>DOCUMENTED IMPACT</span><p>{selected.impact}</p></div></div>
        <div className="past-map-note"><div className="past-map-grid"><div className="past-map-label">SPATIAL EVIDENCE</div><div className="past-map-line"/><div className="past-map-pin">+</div><div className="past-map-caption">No defensible event-specific extent layer<br/>is available in this archive record.</div></div><div><span className="past-map-type">MAP LAYER  |  NOT AVAILABLE</span><p>Locality names identify reported areas only. No street-level polygons or historical depths are inferred.</p></div></div>
        <div className="past-sources"><span className="past-section-label">ORIGINAL REPORTING</span>{selected.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer"><span>{source.label}</span><b>&rarr;</b></a>)}</div>
      </article>
    </section>
    <div className="past-reconstruction"><span className="past-section-label">RECONSTRUCTION MODE</span><div><h3>Historical forcing unavailable</h3><p>Event-specific rainfall time series and time-matched terrain/land-use inputs have not been assembled here. No reconstruction is offered until those inputs can be cited and validated.</p></div><button disabled title="Historical forcing data is not yet available">INPUT DATA NEEDED</button></div>
    <section className="past-references"><div className="past-rule"><span>02  -  SOURCE REGISTER</span><span>PRIMARY DOCUMENTS & REPORTING</span></div><div className="past-reference-grid">{references.map(([org, title, url]) => <a key={url} href={url} target="_blank" rel="noreferrer"><small>{org}</small><strong>{title}</strong><span>OPEN ORIGINAL &rarr;</span></a>)}</div><p className="past-caveat">Some linked documents were not accessible to the archive renderer during source review; their links are retained for direct verification. No claims are attributed to those documents beyond the clearly labeled catalogue context.</p></section>
    <footer className="past-footer">OBSERVATIONS  DIFFER FROM  ANALYTICAL SCENARIOS  DIFFER FROM  MODEL RECONSTRUCTIONS <span>WETHAREPOT / BENGALURU</span></footer>
  </main>;
}


