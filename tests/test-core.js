// Tests du cœur géométrique de MicroAttaches.jsx (node). / Geometry core tests (node).
var fs = require("fs"), vm = require("vm"), path = require("path");
var src = fs.readFileSync(path.join(__dirname, "..", "MicroAttaches.jsx"), "utf8");
var ctx = { Math: Math, String: String, Number: Number, Infinity: Infinity, isNaN: isNaN, parseFloat: parseFloat, parseInt: parseInt, MA_NO_MAIN: true };
vm.createContext(ctx); vm.runInContext(src, ctx);
var C = ctx.MA_CORE;
var pass = 0, fail = 0;
function ok(n, c, e) { if (c) { pass++; console.log("ok   " + n); } else { fail++; console.log("FAIL " + n + (e !== undefined ? " -> " + e : "")); } }
var MM = 72 / 25.4, K = 0.5522847498;
function near(a, b, eps) { return Math.abs(a - b) <= eps; }
function d2(p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1]); }

function circle(cx, cy, r) {
    return [[cx + r, cy, cx + r, cy - K * r, cx + r, cy + K * r], [cx, cy + r, cx + K * r, cy + r, cx - K * r, cy + r],
            [cx - r, cy, cx - r, cy + K * r, cx - r, cy - K * r], [cx, cy - r, cx - K * r, cy - r, cx + K * r, cy - r]];
}
function poly(list) { return list.map(function (p) { return [p[0], p[1], p[0], p[1], p[0], p[1]]; }); }
function rect(x, y, w, h) { return poly([[x, y + h], [x + w, y + h], [x + w, y], [x, y]]); } // départ en haut à gauche comme Illustrator
function opt(o) { var d = { gap: 0.8 * MM, margin: 1.5 * MM, avoid: true, n: 2, useSpacing: false, spacing: 60 * MM, minN: 1, minLen: 3 * MM, which: 0, open: false }; for (var k in o) d[k] = o[k]; return d; }
function corners(pts) { return pts.map(function (p) { return [p[0], p[1]]; }); }
// distance minimale le long du contour d'une abscisse aux angles / along-path distance to the nearest corner
function cornerDist(tb, s, cornerS) { var L = tb.L, m = Infinity; cornerS.forEach(function (c) { var d = Math.abs(s - c); d = Math.min(d, L - d); m = Math.min(m, d); }); return m; }

// 1. Longueurs / lengths
var tbC = C.build(circle(0, 0, 100), true);
ok("longueur cercle r=100 ≈ 2πr (0,05 %)", near(tbC.L, 2 * Math.PI * 100, 2 * Math.PI * 100 * 0.0005), tbC.L);
var sq = rect(0, 0, 100 * MM, 100 * MM), tbS = C.build(sq, true);
ok("longueur carré 100 mm = 400 mm", near(tbS.L, 400 * MM, 1e-6), tbS.L / MM);
ok("segment droit reconnu", C.isLine([0, 0, 0, 0, 10, 0, 10, 0]) && C.isLine([0, 0, 3, 0, 7, 0, 10, 0]));
ok("segment courbe reconnu", !C.isLine([0, 0, 3, 5, 7, 5, 10, 0]));

// 2. Abscisse -> point / arc length -> point
var p = C.pointAt(tbS, 50 * MM);
ok("point à 50 mm sur le carré (milieu du haut)", near(p[0], 50 * MM, 1e-6) && near(p[1], 100 * MM, 1e-6), p);
var pc = C.pointAt(tbC, tbC.L / 4);
ok("point au quart du cercle (0, 100)", near(pc[0], 0, 0.15) && near(pc[1], 100, 0.15), pc);
ok("abscisse > L enveloppée sur contour fermé", d2(C.pointAt(tbS, tbS.L + 10), C.pointAt(tbS, 10)) < 1e-6);

// 3. Découpe de Bézier / Bézier splitting
var g = [0, 0, 30, 60, 70, 60, 100, 0];
var h = C.subSeg(g, 0.25, 0.75);
ok("sous-segment : début = B(0,25)", d2([h[0], h[1]], C.bpt(g, 0.25)) < 1e-9);
ok("sous-segment : fin = B(0,75)", d2([h[6], h[7]], C.bpt(g, 0.75)) < 1e-9);
ok("sous-segment : milieu = B(0,5)", d2(C.bpt(h, 0.5), C.bpt(g, 0.5)) < 1e-9);

