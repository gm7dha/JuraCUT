/**
 * Islands to choose from for the island relief (pure; JuraCAD's list, the same places): each a box on the OS grid round
 * it, with sea all round, so land running off the box's edge (the mainland) can be left out. Boxes are given by their
 * middle (degrees) and size.
 */
import type { IslandOnly } from "./islandLand";
import { latLonToGrid, type GridPoint } from "./osGrid";

export interface IslandPlace {
  id: string;
  name: string;
  /** South-west corner and size (m) on the OS grid. */
  sw: GridPoint;
  width: number;
  height: number;
  /** Just this island: points on it (and on land it may be joined to in the height data), on the OS grid. */
  only?: IslandOnly;
}

type LatLon = [number, number];

export const around = (id: string, name: string, lat: number, lon: number, kmWide: number, kmTall: number, keep?: LatLon[], apart?: LatLon[], sea?: LatLon[]): IslandPlace => {
  const c = latLonToGrid({ lat, lon });
  const width = kmWide * 1000;
  const height = kmTall * 1000;
  const place: IslandPlace = { id, name, sw: { e: Math.round(c.e - width / 2), n: Math.round(c.n - height / 2) }, width, height };
  const grid = ([la, lo]: LatLon) => {
    const g = latLonToGrid({ lat: la, lon: lo });
    return { e: Math.round(g.e), n: Math.round(g.n) };
  };
  if (keep) place.only = { keep: keep.map(grid), ...(apart ? { apart: apart.map(grid) } : {}), ...(sea ? { sea: sea.map(grid) } : {}) };
  return place;
};

