// Conversion OpenStreetMap (réponse Overpass "out geom") -> format compact du jeu.
// Module pur (aucune dépendance) : utilisé par tools/extract.html et par les tests.
//
// Format du jeu (version 1), coordonnées en mètres, x = est, z = sud, origine = centre :
// { version, name, source, origin:{lat,lon}|null, bounds:[minX,minZ,maxX,maxZ],
//   roads:[[largeur,[x,z,x,z,...]]], buildings:[[hauteur,[x,z,...]]],
//   water:[[x,z,...]], parks:[[x,z,...]] }

export const R_LAT = 110574, R_LON = 111320;   // mètres par degré (approximation locale)

export const ROAD_WIDTH = {
  motorway: 14, trunk: 14, primary: 12, secondary: 10, tertiary: 8,
  unclassified: 7, residential: 6, living_street: 5, service: 4,
  motorway_link: 8, trunk_link: 8, primary_link: 8, secondary_link: 7, tertiary_link: 6
};

export function project(lat, lon, o) {
  return [(lon - o.lon) * Math.cos(o.lat * Math.PI / 180) * R_LON, -(lat - o.lat) * R_LAT];
}
export function unproject(x, z, o) {
  return [o.lat - z / R_LAT, o.lon + x / (R_LON * Math.cos(o.lat * Math.PI / 180))];
}

export function overpassQuery(o, radius) {
  const dLat = radius / R_LAT, dLon = radius / (R_LON * Math.cos(o.lat * Math.PI / 180));
  const bb = [o.lat - dLat, o.lon - dLon, o.lat + dLat, o.lon + dLon].map(v => v.toFixed(6)).join(',');
  const hw = Object.keys(ROAD_WIDTH).join('|');
  return `[out:json][timeout:90];(` +
    `way["highway"~"^(${hw})$"](${bb});` +
    `way["building"](${bb});` +
    `way["natural"="water"](${bb});` +
    `way["leisure"="park"](${bb});` +
    `way["landuse"~"^(grass|forest|recreation_ground)$"](${bb});` +
    `);out geom;`;
}

const r1 = v => Math.round(v * 10) / 10;

export function convert(osm, origin, radius, name = 'Carte OSM') {
  const out = { version: 1, name, source: 'osm', origin, bounds: [-radius, -radius, radius, radius],
    roads: [], buildings: [], water: [], parks: [] };
  const lim = radius + 30;
  const inside = (x, z) => Math.abs(x) <= lim && Math.abs(z) <= lim;

  for (const el of osm.elements || []) {
    if (el.type !== 'way' || !Array.isArray(el.geometry) || !el.tags) continue;
    const t = el.tags, pts = [];
    for (const g of el.geometry) {
      if (!g || typeof g.lat !== 'number') continue;
      const [x, z] = project(g.lat, g.lon, origin);
      const X = r1(x), Z = r1(z), n = pts.length;
      if (n && pts[n - 1][0] === X && pts[n - 1][1] === Z) continue;   // doublon consécutif
      pts.push([X, Z]);
    }
    if (pts.length < 2) continue;
    const closed = pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
    const ring = closed ? pts.slice(0, -1) : pts;

    if (t.highway) {
      const w = ROAD_WIDTH[t.highway];
      if (!w || t.area === 'yes') continue;
      let run = [];                                   // on découpe les routes qui sortent de la zone
      const flush = () => { if (run.length >= 2) out.roads.push([w, run.flat()]); run = []; };
      for (const p of pts) { if (inside(p[0], p[1])) run.push(p); else flush(); }
      flush();
    } else if (t.building && closed && ring.length >= 3) {
      const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      if (!inside(cx, cz)) continue;
      let area = 0;
      for (let i = 0; i < ring.length; i++) { const j = (i + 1) % ring.length; area += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1]; }
      if (Math.abs(area) / 2 < 4) continue;           // trop petit
      let h = parseFloat(t.height);
      if (!(h > 0)) { const lv = parseFloat(t['building:levels']); h = lv > 0 ? lv * 3.2 : 5 + (Math.abs(el.id | 0) % 5) * 1.5; }
      out.buildings.push([r1(Math.min(Math.max(h, 3), 250)), ring.flat()]);
    } else if (closed && ring.length >= 3 && (t.natural === 'water' || t.waterway === 'riverbank')) {
      out.water.push(ring.flat());
    } else if (closed && ring.length >= 3 && (t.leisure === 'park' || t.landuse || t.natural === 'wood')) {
      out.parks.push(ring.flat());
    }
  }
  return out;
}