// 4. Extraction : morceau sur le cercle reste sur le cercle / piece of circle stays on circle
var ch = C.extract(tbC, 10, 200), onCircle = true, k;
ch.forEach(function (sg) { for (k = 0; k <= 20; k++) { var q = C.bpt(sg, k / 20); if (Math.abs(Math.hypot(q[0], q[1]) - 100) > 0.03) onCircle = false; } });
ok("morceau de cercle conservé en courbes (écart < 0,03 pt)", onCircle);
ok("longueur du morceau extrait = 190", near(C.chainLen(ch), 190, 0.05), C.chainLen(ch));
var chW = C.extract(tbS, 390 * MM, 410 * MM);
ok("extraction à cheval sur le point de départ (20 mm)", near(C.chainLen(chW), 20 * MM, 1e-6) && chW.length === 2, C.chainLen(chW) / MM);
var pts = C.chainToPts(ch);
ok("chaîne -> points : n segments = n+1 points", pts.length === ch.length + 1);

// 5. Placement sur un carré : loin des angles, milieu des côtés / square: away from corners, mid-sides
var cS = [0, 100, 200, 300].map(function (x) { return x * MM; });
var pl4 = C.place(tbS, 4, opt());
ok("carré : 4 attaches", pl4.tabs.length === 4, pl4.tabs.length);
var minCD = Math.min.apply(null, pl4.tabs.map(function (s) { return cornerDist(tbS, s, cS); }));
ok("carré : attaches à plus de 1,9 mm des angles", minCD >= 1.9 * MM, minCD / MM);
var mids = pl4.tabs.map(function (s) { return Math.abs(((s / MM) % 100) - 50); });
ok("carré : attaches près du milieu des côtés (±15 mm)", Math.max.apply(null, mids) <= 15, mids);
ok("carré : aucune attache signalée sur angle", pl4.bad === 0);

// 6. Rectangle 100 × 30 mm, 2 attaches : côtés longs / long sides
var re = rect(0, 0, 100 * MM, 30 * MM), tbR = C.build(re, true), pl2 = C.place(tbR, 2, opt());
var onLong = pl2.tabs.every(function (s) { var q = C.pointAt(tbR, s); return near(q[1], 0, 1e-6) || near(q[1], 30 * MM, 1e-6); });
ok("rectangle : 2 attaches sur les côtés longs", onLong, pl2.tabs.map(function (s) { return C.pointAt(tbR, s); }));
ok("rectangle : attaches opposées (écart ≈ L/2)", near(Math.abs(pl2.tabs[1] - pl2.tabs[0]), tbR.L / 2, 12 * MM), (pl2.tabs[1] - pl2.tabs[0]) / MM);

// 7. Cercle : répartition régulière / circle: even spread
var tbC2 = C.build(circle(0, 0, 40 * MM), true), plc = C.place(tbC2, 5, opt());
var gaps = []; for (k = 0; k < 5; k++) gaps.push(((plc.tabs[(k + 1) % 5] - plc.tabs[k]) + tbC2.L) % tbC2.L);
ok("cercle : 5 attaches régulières (écart ±3 %)", gaps.every(function (x) { return near(x, tbC2.L / 5, tbC2.L / 5 * 0.03); }), gaps.map(function (x) { return x / MM; }));
ok("grand cercle : pas d'attache signalée", plc.bad === 0, plc.turn);

// 8. Étoile pointue : attaches hors des pointes / sharp star: tabs away from spikes
var star = [], R1 = 50 * MM, R2 = 20 * MM;
for (k = 0; k < 10; k++) { var a = Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? R2 : R1; star.push([r * Math.cos(a), r * Math.sin(a)]); }
var tbSt = C.build(poly(star), true), cSt = [], acc = 0;
for (k = 0; k < 10; k++) { cSt.push(acc); acc += Math.hypot(star[(k + 1) % 10][0] - star[k][0], star[(k + 1) % 10][1] - star[k][1]); }
var pls = C.place(tbSt, 5, opt());
var minSt = Math.min.apply(null, pls.tabs.map(function (s) { return cornerDist(tbSt, s, cSt); }));
ok("étoile : 5 attaches à plus de 1,9 mm des sommets", pls.tabs.length === 5 && minSt >= 1.9 * MM, minSt / MM);