export const ISLANDS: IslandPlace[] = [
  // The whole grid's land: Ireland and France run off its edges, so they're left out.
  { id: "great-britain", name: "Great Britain", sw: { e: 0, n: 0 }, width: 665000, height: 1230000 },
  // Arran without Holy Isle or Pladda, which the height data can join to it across the narrow sounds at Lamlash and
  // Kildonan (and Lamlash Bay, closed in between, would then be filled as land): points on Goatfell, Beinn Bharrain and
  // the southern moors; others on Holy Isle's top and on Pladda.
  around("arran", "Isle of Arran", 55.58, -5.22, 32, 40, [[55.626, -5.192], [55.635, -5.3], [55.5, -5.21]], [[55.525, -5.071], [55.427, -5.119]]),
  // Tiny (about 1.2 × 0.9 km, 338 m high), so a small area: it's then printed about 10 cm long.
  around("ailsa-craig", "Ailsa Craig", 55.2525, -5.1158, 3, 3, [[55.2525, -5.1158]]),
  // The Isle of Wight without the mainland (the height data may join it across the Solent's narrows at Hurst): points at
  // Carisbrooke, on St Boniface Down, on Afton Down and on Tennyson Down (west of the Western Yar, whose head nearly
  // reaches Freshwater Bay, so West Wight is kept even if the data parts it there).
  around("wight", "Isle of Wight", 50.67, -1.33, 46, 28, [[50.6873, -1.3143], [50.6035, -1.1987], [50.677, -1.4848], [50.6654, -1.5428]]),
  around("man", "Isle of Man", 54.23, -4.55, 42, 60),
  // Anglesey (with Holy Island, joined to it by its causeways) without the mainland, which the height data joins to it
  // across the narrow Menai Strait (its bridges): points at Llangefni, Llannerch-y-medd and on Holyhead Mountain; others
  // at Llanrug and Bangor on the mainland side.
  around(
    "anglesey",
    "Anglesey",
    53.28,
    -4.37,
    52,
    42,
    [[53.2557, -4.3109], [53.3301, -4.3756], [53.313, -4.6763]],
    [[53.1475, -4.1935], [53.226, -4.1286]],
  ),
  // Mull itself (the owner's map): without Ulva and Gometra (the height data joins Ulva across its narrow sound), Inch
  // Kenneth, Erraid (a tidal channel off Fidden), Iona, Calve Island (Tobermory), the Treshnish Isles, Little Colonsay,
  // Coll, Kerrera, Lismore or the mainland. Points on Ben More, Dùn da Ghaoithe (east, above Craignure), Ben Buie
  // (Lochbuie), north Mull between Dervaig and Loch Frisa, the Ross of Mull east of Bunessan and inland from Fionnphort
  // (so the Ross's end is kept whatever its own waist); others on Ulva, Gometra, Inch Kenneth, Erraid, Iona, Calve Island
  // and Morvern (above Lochaline). Loch Spelve, Loch Don, Loch na Keal and Loch Scridain stay sea even where the height
  // data closes their mouths (Loch Spelve's narrows are a couple of hundred metres wide).
  around(
    "mull",
    "Isle of Mull",
    56.45,
    -6.05,
    60,
    50,
    [[56.4241, -6.0152], [56.4603, -5.7803], [56.3744, -5.8819], [56.573, -6.1369], [56.321, -6.1419], [56.3248, -6.3447]],
    [[56.4771, -6.2077], [56.4905, -6.2888], [56.4417, -6.1632], [56.2943, -6.3687], [56.3342, -6.4105], [56.6175, -6.0423], [56.556, -5.8256]],
    [[56.388, -5.73], [56.431, -5.672], [56.4729, -6.0366], [56.366, -6.084]],
  ),
  // Islay without Jura (across the Sound of Islay): points in its east, on the Rinns and on the Oa.
  around("islay", "Islay", 55.76, -6.27, 46, 44, [[55.82, -6.17], [55.76, -6.42], [55.62, -6.25]]),
  // Jura without Islay, Scarba or Knapdale: points north and south of Loch Tarbert, where it's narrowest.
  around("jura", "Jura", 55.98, -5.89, 40, 48, [[55.89, -5.97], [56.05, -5.83]]),
  // Skye without the mainland, which the height data joins to it at the Skye Bridge (Kyle Akin) and Kylerhea, or the
  // Small Isles: points in the Cuillin, Trotternish, Duirinish, Sleat, the Kyleakin hills and Beinn na Caillich (so
  // east Skye, beside the joins, is kept whatever its own waist); others on Lochalsh, Glenelg, Applecross and Knoydart.
  around(
    "skye",
    "Isle of Skye",
    57.33,
    -6.22,
    90,
    92,
    [[57.23, -6.2], [57.507, -6.183], [57.4, -6.65], [57.1, -5.94], [57.245, -5.75], [57.235, -5.975]],
    [[57.31, -5.6], [57.2, -5.58], [57.45, -5.7], [57.07, -5.6]],
  ),
  // Lewis and Harris, the one main island, alone (the owner's wish): without Scalpay (bridged across a 300 m narrows),
  // Great Bernera (bridged in Loch Roag), Little Bernera, Vacasay (Loch Roag), Scarp (the Kyle of Scarp off Huisinis),
  // Taransay, the Shiant Isles, Seaforth Island (in Loch Seaforth), Eilean Liubhaird (off Lemreway), Eilean Chalaibrigh
  // (Loch Erisort) and Eilean Chaluim Chille beside it (tidal, joined to Lewis at Crobeag at low tide), Stockinish Island
  // (Bays of Harris), Soay Mòr (West Loch Tarbert), Vuia Mòr (West Loch Roag), the Sound of Harris islands (Ensay,
  // Killegray, Berneray, Vaccasay) or North Uist, whose north runs into the box. Keep points all along it — Cross (Ness),
  // Muirneag (the Barvas moor), Garrabost (Point, beyond the Braighe), Lews Castle (Stornoway), Achmore, Callanish,
  // Mealaisbhal (Uig), Beinn Mhòr and the middle of Pairc, the Clisham, Huisinis, Tarbert on its isthmus, Roineabhal and
  // Chaipaval (Toe Head) — so no part of it is given away wherever its own necks are; others on each island left out
  // (Pabbay lies outside the box). Its sea lochs stay sea where the height data closes their mouths: Loch Seaforth (outer
  // and upper), Loch Erisort, Loch Leurbost, Loch Shell, East and West Loch Tarbert, Loch Resort, Loch Roag (east and
  // west) and Little Loch Roag (just off its east shore, by the crannog at Scaliscro).
  around(
    "lewis-harris",
    "Lewis and Harris",
    58.1,
    -6.65,
    70,
    105,
    [
      [58.4717, -6.2876],
      [58.3561, -6.3102],
      [58.2159, -6.2192],
      [58.2116, -6.3944],
      [58.1713, -6.5748],
      [58.1974, -6.7451],
      [58.1313, -7.0611],
      [57.9896, -6.6481],
      [58.0, -6.567],
      [57.9637, -6.8125],
      [57.9948, -7.0977],
      [57.8974, -6.8051],
      [57.7667, -6.9754],
      [57.8187, -7.1014],
    ],
    [
      [57.865, -6.6775],
      [58.23, -6.85],
      [58.2653, -6.8733],
      [58.2245, -6.7913],
      [58.025, -7.127],
      [57.9, -7.017],
      [57.8989, -6.366],
      [58.001, -6.7292],
      [58.0009, -6.4327],
      [58.1129, -6.4449],
      [57.7632, -7.0852],
      [57.7399, -7.0836],
      [57.7164, -7.1526],
      [57.6585, -7.0721],
      [57.6311, -7.127],
      [58.105, -6.4405],
      [57.8068, -6.8216],
      [57.9381, -6.9644],
      [58.209, -6.8898],
    ],
    [
      [57.955, -6.6996],
      [58.0523, -6.6545],
      [58.0954, -6.509],
      [58.1312, -6.4608],
      [58.0041, -6.4958],
      [57.8686, -6.7528],
      [57.927, -6.935],
      [58.0447, -6.9803],
      [58.1977, -6.8814],
      [58.2405, -6.9129],
      [58.1252, -6.8706],
    ],
  ),
  around("orkney", "Orkney", 59.06, -2.9, 72, 82),
  around("shetland", "Shetland", 60.36, -1.35, 90, 125),
];