// 9. Sans évitement : répartition pure / without avoidance: pure even spread
var plN = C.place(tbS, 4, opt({ avoid: false }));
var gN = []; for (k = 0; k < 4; k++) gN.push(((plN.tabs[(k + 1) % 4] - plN.tabs[k]) + tbS.L) % tbS.L);
ok("sans évitement : écarts égaux", gN.every(function (x) { return near(x, 100 * MM, 1); }), gN);

// 10. Petit cercle : courbe serrée partout -> attaches quand même, signalées / tiny circle: tabs anyway, flagged
var tbT = C.build(circle(0, 0, 1.2 * MM), true), plT = C.place(tbT, 2, opt());
ok("petit cercle r=1,2 mm : 2 attaches posées", plT.tabs.length === 2);
ok("petit cercle : attaches signalées à vérifier", plT.bad === 2, plT.turn);

// 11. Nombre d'attaches / tab count
ok("nombre fixe", C.tabCount(400 * MM, opt({ n: 3 })) === 3);
ok("espacement 60 mm sur 400 mm -> 7", C.tabCount(400 * MM, opt({ useSpacing: true, spacing: 60 * MM })) === 7);
ok("espacement : minimum respecté", C.tabCount(20 * MM, opt({ useSpacing: true, spacing: 60 * MM, minN: 2 })) === 2);
ok("contour plus court que le minimum -> 0", C.tabCount(2 * MM, opt()) === 0);
ok("plafond : pas plus d'une attache par 3 largeurs", C.tabCount(4 * MM, opt({ n: 10, minLen: 0 })) === 1);

// 12. Morceaux : longueurs et largeur exacte des coupures / pieces: lengths and exact gap width
var pcs = C.pieces(tbS, pl4.tabs, 0.8 * MM), tot = 0;
pcs.forEach(function (c) { tot += C.chainLen(c); });
ok("carré : 4 morceaux", pcs.length === 4);
ok("carré : longueur gardée = L − 4 × 0,8 mm", near(tot, tbS.L - 4 * 0.8 * MM, 1e-6), (tot / MM));
var gapOK = true;
for (k = 0; k < 4; k++) {
    var endP = C.chainToPts(pcs[k]), nextP = C.chainToPts(pcs[(k + 1) % 4]);
    var e = endP[endP.length - 1], s0 = nextP[0];
    if (!near(Math.hypot(e[0] - s0[0], e[1] - s0[1]), 0.8 * MM, 1e-6)) gapOK = false;
}
ok("carré : chaque coupure mesure 0,8 mm (côté droit)", gapOK);
var pcC = C.pieces(tbC2, plc.tabs, 1 * MM), totC = 0; pcC.forEach(function (c) { totC += C.chainLen(c); });
ok("cercle : longueur gardée = L − 5 × 1 mm (±0,05 mm)", near(totC, tbC2.L - 5 * MM, 0.05 * MM), (tbC2.L - totC) / MM);
var pcCon = true;
pcC.forEach(function (c) { c.forEach(function (sg) { for (k = 0; k <= 10; k++) { var q = C.bpt(sg, k / 10); if (Math.abs(Math.hypot(q[0], q[1]) - 40 * MM) > 0.05) pcCon = false; } }); });
ok("cercle : morceaux restés sur le cercle (Bézier conservées)", pcCon);

// 13. Tracé ouvert / open path
var line = poly([[0, 0], [100 * MM, 0]]), tbL = C.build(line, false), plL = C.place(tbL, 2, opt());
ok("ligne ouverte : 2 attaches loin des extrémités", plL.tabs.length === 2 && plL.tabs[0] > 2 * MM && plL.tabs[1] < 98 * MM, plL.tabs.map(function (s) { return s / MM; }));
var pcL = C.pieces(tbL, plL.tabs, 0.8 * MM);
ok("ligne ouverte : 3 morceaux, longueur L − 2 × 0,8 mm", pcL.length === 3 && near(pcL.reduce(function (a, c) { return a + C.chainLen(c); }, 0), 100 * MM - 1.6 * MM, 1e-6));
var lshape = poly([[0, 0], [50 * MM, 0], [50 * MM, 50 * MM]]), tbLs = C.build(lshape, false), plLs = C.place(tbLs, 1, opt());
ok("L ouvert, 1 attache : pas sur l'angle", Math.abs(plLs.tabs[0] - 50 * MM) >= 1.9 * MM, plLs.tabs[0] / MM);

// 14. Imbrication / nesting
var outer = rect(0, 0, 100 * MM, 100 * MM), hole = rect(20 * MM, 20 * MM, 60 * MM, 60 * MM), island = circle(50 * MM, 50 * MM, 10 * MM), other = rect(150 * MM, 0, 20 * MM, 20 * MM);
var tbsN = [C.build(outer, true), C.build(hole, true), C.build(island, true), C.build(other, true)];
var dep = C.depths(tbsN);
ok("profondeurs : extérieur 0, trou 1, île 2, voisin 0", dep.join(",") === "0,1,2,0", dep);
var raw = [{ pts: outer, closed: true }, { pts: hole, closed: true }, { pts: island, closed: true }, { pts: other, closed: true }];
var P0 = C.plan(raw, opt({ which: 0 }));
ok("plan pièces seulement : 3 contours coupés, trou laissé", P0.cut === 3 && P0.items[1].tabs.length === 0 && P0.filtered === 1, [P0.cut, P0.filtered]);
var P1 = C.plan(raw, opt({ which: 1 }));
ok("plan pièces + trous : 4 contours coupés", P1.cut === 4 && P1.tabs === 8);
var P2 = C.plan(raw, opt({ which: 2 }));
ok("plan trous seulement : 1 contour coupé", P2.cut === 1 && P2.items[1].tabs.length === 2);
var P3 = C.plan(raw.concat([{ pts: line, closed: false }]), opt({ which: 0, open: true }));
ok("plan : tracé ouvert inclus si demandé", P3.opens === 1 && P3.items[4].tabs.length === 2);
var P4 = C.plan(raw.concat([{ pts: line, closed: false }]), opt({ which: 0, open: false }));
ok("plan : tracé ouvert exclu par défaut", P4.items[4].tabs.length === 0 && P4.filtered === 2);
var P5 = C.plan([{ pts: circle(0, 0, 0.4 * MM), closed: true }], opt());
ok("plan : contour trop court laissé entier", P5.short === 1 && P5.cut === 0);

// 15. Repères posés à la main / hand-placed markers
var rawM = [{ pts: sq, closed: true, box: [0, 0, 100 * MM, 100 * MM] }, { pts: rect(150 * MM, 0, 20 * MM, 20 * MM), closed: true, box: [150 * MM, 0, 170 * MM, 20 * MM] }];
var marks = [[30 * MM, 100 * MM + 1], [100 * MM - 1, 40 * MM], [160 * MM, 0.5], [500 * MM, 500 * MM], [30.3 * MM, 100 * MM]];
var PM = C.planMarkers(rawM, marks, opt(), 5 * MM);
ok("repères : 1 hors tolérance", PM.unmatched.length === 1 && PM.unmatched[0] === 3, PM.unmatched);
ok("repères : doublon proche fusionné", PM.merged === 1, PM.merged);
ok("repères : 2 attaches sur le carré, 1 sur le petit carré", PM.items[0].tabs.length === 2 && PM.items[1].tabs.length === 1);
var q0 = C.pointAt(PM.items[0].tb, PM.items[0].tabs[0]);
ok("repère projeté sur le contour (30 mm, haut)", near(q0[0], 30 * MM, 0.05) && near(q0[1], 100 * MM, 0.05), q0);

// 16. Aléatoire : 300 contours, invariants / random: 300 contours, invariants
var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
var bad = 0, worst = 0;
for (var it = 0; it < 300; it++) {
    var nP = 3 + Math.floor(rnd() * 8), pp = [], closed = rnd() < 0.8;
    for (k = 0; k < nP; k++) {
        var ang = k / nP * 2 * Math.PI, rr = (20 + rnd() * 60) * MM, x = rr * Math.cos(ang), y = rr * Math.sin(ang);
        var cv = rnd() < 0.5 ? (rnd() * 10 - 5) * MM : 0;
        pp.push([x, y, x - cv, y + cv, x + cv, y - cv]);
    }
    var tb = C.build(pp, closed), o = opt({ n: 1 + Math.floor(rnd() * 6), gap: (0.3 + rnd() * 2) * MM, avoid: rnd() < 0.7 });
    var n = C.tabCount(tb.L, o); if (n < 1) continue;
    var pl = C.place(tb, n, o), pz = C.pieces(tb, pl.tabs, o.gap), sum = 0;
    pz.forEach(function (c) { sum += C.chainLen(c); });
    var expect = tb.L - pl.tabs.length * o.gap;
    if (!closed) { // extrémités : attaches dans [gap/2, L-gap/2]
        if (pl.tabs[0] < o.gap / 2 - 1e-6 || pl.tabs[pl.tabs.length - 1] > tb.L - o.gap / 2 + 1e-6) bad++;
    }
    var err = Math.abs(sum - expect); if (err > worst) worst = err;
    if (err > 0.02 * MM + 0.002 * tb.L) bad++;
    for (k = 1; k < pl.tabs.length; k++) if (pl.tabs[k] - pl.tabs[k - 1] < o.gap) bad++;
    if (closed && pz.length !== pl.tabs.length) bad++;
}
ok("300 contours aléatoires : longueurs, ordre, nombre de morceaux", bad === 0, "erreurs " + bad + ", écart max " + (worst / MM).toFixed(4) + " mm");

// 17. Rectangle arrondi (rayon 5 mm) : attaches sur les parties droites / rounded rectangle: tabs on straight parts
function rrect(x, y, w, h, r) {
    var k = K * r;
    return [
        [x + r, y + h, x + r - k, y + h, x + r, y + h], [x + w - r, y + h, x + w - r, y + h, x + w - r + k, y + h],
        [x + w, y + h - r, x + w, y + h - r + k, x + w, y + h - r], [x + w, y + r, x + w, y + r, x + w, y + r - k],
        [x + w - r, y, x + w - r + k, y, x + w - r, y], [x + r, y, x + r, y, x + r - k, y],
        [x, y + r, x, y + r - k, x, y + r], [x, y + h - r, x, y + h - r, x, y + h - r + k]
    ];
}
var tbRR = C.build(rrect(0, 0, 80 * MM, 40 * MM, 5 * MM), true), plRR = C.place(tbRR, 4, opt());
var onStraight = plRR.tabs.every(function (s) {
    var q = C.pointAt(tbRR, s), x = q[0] / MM, y = q[1] / MM;
    return ((near(y, 0, 1e-3) || near(y, 40, 1e-3)) && x >= 5 + 1.9 && x <= 75 - 1.9) || ((near(x, 0, 1e-3) || near(x, 80, 1e-3)) && y >= 5 + 1.9 && y <= 35 - 1.9);
});
ok("rectangle arrondi : 4 attaches sur les parties droites, hors des arrondis", onStraight, plRR.tabs.map(function (s) { return C.pointAt(tbRR, s).map(function (v) { return (v / MM).toFixed(1); }); }));
var pRR = C.pieces(tbRR, plRR.tabs, 0.8 * MM), arcsKept = 0;
pRR.forEach(function (c) { c.forEach(function (sg) { if (!C.isLine(sg)) arcsKept++; }); });
ok("rectangle arrondi : les 4 arrondis restent des courbes", arcsKept === 4, arcsKept);

// 18. Durée indicative (node) : 500 contours / indicative timing (node): 500 contours
var many = [];
for (k = 0; k < 500; k++) many.push({ pts: k % 2 ? circle(k * 30 * MM, 0, 10 * MM) : rect(k * 30 * MM, 0, 20 * MM, 15 * MM), closed: true });
var t0 = Date.now(), PL = C.plan(many, opt({ n: 3 }));
var dt = Date.now() - t0;
ok("500 contours planifiés (" + dt + " ms dans node)", PL.cut === 500 && PL.tabs === 1500, [PL.cut, PL.tabs]);

console.log("\n" + pass + " ok, " + fail + " échec(s)");
process.exit(fail ? 1 : 0);
