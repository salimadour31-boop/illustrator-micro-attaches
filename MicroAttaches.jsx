//@target illustrator
/*
 * MicroAttaches.jsx — v1.0.0
 * Micro-attaches automatiques pour la découpe / Automatic holding tabs for cutting
 *
 * FR : Ajoute de vraies coupures (micro-attaches, « tabs ») dans les tracés de coupe pour
 *      que les pièces restent tenues dans la plaque ou la feuille pendant la découpe laser,
 *      plotter, table de découpe, CNC : N attaches par contour ou une tous les X mm,
 *      largeur exacte en mm (+ compensation du faisceau), placées sur les parties droites
 *      loin des angles et des courbes serrées, réparties régulièrement. Contours extérieurs
 *      (pièces) seulement, ou aussi les trous, tracés ouverts au choix ; imbrication réelle
 *      des contours. Les courbes de Bézier sont conservées (découpe exacte des segments).
 *      Repères modifiables à la main avant de couper, puis « Couper aux repères posés ».
 * EN : Adds real gaps (holding tabs, micro-joints) to cut paths so that parts stay held in
 *      the sheet while laser, plotter, flatbed or CNC cutting: N tabs per contour or one
 *      every X mm, exact width in mm (+ kerf compensation), placed on straight portions away
 *      from corners and tight curves, evenly spread. Outer contours (parts) only, or holes
 *      too, open paths optional; real contour nesting. Bézier curves are kept (exact segment
 *      splitting). Markers can be edited by hand before cutting, then "Cut at placed markers".
 *
 * Auteur / Author : Amirouche Amwanes — Licence MIT / MIT License
 * Cible / Target : Adobe Illustrator CC 2018+ (ExtendScript ES3). Non testé dans Illustrator.
 * Aucun appel réseau, aucune collecte de données. / No network calls, no data collection.
 */

/* ===================================================================== */
/*  1. CŒUR GÉOMÉTRIQUE (pur, sans Illustrator) / PURE GEOMETRY CORE      */
/* ===================================================================== */

var MA_CORE = (function () {

    var PI = Math.PI;

    function dist(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }

    /*
     * Segments cubiques d'un tracé. / Cubic segments of a path.
     * pts : [[ax, ay, lx, ly, rx, ry], ...] — ancre, poignée gauche (entrante), poignée droite (sortante)
     * segment : [x0, y0, x1, y1, x2, y2, x3, y3]
     */
    function segsOf(pts, closed) {
        var n = pts.length, out = [], i, m = closed ? n : n - 1;
        for (i = 0; i < m; i++) {
            var A = pts[i], B = pts[(i + 1) % n];
            out.push([A[0], A[1], A[4], A[5], B[2], B[3], B[0], B[1]]);
        }
        return out;
    }

    function bpt(g, t) {
        var u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
        return [a * g[0] + b * g[2] + c * g[4] + d * g[6], a * g[1] + b * g[3] + c * g[5] + d * g[7]];
    }

    // Tangente (non normée) avec repli si poignée nulle / tangent with fallback on null handles
    function bder(g, t) {
        var u = 1 - t;
        var dx = 3 * u * u * (g[2] - g[0]) + 6 * u * t * (g[4] - g[2]) + 3 * t * t * (g[6] - g[4]);
        var dy = 3 * u * u * (g[3] - g[1]) + 6 * u * t * (g[5] - g[3]) + 3 * t * t * (g[7] - g[5]);
        if (dx * dx + dy * dy > 1e-12) return [dx, dy];
        if (t < 0.5) { dx = g[4] - g[0]; dy = g[5] - g[1]; }
        else { dx = g[6] - g[2]; dy = g[7] - g[3]; }
        if (dx * dx + dy * dy > 1e-12) return [dx, dy];
        return [g[6] - g[0], g[7] - g[1]];
    }

    function isLine(g) {
        var L = dist(g[0], g[1], g[6], g[7]);
        if (L < 1e-9) return dist(g[0], g[1], g[2], g[3]) < 1e-9 && dist(g[0], g[1], g[4], g[5]) < 1e-9;
        var dx = (g[6] - g[0]) / L, dy = (g[7] - g[1]) / L;
        function off(px, py) { return Math.abs((px - g[0]) * dy - (py - g[1]) * dx); }
        function along(px, py) { return (px - g[0]) * dx + (py - g[1]) * dy; }
        if (off(g[2], g[3]) > 1e-6 || off(g[4], g[5]) > 1e-6) return false;
        var a1 = along(g[2], g[3]), a2 = along(g[4], g[5]);
        return a1 >= -1e-6 && a1 <= L + 1e-6 && a2 >= -1e-6 && a2 <= L + 1e-6;
    }

    /*
     * Table d'abscisse curviligne. / Arc-length table.
     * Retour / returns { segs, closed, off:[début de chaque segment], tabs:[{ts,ls,len}], L }
     */
    function build(pts, closed) {
        var segs = segsOf(pts, closed), off = [], tabs = [], lin = [], L = 0, i, k;
        for (i = 0; i < segs.length; i++) {
            var g = segs[i], ts = [0], ls = [0];
            if (isLine(g)) {
                // Droite reparamétrée uniformément (poignées au tiers) : t = fraction de longueur.
                // Straight segment re-parametrised uniformly (handles at thirds): t = length fraction.
                var dx = g[6] - g[0], dy = g[7] - g[1];
                g = segs[i] = [g[0], g[1], g[0] + dx / 3, g[1] + dy / 3, g[0] + 2 * dx / 3, g[1] + 2 * dy / 3, g[6], g[7]];
                lin.push(true);
                ts.push(1); ls.push(dist(g[0], g[1], g[6], g[7]));
            } else {
                lin.push(false);
                var poly = dist(g[0], g[1], g[2], g[3]) + dist(g[2], g[3], g[4], g[5]) + dist(g[4], g[5], g[6], g[7]);
                var K = Math.ceil(poly / 0.5); if (K < 16) K = 16; if (K > 400) K = 400;
                var px = g[0], py = g[1], acc = 0;
                for (k = 1; k <= K; k++) {
                    var t = k / K, p = bpt(g, t);
                    acc += dist(px, py, p[0], p[1]); px = p[0]; py = p[1];
                    ts.push(t); ls.push(acc);
                }
            }
            off.push(L);
            tabs.push({ ts: ts, ls: ls, len: ls[ls.length - 1] });
            L += ls[ls.length - 1];
        }
        return { segs: segs, closed: closed, off: off, tabs: tabs, lin: lin, L: L };
    }

    // Abscisse -> (segment, t). s dans [0, L] / arc length -> (segment, t). s in [0, L]
    function locate(tb, s) {
        var n = tb.segs.length, lo = 0, hi = n - 1, mid;
        if (s <= 0) return { i: 0, t: 0 };
        if (s >= tb.L) return { i: n - 1, t: 1 };
        while (lo < hi) { mid = (lo + hi + 1) >> 1; if (tb.off[mid] <= s) lo = mid; else hi = mid - 1; }
        var tab = tb.tabs[lo], loc = s - tb.off[lo], a = 0, b = tab.ls.length - 1;
        if (tab.len <= 1e-12) return { i: lo, t: 0 };
        if (loc >= tab.len) return { i: lo, t: 1 };
        while (b - a > 1) { mid = (a + b) >> 1; if (tab.ls[mid] <= loc) a = mid; else b = mid; }
        var f = (loc - tab.ls[a]) / ((tab.ls[b] - tab.ls[a]) || 1);
        return { i: lo, t: tab.ts[a] + f * (tab.ts[b] - tab.ts[a]) };
    }

    function wrapS(tb, s) {
        if (!tb.closed) return Math.max(0, Math.min(tb.L, s));
        var L = tb.L; s = s % L; if (s < 0) s += L; return s;
    }
    function pointAt(tb, s) { var q = locate(tb, wrapS(tb, s)); return bpt(tb.segs[q.i], q.t); }
    function angleAt(tb, s) { var q = locate(tb, wrapS(tb, s)), d = bder(tb.segs[q.i], q.t); return Math.atan2(d[1], d[0]); }

    // De Casteljau
    function split(g, t) {
        var x01 = g[0] + (g[2] - g[0]) * t, y01 = g[1] + (g[3] - g[1]) * t;
        var x12 = g[2] + (g[4] - g[2]) * t, y12 = g[3] + (g[5] - g[3]) * t;
        var x23 = g[4] + (g[6] - g[4]) * t, y23 = g[5] + (g[7] - g[5]) * t;
        var xa = x01 + (x12 - x01) * t, ya = y01 + (y12 - y01) * t;
        var xb = x12 + (x23 - x12) * t, yb = y12 + (y23 - y12) * t;
        var xm = xa + (xb - xa) * t, ym = ya + (yb - ya) * t;
        return [[g[0], g[1], x01, y01, xa, ya, xm, ym], [xm, ym, xb, yb, x23, y23, g[6], g[7]]];
    }
    function subSeg(g, t0, t1) {
        var h = g;
        if (t1 < 1 - 1e-12) h = split(h, t1)[0];
        if (t0 > 1e-12) h = split(h, t1 > 1e-12 ? t0 / t1 : 0)[1];
        return h;
    }

    /*
     * Morceau de tracé entre deux abscisses (a < b ; b jusqu'à a + L si fermé).
     * Piece of path between two arc lengths (a < b; b up to a + L when closed).
     */
    function extract(tb, a, b) {
        var n = tb.segs.length, L = tb.L, out = [];
        if (tb.closed) { while (a >= L) { a -= L; b -= L; } while (a < 0) { a += L; b += L; } }
        function locU(s) {
            var w = 0;
            if (tb.closed) { while (s > L + 1e-9) { s -= L; w++; } }
            var q = locate(tb, s);
            return { g: q.i + w * n, t: q.t };
        }
        var A = locU(a), B = locU(b), g;
        for (g = A.g; g <= B.g; g++) {
            var t0 = g === A.g ? A.t : 0, t1 = g === B.g ? B.t : 1;
            if (t1 - t0 > 1e-9) {
                var h = subSeg(tb.segs[g % n], t0, t1);
                // Droites : poignées rentrées / straight segments: retracted handles
                if (tb.lin[g % n]) h = [h[0], h[1], h[0], h[1], h[6], h[7], h[6], h[7]];
                out.push(h);
            }
        }
        return out;
    }

    // Chaîne de segments -> points Illustrator / segment chain -> Illustrator points
    function chainToPts(ch) {
        var out = [], k, m = ch.length;
        if (!m) return out;
        out.push([ch[0][0], ch[0][1], ch[0][0], ch[0][1], ch[0][2], ch[0][3]]);
        for (k = 1; k < m; k++) out.push([ch[k][0], ch[k][1], ch[k - 1][4], ch[k - 1][5], ch[k][2], ch[k][3]]);
        out.push([ch[m - 1][6], ch[m - 1][7], ch[m - 1][4], ch[m - 1][5], ch[m - 1][6], ch[m - 1][7]]);
        return out;
    }
    function chainLen(ch) {
        var s = 0, k, j;
        for (k = 0; k < ch.length; k++) {
            var g = ch[k], px = g[0], py = g[1];
            if (isLine(g)) { s += dist(g[0], g[1], g[6], g[7]); continue; }
            for (j = 1; j <= 64; j++) { var p = bpt(g, j / 64); s += dist(px, py, p[0], p[1]); px = p[0]; py = p[1]; }
        }
        return s;
    }

    /*
     * Profil de virage : échantillons réguliers et virage absolu entre voisins.
     * Turning profile: regular samples and absolute turning between neighbours.
     */
    function profile(tb, M) {
        var L = tb.L, closed = tb.closed, i;
        if (M < 8) M = 8;
        var ds = closed ? L / M : L / (M - 1), ang = [], d = [];
        for (i = 0; i < M; i++) ang.push(angleAt(tb, closed ? (i + 0.5) * ds : Math.min(i * ds, L)));
        var nd = closed ? M : M - 1;
        for (i = 0; i < nd; i++) {
            var a = ang[(i + 1) % M] - ang[i];
            while (a > PI) a -= 2 * PI;
            while (a < -PI) a += 2 * PI;
            d.push(Math.abs(a) * 180 / PI);
        }
        var P = [0];
        for (i = 0; i < nd; i++) P.push(P[i] + d[i]);
        return { M: M, ds: ds, d: d, P: P, closed: closed, L: L };
    }
    function sampleS(pr, k) { return pr.closed ? (k + 0.5) * pr.ds : k * pr.ds; }

    // Somme des virages des écarts j..j2-1 / turning sum over diffs j..j2-1
    function rangeSum(pr, lo, hi) {
        var nd = pr.d.length;
        if (hi <= lo) return 0;
        if (pr.closed) {
            if (hi - lo >= nd) return pr.P[nd];
            var a = ((lo % nd) + nd) % nd, b = a + (hi - lo);
            if (b <= nd) return pr.P[b] - pr.P[a];
            return pr.P[nd] - pr.P[a] + pr.P[b - nd];
        }
        if (lo < 0) lo = 0; if (hi > nd) hi = nd;
        return hi > lo ? pr.P[hi] - pr.P[lo] : 0;
    }

    // Minimum glissant (file à double entrée) / sliding minimum (deque)
    function slideMin(cost, r, closed) {
        var M = cost.length, out = [], i;
        if (r <= 0) { for (i = 0; i < M; i++) out.push(cost[i]); return out; }
        if (closed && 2 * r + 1 >= M) {
            var mn = Infinity; for (i = 0; i < M; i++) if (cost[i] < mn) mn = cost[i];
            for (i = 0; i < M; i++) out.push(mn); return out;
        }
        var ext = [];
        for (i = -r; i < M + r; i++) {
            if (closed) ext.push(cost[((i % M) + M) % M]);
            else ext.push(i < 0 || i >= M ? Infinity : cost[i]);
        }
        var dq = [], head = 0, w = 2 * r + 1;
        for (i = 0; i < ext.length; i++) {
            while (dq.length > head && ext[dq[dq.length - 1]] >= ext[i]) dq.pop();
            dq.push(i);
            if (dq[head] <= i - w) head++;
            if (i >= w - 1) out.push(ext[dq[head]]);
        }
        return out;
    }

    /*
     * Coût de chaque échantillon : virage dans la fenêtre de l'attache (+ marge aux angles),
     * plus une petite pénalité près des zones à éviter (préférence pour le milieu des côtés).
     * Cost per sample: turning inside the tab window (+ corner margin), plus a small penalty
     * near zones to avoid (prefers the middle of straight sides).
     */
    function costs(pr, half, avoid, clearRef) {
        var M = pr.M, cost = [], i, hw = Math.max(1, Math.ceil(half / pr.ds));
        if (!avoid) { for (i = 0; i < M; i++) cost.push(0); return { cost: cost, turn: cost }; }
        var turn = [];
        for (i = 0; i < M; i++) turn.push(rangeSum(pr, i - hw, i + hw));
        // Distance aux zones à éviter (virage >= 10°) / distance to zones to avoid
        var BIG = 1e9, cl = [], k;
        for (i = 0; i < M; i++) cl.push(turn[i] >= 10 ? 0 : BIG);
        var passes = pr.closed ? 2 : 1;
        for (k = 0; k < passes; k++) {
            for (i = 0; i < M; i++) { var p = pr.closed ? (i + M - 1) % M : i - 1; if (p >= 0 && cl[p] + 1 < cl[i]) cl[i] = cl[p] + 1; }
            for (i = M - 1; i >= 0; i--) { var q = pr.closed ? (i + 1) % M : i + 1; if (q < M && cl[q] + 1 < cl[i]) cl[i] = cl[q] + 1; }
        }
        var ref = Math.max(1, clearRef / pr.ds);
        for (i = 0; i < M; i++) {
            var c = cl[i] >= BIG ? 1 : Math.min(cl[i], ref) / ref;
            cost.push(turn[i] + 5 * (1 - c));
        }
        return { cost: cost, turn: turn };
    }

    /*
     * Place n attaches sur un contour. / Places n tabs on a contour.
     * opt : { gap (pt), margin (pt), avoid (bool) }
     * Retour / returns { tabs:[s...], bad: nombre d'attaches sur angle/courbe }
     */
    function place(tb, n, opt) {
        var L = tb.L, res = { tabs: [], bad: 0, turn: [] };
        if (n < 1 || L <= 0) return res;
        var M = Math.round(L / (0.25 * 72 / 25.4)); if (M < 64) M = 64; if (M > 1000) M = 1000;
        var pr = profile(tb, M), half = opt.gap / 2 + (opt.avoid ? opt.margin : 0), i, j, k;
        var spacing = tb.closed ? L / n : Math.max(L - 2 * (opt.gap / 2 + opt.margin), 0) / n;
        var cc = costs(pr, half, opt.avoid, spacing * 0.5), cost = cc.cost;
        var sp = tb.closed ? M / n : 0, r;
        var chosen = [];
        if (tb.closed) {
            r = Math.floor(sp * 0.3);
            var W = slideMin(cost, r, true), bestP = 0, bestC = Infinity, steps = Math.max(1, Math.ceil(sp));
            for (k = 0; k < steps; k++) {
                var c = 0;
                for (j = 0; j < n; j++) c += W[Math.round(k + j * sp) % M];
                if (c < bestC - 1e-9) { bestC = c; bestP = k; }
            }
            for (j = 0; j < n; j++) {
                var ideal = Math.round(bestP + j * sp), bk = ideal % M, bv = Infinity;
                for (i = ideal - r; i <= ideal + r; i++) {
                    var ii = ((i % M) + M) % M, v = cost[ii] + 0.01 * Math.abs(i - ideal);
                    if (v < bv) { bv = v; bk = ii; }
                }
                chosen.push(bk);
            }
        } else {
            var e = opt.gap / 2 + opt.margin, kLo = Math.ceil(e / pr.ds), kHi = Math.floor((L - e) / pr.ds);
            if (kHi < kLo) { kLo = kHi = Math.round((M - 1) / 2); }
            var spO = (kHi - kLo) / n;
            r = Math.floor(spO * 0.3);
            for (j = 0; j < n; j++) {
                var id = Math.round(kLo + spO * (j + 0.5)), best = id, bvv = Infinity;
                for (i = Math.max(kLo, id - r); i <= Math.min(kHi, id + r); i++) {
                    var vv = cost[i] + 0.01 * Math.abs(i - id);
                    if (vv < bvv) { bvv = vv; best = i; }
                }
                chosen.push(best);
            }
        }
        chosen.sort(function (a, b) { return a - b; });
        for (j = 0; j < chosen.length; j++) {
            if (j > 0 && chosen[j] === chosen[j - 1]) continue;
            res.tabs.push(sampleS(pr, chosen[j]));
            var tv = opt.avoid ? cc.turn[chosen[j]] : rangeSum(pr, chosen[j] - Math.max(1, Math.ceil((opt.gap / 2) / pr.ds)), chosen[j] + Math.max(1, Math.ceil((opt.gap / 2) / pr.ds)));
            res.turn.push(tv);
            if (tv > 25) res.bad++;
        }
        return res;
    }

    // Nombre d'attaches voulu / wanted number of tabs
    function tabCount(L, opt) {
        if (L < opt.minLen || L < 3 * opt.gap) return 0;
        var n = opt.useSpacing ? Math.max(opt.minN, Math.round(L / opt.spacing)) : opt.n;
        var nMax = Math.floor(L / (3 * opt.gap));
        if (n > nMax) n = nMax;
        return n < 0 ? 0 : n;
    }

    /*
     * Morceaux gardés autour des attaches (abscisses triées).
     * Kept pieces around the tabs (sorted arc lengths).
     */
    function pieces(tb, tabs, gap) {
        var out = [], n = tabs.length, j, h = gap / 2, L = tb.L;
        if (!n) return out;
        if (tb.closed) {
            for (j = 0; j < n; j++) {
                var a = tabs[j] + h, b = (j + 1 < n ? tabs[j + 1] : tabs[0] + L) - h;
                if (b - a > 1e-6) out.push(extract(tb, a, b));
            }
        } else {
            var st = 0;
            for (j = 0; j < n; j++) {
                var e = Math.max(0, tabs[j] - h);
                if (e - st > 1e-6) out.push(extract(tb, st, e));
                st = Math.min(L, tabs[j] + h);
            }
            if (L - st > 1e-6) out.push(extract(tb, st, L));
        }
        return out;
    }

    // Point le plus proche sur le contour / nearest point on the contour
    function nearest(tb, x, y) {
        var M = Math.max(64, Math.min(2000, Math.round(tb.L / 1))), i, best = 0, bd = Infinity;
        var ds = tb.L / M;
        for (i = 0; i <= M; i++) {
            var p = pointAt(tb, i * ds), d = dist(p[0], p[1], x, y);
            if (d < bd) { bd = d; best = i * ds; }
        }
        var lo = best - ds, hi = best + ds, it;
        if (!tb.closed) { lo = Math.max(0, lo); hi = Math.min(tb.L, hi); }
        for (it = 0; it < 40; it++) {
            var m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
            var p1 = pointAt(tb, m1), p2 = pointAt(tb, m2);
            if (dist(p1[0], p1[1], x, y) < dist(p2[0], p2[1], x, y)) hi = m2; else lo = m1;
        }
        var s = wrapS(tb, (lo + hi) / 2), q = pointAt(tb, s);
        return { s: s, d: dist(q[0], q[1], x, y) };
    }

    // Polygone d'un contour fermé / polygon of a closed contour
    function polygon(tb) {
        var M = Math.max(32, Math.min(600, Math.round(tb.L / 2))), xs = [], ys = [], i, a = 0;
        for (i = 0; i < M; i++) { var p = pointAt(tb, (i + 0.5) * tb.L / M); xs.push(p[0]); ys.push(p[1]); }
        for (i = 0; i < M; i++) { var k = (i + 1) % M; a += xs[i] * ys[k] - xs[k] * ys[i]; }
        var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
        for (i = 0; i < M; i++) { if (xs[i] < minx) minx = xs[i]; if (xs[i] > maxx) maxx = xs[i]; if (ys[i] < miny) miny = ys[i]; if (ys[i] > maxy) maxy = ys[i]; }
        return { xs: xs, ys: ys, area: Math.abs(a / 2), box: [minx, miny, maxx, maxy] };
    }
    function inside(pg, x, y) {
        if (x < pg.box[0] || x > pg.box[2] || y < pg.box[1] || y > pg.box[3]) return false;
        var c = false, n = pg.xs.length, i, j;
        for (i = 0, j = n - 1; i < n; j = i++) {
            var yi = pg.ys[i], yj = pg.ys[j];
            if ((yi > y) !== (yj > y) && x < (pg.xs[j] - pg.xs[i]) * (y - yi) / (yj - yi) + pg.xs[i]) c = !c;
        }
        return c;
    }

    /*
     * Profondeur d'imbrication des contours fermés (0 = pièce extérieure, 1 = trou, 2 = pièce
     * dans un trou…). Nesting depth of closed contours (0 = outer part, 1 = hole, 2 = part in a hole…).
     */
    function depths(tbs) {
        var pgs = [], out = [], i, j, k;
        for (i = 0; i < tbs.length; i++) pgs.push(tbs[i].closed && tbs[i].L > 0 ? polygon(tbs[i]) : null);
        for (i = 0; i < tbs.length; i++) {
            if (!pgs[i]) { out.push(-1); continue; }
            var d = 0;
            for (j = 0; j < tbs.length; j++) {
                if (j === i || !pgs[j] || pgs[j].area <= pgs[i].area) continue;
                // vote sur 3 points / vote on 3 points
                var votes = 0, m = pgs[i].xs.length;
                for (k = 0; k < 3; k++) { var q = Math.floor(k * m / 3); if (inside(pgs[j], pgs[i].xs[q], pgs[i].ys[q])) votes++; }
                if (votes >= 2) d++;
            }
            out.push(d);
        }
        return out;
    }

    /*
     * Plan complet. / Full plan.
     * raw : [{ pts, closed }]
     * opt : { gap, margin, avoid, n, useSpacing, spacing, minN, minLen, which (0 pièces, 1 pièces+trous, 2 trous), open }
     */
    function plan(raw, opt) {
        var tbs = [], i, out = { items: [], parts: 0, holes: 0, opens: 0, tabs: 0, bad: 0, short: 0, filtered: 0, cut: 0 };
        for (i = 0; i < raw.length; i++) tbs.push(build(raw[i].pts, raw[i].closed));
        var dep = depths(tbs);
        for (i = 0; i < raw.length; i++) {
            var tb = tbs[i], it = { idx: i, tb: tb, depth: dep[i], tabs: [], pieces: [], bad: 0, reason: "" };
            out.items.push(it);
            var kind = !tb.closed ? "open" : (dep[i] % 2 === 0 ? "part" : "hole");
            it.kind = kind;
            if (kind === "open") out.opens++; else if (kind === "part") out.parts++; else out.holes++;
            var want = kind === "open" ? opt.open : (opt.which === 0 ? kind === "part" : (opt.which === 2 ? kind === "hole" : true));
            if (!want) { it.reason = "filter"; out.filtered++; continue; }
            var n = tabCount(tb.L, opt);
            if (n < 1) { it.reason = "short"; out.short++; continue; }
            var pl = place(tb, n, opt);
            it.tabs = pl.tabs; it.bad = pl.bad; it.turn = pl.turn;
            it.pieces = pieces(tb, pl.tabs, opt.gap);
            out.tabs += pl.tabs.length; out.bad += pl.bad; out.cut++;
        }
        return out;
    }

    /*
     * Attaches à partir de repères (x, y) : chaque repère va au contour le plus proche.
     * Tabs from markers (x, y): each marker goes to the nearest contour.
     */
    function planMarkers(raw, marks, opt, tol) {
        var tbs = [], i, j, out = { items: [], tabs: 0, unmatched: [], cut: 0, merged: 0 };
        for (i = 0; i < raw.length; i++) { tbs.push(build(raw[i].pts, raw[i].closed)); out.items.push({ idx: i, tb: tbs[i], tabs: [], pieces: [] }); }
        for (j = 0; j < marks.length; j++) {
            var bi = -1, bs = 0, bd = Infinity;
            for (i = 0; i < tbs.length; i++) {
                var b = raw[i].box;
                if (b && (marks[j][0] < b[0] - tol || marks[j][0] > b[2] + tol || marks[j][1] < b[1] - tol || marks[j][1] > b[3] + tol)) continue;
                var q = nearest(tbs[i], marks[j][0], marks[j][1]);
                if (q.d < bd) { bd = q.d; bi = i; bs = q.s; }
            }
            if (bi < 0 || bd > tol) { out.unmatched.push(j); continue; }
            var tb = tbs[bi];
            if (!tb.closed) bs = Math.max(opt.gap / 2, Math.min(tb.L - opt.gap / 2, bs));
            out.items[bi].tabs.push(bs);
        }
        for (i = 0; i < out.items.length; i++) {
            var itm = out.items[i], L = itm.tb.L, t = itm.tabs, keep = [];
            if (!t.length) continue;
            t.sort(function (a, b) { return a - b; });
            for (j = 0; j < t.length; j++) {
                if (keep.length && t[j] - keep[keep.length - 1] < 1.5 * opt.gap) { out.merged++; continue; }
                keep.push(t[j]);
            }
            if (itm.tb.closed && keep.length > 1 && keep[0] + L - keep[keep.length - 1] < 1.5 * opt.gap) { keep.pop(); out.merged++; }
            if (L < 3 * opt.gap) { continue; }
            itm.tabs = keep;
            itm.pieces = pieces(itm.tb, keep, opt.gap);
            out.tabs += keep.length; out.cut++;
        }
        return out;
    }

    return { segsOf: segsOf, bpt: bpt, build: build, locate: locate, pointAt: pointAt, angleAt: angleAt, split: split,
             subSeg: subSeg, extract: extract, chainToPts: chainToPts, chainLen: chainLen, profile: profile,
             slideMin: slideMin, place: place, tabCount: tabCount, pieces: pieces, nearest: nearest,
             polygon: polygon, inside: inside, depths: depths, plan: plan, planMarkers: planMarkers, isLine: isLine };
})();

/* ===================================================================== */
/*  2. TEXTES FR / EN  —  UI STRINGS                                      */
/* ===================================================================== */

var MA_FR = (function () {
    var l = "";
    try { l = String(app.locale || $.locale || ""); } catch (e) { try { l = String($.locale); } catch (e2) {} }
    return l.toLowerCase().indexOf("fr") === 0;
})();

var MA_T = MA_FR ? {
    title: "Micro-attaches de découpe — v1.0.0",
    noDoc: "Ouvrez un document avant de lancer le script.",
    noSel: "Sélectionnez les tracés de coupe (tracés, tracés transparents ou groupes).",
    pTab: "Attaches", width: "Largeur (mm) :", kerf: "Compensation du faisceau (mm) :",
    rbCount: "Nombre par contour :", rbSpace: "Une attache tous les (mm) :", minN: "minimum :",
    pCont: "Contours concernés",
    w0: "Pièces seulement (contours extérieurs ; les chutes intérieures tombent)",
    w1: "Pièces et trous (rien ne tombe)", w2: "Trous seulement (garder les chutes en place)",
    open: "Inclure les tracés ouverts", minLen: "Ignorer les contours plus courts que (mm) :",
    pPlace: "Placement", avoid: "Éviter les angles et les courbes serrées", margin: "Distance aux angles (mm) :",
    pAct: "Action", aCut: "Couper les tracés (créer les attaches)",
    aMark: "Poser seulement les repères (à déplacer, ajouter ou supprimer à la main)",
    aFromMarks: "Couper aux repères posés (calque « Micro-attaches – repères »)",
    keep: "Conserver une copie de l'original (calque masqué et verrouillé)",
    tip: "Conseil : travaillez sur une copie du fichier. Les textes doivent être vectorisés. Les courbes sont conservées.",
    analyse: "Analyser", clear: "Effacer les repères", cancel: "Annuler", ok: "OK",
    badNum: "Entrez une largeur, un nombre ou un espacement supérieurs à 0.",
    layMark: "Micro-attaches – repères", layOrig: "Micro-attaches – original", layCheck: "Micro-attaches – à vérifier", grpName: "Micro-attaches",
    nothing: "Aucun tracé de coupe exploitable dans la sélection.",
    rep: "Contours : {c} (pièces {p}, trous {h}, ouverts {o})\nContours à couper : {k} — attaches : {t} de {w} mm",
    repShort: "Contours trop courts, laissés entiers : {n}", repFilt: "Contours exclus par le choix « Contours concernés » : {n}",
    repBad: "Attaches posées sur un angle ou une courbe faute de partie droite assez longue : {n} (repères orange)",
    checkLay: "Attaches à vérifier : repères orange sur le calque « {l} » (non imprimable).",
    ignText: "Textes ignorés (vectorisez-les d'abord) : {n}", ignOther: "Objets ignorés (images, symboles, verrouillés, masqués…) : {n}",
    analyseTitle: "Analyse (rien n'a été modifié)",
    marked: "{t} repère(s) posé(s) sur le calque « {l} » (non imprimable).\nDéplacez, ajoutez (copiez un repère) ou supprimez des repères, puis relancez le script avec « Couper aux repères posés ».",
    done: "{k} contour(s) coupé(s), {t} attache(s) créée(s).",
    origKept: "Copie de l'original : calque « {l} » (masqué).",
    noMarks: "Aucun repère trouvé (calque « Micro-attaches – repères »).",
    unmatched: "Repères trop loin d'un tracé sélectionné, laissés en place : {n}",
    merged: "Repères trop proches fusionnés : {n}",
    cleared: "Calques de repères supprimés : {n}",
    undo: "Annuler : Ctrl+Z / Cmd+Z (plusieurs fois si besoin).",
    tabName: "Attache"
} : {
    title: "Cutting holding tabs — v1.0.0",
    noDoc: "Open a document before running the script.",
    noSel: "Select the cut paths (paths, compound paths or groups).",
    pTab: "Tabs", width: "Width (mm):", kerf: "Kerf compensation (mm):",
    rbCount: "Number per contour:", rbSpace: "One tab every (mm):", minN: "minimum:",
    pCont: "Contours to tab",
    w0: "Parts only (outer contours; inner scraps fall out)",
    w1: "Parts and holes (nothing falls out)", w2: "Holes only (keep scraps in place)",
    open: "Include open paths", minLen: "Skip contours shorter than (mm):",
    pPlace: "Placement", avoid: "Avoid corners and tight curves", margin: "Distance from corners (mm):",
    pAct: "Action", aCut: "Cut the paths (create the tabs)",
    aMark: "Only place markers (move, add or delete them by hand)",
    aFromMarks: "Cut at placed markers (layer \"Holding tabs – markers\")",
    keep: "Keep a copy of the original (hidden, locked layer)",
    tip: "Tip: work on a copy of the file. Text must be outlined. Curves are kept.",
    analyse: "Analyze", clear: "Clear markers", cancel: "Cancel", ok: "OK",
    badNum: "Enter a width, a number or a spacing greater than 0.",
    layMark: "Holding tabs – markers", layOrig: "Holding tabs – original", layCheck: "Holding tabs – to check", grpName: "Holding tabs",
    nothing: "No usable cut path in the selection.",
    rep: "Contours: {c} (parts {p}, holes {h}, open {o})\nContours to cut: {k} — tabs: {t} of {w} mm",
    repShort: "Contours too short, left whole: {n}", repFilt: "Contours excluded by \"Contours to tab\": {n}",
    repBad: "Tabs placed on a corner or curve because no long enough straight part was found: {n} (orange markers)",
    checkLay: "Tabs to check: orange markers on layer \"{l}\" (non-printing).",
    ignText: "Text ignored (outline it first): {n}", ignOther: "Ignored objects (images, symbols, locked, hidden…): {n}",
    analyseTitle: "Analysis (nothing was changed)",
    marked: "{t} marker(s) placed on layer \"{l}\" (non-printing).\nMove, add (copy a marker) or delete markers, then run the script again with \"Cut at placed markers\".",
    done: "{k} contour(s) cut, {t} tab(s) created.",
    origKept: "Copy of the original: layer \"{l}\" (hidden).",
    noMarks: "No marker found (layer \"Holding tabs – markers\").",
    unmatched: "Markers too far from a selected path, left in place: {n}",
    merged: "Markers too close together, merged: {n}",
    cleared: "Marker layers deleted: {n}",
    undo: "Undo: Ctrl+Z / Cmd+Z (several times if needed).",
    tabName: "Tab"
};

function MA_fill(s, o) { var k; for (k in o) s = s.split("{" + k + "}").join(o[k]); return s; }
function MA_num(n, d) { var s = n.toFixed(d); return MA_FR ? s.replace(".", ",") : s; }
function MA_parse(v) { var n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? -1 : n; }

var MA_MM = 72 / 25.4;
var MA_NOTE_MARK = "MA_MARK";

/* ===================================================================== */
/*  3. RÉGLAGES (fichier local) / SETTINGS (local file)                   */
/* ===================================================================== */

function MA_cfgFile() { return new File(Folder.userData + "/MicroAttaches.cfg"); }
function MA_defaults() {
    return { w: "0.8", kerf: "0", useSp: "0", n: "2", sp: "60", minN: "1", which: "0", open: "0", minLen: "3",
             avoid: "1", margin: "1.5", act: "cut", keep: "1" };
}
function MA_loadCfg() {
    var c = MA_defaults();
    try {
        var f = MA_cfgFile();
        if (f.exists && f.open("r")) {
            while (!f.eof) { var ln = f.readln(), p = ln.indexOf("="); if (p > 0) c[ln.substring(0, p)] = ln.substring(p + 1); }
            f.close();
        }
    } catch (e) {}
    return c;
}
function MA_saveCfg(c) {
    try { var f = MA_cfgFile(), k; if (f.open("w")) { for (k in c) if (k !== "action") f.writeln(k + "=" + c[k]); f.close(); } } catch (e) {}
}

// Réglages -> options du cœur (points) / settings -> core options (points)
function MA_opts(cfg) {
    var w = MA_parse(cfg.w), kerf = Math.max(0, MA_parse(cfg.kerf));
    return {
        gap: (w + kerf) * MA_MM, width: w, kerf: kerf, margin: Math.max(0, MA_parse(cfg.margin)) * MA_MM,
        avoid: cfg.avoid !== "0", useSpacing: cfg.useSp === "1", n: Math.max(1, Math.round(MA_parse(cfg.n))),
        spacing: Math.max(1, MA_parse(cfg.sp)) * MA_MM, minN: Math.max(1, Math.round(MA_parse(cfg.minN))),
        minLen: Math.max(0, MA_parse(cfg.minLen)) * MA_MM, which: parseInt(cfg.which, 10) || 0, open: cfg.open === "1",
        act: cfg.act, keep: cfg.keep !== "0"
    };
}

/* ===================================================================== */
/*  4. DIALOGUE ScriptUI / DIALOG                                          */
/* ===================================================================== */

function MA_dialog(cfg) {
    var T = MA_T, res = null;
    var w = new Window("dialog", T.title);
    w.orientation = "column"; w.alignChildren = "fill";

    var p1 = w.add("panel", undefined, T.pTab); p1.alignChildren = "left"; p1.margins = 12;
    var g1 = p1.add("group");
    g1.add("statictext", undefined, T.width); var eW = g1.add("edittext", undefined, cfg.w); eW.characters = 5;
    g1.add("statictext", undefined, T.kerf); var eK = g1.add("edittext", undefined, cfg.kerf); eK.characters = 5;
    var g2 = p1.add("group");
    var rbN = g2.add("radiobutton", undefined, T.rbCount); var eN = g2.add("edittext", undefined, cfg.n); eN.characters = 4;
    var g3 = p1.add("group");
    var rbS = g3.add("radiobutton", undefined, T.rbSpace); var eS = g3.add("edittext", undefined, cfg.sp); eS.characters = 5;
    g3.add("statictext", undefined, T.minN); var eM = g3.add("edittext", undefined, cfg.minN); eM.characters = 3;
    rbS.value = cfg.useSp === "1"; rbN.value = !rbS.value;

    var p2 = w.add("panel", undefined, T.pCont); p2.alignChildren = "left"; p2.margins = 12;
    var ddW = p2.add("dropdownlist", undefined, [T.w0, T.w1, T.w2]); ddW.selection = parseInt(cfg.which, 10) || 0;
    var cbO = p2.add("checkbox", undefined, T.open); cbO.value = cfg.open === "1";
    var g4 = p2.add("group"); g4.add("statictext", undefined, T.minLen);
    var eL = g4.add("edittext", undefined, cfg.minLen); eL.characters = 5;

    var p3 = w.add("panel", undefined, T.pPlace); p3.alignChildren = "left"; p3.margins = 12;
    var cbA = p3.add("checkbox", undefined, T.avoid); cbA.value = cfg.avoid !== "0";
    var g5 = p3.add("group"); g5.add("statictext", undefined, T.margin);
    var eG = g5.add("edittext", undefined, cfg.margin); eG.characters = 5;

    var p4 = w.add("panel", undefined, T.pAct); p4.alignChildren = "left"; p4.margins = 12;
    var rbC = p4.add("radiobutton", undefined, T.aCut), rbM = p4.add("radiobutton", undefined, T.aMark),
        rbF = p4.add("radiobutton", undefined, T.aFromMarks);
    rbC.value = cfg.act !== "mark" && cfg.act !== "fromMarks"; rbM.value = cfg.act === "mark"; rbF.value = cfg.act === "fromMarks";
    var cbK = p4.add("checkbox", undefined, T.keep); cbK.value = cfg.keep !== "0";

    var tip = w.add("statictext", undefined, T.tip, { multiline: true }); tip.preferredSize = [500, 34];

    function sync() { eN.enabled = rbN.value; eS.enabled = rbS.value; eM.enabled = rbS.value; eG.enabled = cbA.value; }
    rbN.onClick = function () { rbS.value = false; sync(); };
    rbS.onClick = function () { rbN.value = false; sync(); };
    cbA.onClick = sync; sync();

    var gb = w.add("group"); gb.alignment = "right";
    var bAn = gb.add("button", undefined, T.analyse), bCl = gb.add("button", undefined, T.clear);
    var bC = gb.add("button", undefined, T.cancel, { name: "cancel" }), bOk = gb.add("button", undefined, T.ok, { name: "ok" });

    function collect(action) {
        var wv = MA_parse(eW.text), nv = MA_parse(eN.text), sv = MA_parse(eS.text);
        if (action !== "clear" && (wv <= 0 || (rbN.value && nv < 1) || (rbS.value && sv <= 0))) { alert(T.badNum); return; }
        res = {
            w: String(wv), kerf: String(Math.max(0, MA_parse(eK.text))), useSp: rbS.value ? "1" : "0", n: String(Math.round(Math.max(1, nv))),
            sp: String(sv > 0 ? sv : 60), minN: String(Math.max(1, Math.round(MA_parse(eM.text)))), which: String(ddW.selection.index),
            open: cbO.value ? "1" : "0", minLen: String(Math.max(0, MA_parse(eL.text))), avoid: cbA.value ? "1" : "0",
            margin: String(Math.max(0, MA_parse(eG.text))), act: rbM.value ? "mark" : (rbF.value ? "fromMarks" : "cut"),
            keep: cbK.value ? "1" : "0", action: action
        };
        w.close(1);
    }
    bAn.onClick = function () { collect("analyse"); };
    bCl.onClick = function () { collect("clear"); };
    bOk.onClick = function () { collect("run"); };
    bC.onClick = function () { res = null; w.close(0); };
    w.show();
    return res;
}

/* ===================================================================== */
/*  5. ILLUSTRATOR                                                        */
/* ===================================================================== */

function MA_color(doc, r, g, b, c, m, y, k) {
    var col;
    if (doc.documentColorSpace === DocumentColorSpace.CMYK) { col = new CMYKColor(); col.cyan = c; col.magenta = m; col.yellow = y; col.black = k; }
    else { col = new RGBColor(); col.red = r; col.green = g; col.blue = b; }
    return col;
}

/*
 * Collecte les contours de la sélection. / Collects contours from the selection.
 * Chaque contour : { path, compound, closed, pts, box }
 */
function MA_collect(items, info) {
    var out = [];
    function pts(p) {
        var pp = p.pathPoints, a = [], i;
        for (i = 0; i < pp.length; i++) {
            var q = pp[i];
            a.push([q.anchor[0], q.anchor[1], q.leftDirection[0], q.leftDirection[1], q.rightDirection[0], q.rightDirection[1]]);
        }
        return a;
    }
    function addPath(p, comp) {
        try {
            if (p.guides || p.clipping) return;
            if (p.pathPoints.length < 2) return;
            var gb = p.geometricBounds; // [gauche, haut, droite, bas] / [left, top, right, bottom]
            out.push({ path: p, compound: comp, closed: p.closed, pts: pts(p), box: [gb[0], gb[3], gb[2], gb[1]] });
        } catch (e) { info.other++; }
    }
    function walk(it) {
        var ty = it.typename, i;
        try { if (it.locked || it.hidden) { info.other++; return; } } catch (e0) {}
        if (ty === "PathItem") addPath(it, null);
        else if (ty === "CompoundPathItem") { for (i = 0; i < it.pathItems.length; i++) addPath(it.pathItems[i], it); }
        else if (ty === "GroupItem") { for (i = 0; i < it.pageItems.length; i++) walk(it.pageItems[i]); }
        else if (ty === "TextFrame") info.text++;
        else info.other++;
    }
    var i;
    for (i = 0; i < items.length; i++) walk(items[i]);
    return out;
}

// Écrit des points dans un tracé / writes points into a path
function MA_setPts(p, a) {
    var anchors = [], i;
    for (i = 0; i < a.length; i++) anchors.push([a[i][0], a[i][1]]);
    p.setEntirePath(anchors);
    for (i = 0; i < a.length; i++) {
        var q = p.pathPoints[i], lx = a[i][2] - a[i][0], ly = a[i][3] - a[i][1], rx = a[i][4] - a[i][0], ry = a[i][5] - a[i][1];
        var smooth = false, ll = Math.sqrt(lx * lx + ly * ly), lr = Math.sqrt(rx * rx + ry * ry);
        if (ll > 1e-6 && lr > 1e-6 && Math.abs(lx * ry - ly * rx) / (ll * lr) < 1e-4 && lx * rx + ly * ry < 0) smooth = true;
        try { q.pointType = smooth ? PointType.SMOOTH : PointType.CORNER; } catch (e) {}
        q.leftDirection = [a[i][2], a[i][3]];
        q.rightDirection = [a[i][4], a[i][5]];
    }
}

/*
 * Remplace un contour par ses morceaux. / Replaces a contour with its pieces.
 * Tracé transparent : morceaux ajoutés dans le même tracé transparent (même style).
 * Tracé simple : groupe de doubles du tracé (apparence conservée).
 * Compound path: pieces added inside the same compound (same style).
 * Simple path: group of duplicates of the path (appearance kept).
 */
function MA_cutContour(c, pcs) {
    var i;
    if (!pcs.length) return 0;
    if (c.compound) {
        for (i = 0; i < pcs.length; i++) {
            var np = c.compound.pathItems.add();
            MA_setPts(np, MA_CORE.chainToPts(pcs[i]));
            np.closed = false;
        }
        c.path.remove();
        return pcs.length;
    }
    var grp = c.path.parent.groupItems.add();
    grp.move(c.path, ElementPlacement.PLACEBEFORE);
    try { grp.name = c.path.name ? c.path.name + " – " + MA_T.grpName : MA_T.grpName; } catch (e) {}
    for (i = 0; i < pcs.length; i++) {
        var d = c.path.duplicate(grp, ElementPlacement.PLACEATEND);
        MA_setPts(d, MA_CORE.chainToPts(pcs[i]));
        d.closed = false;
    }
    c.path.remove();
    return pcs.length;
}

function MA_nextNumber(doc) {
    var i, n = 0;
    for (i = 0; i < doc.layers.length; i++) {
        var nm = doc.layers[i].name, p = nm.lastIndexOf("#");
        if (p > 0 && (nm.indexOf(MA_T.layMark) === 0 || nm.indexOf(MA_T.layOrig) === 0 || nm.indexOf(MA_T.layCheck) === 0)) {
            var v = parseInt(nm.substring(p + 1), 10); if (v > n) n = v;
        }
    }
    return n + 1;
}

function MA_markerLayers(doc, withCheck) {
    var out = [], i;
    for (i = 0; i < doc.layers.length; i++) {
        var nm = doc.layers[i].name;
        if (nm.indexOf(MA_T.layMark) === 0 || (withCheck && nm.indexOf(MA_T.layCheck) === 0)) out.push(doc.layers[i]);
    }
    return out;
}

// Repères ronds sur calque non imprimable / round markers on a non-printing layer
function MA_drawMarkers(doc, contours, pl, opt, layName) {
    var L = doc.layers.add(); L.name = (layName || MA_T.layMark) + " #" + MA_nextNumber(doc); L.printable = false;
    var mag = MA_color(doc, 255, 0, 200, 0, 100, 0, 0), ora = MA_color(doc, 255, 140, 0, 0, 50, 100, 0);
    var D = Math.max(opt.gap * 2.5, 2 * MA_MM), i, j, n = 0;
    for (i = 0; i < pl.items.length; i++) {
        var it = pl.items[i];
        for (j = 0; j < it.tabs.length; j++) {
            var p = MA_CORE.pointAt(it.tb, it.tabs[j]);
            var e = L.pathItems.ellipse(p[1] + D / 2, p[0] - D / 2, D, D);
            var bad = it.turn && it.turn[j] > 25;
            e.filled = true; e.fillColor = bad ? ora : mag; e.stroked = false; e.opacity = 70;
            e.name = MA_T.tabName + " " + (++n); e.note = MA_NOTE_MARK;
        }
    }
    return L;
}

function MA_report(pl, info, opt) {
    var T = MA_T, lines = [];
    lines.push(MA_fill(T.rep, { c: pl.items.length, p: pl.parts, h: pl.holes, o: pl.opens, k: pl.cut, t: pl.tabs, w: MA_num(opt.width, 2) }));
    if (pl.short) lines.push(MA_fill(T.repShort, { n: pl.short }));
    if (pl.filtered) lines.push(MA_fill(T.repFilt, { n: pl.filtered }));
    if (pl.bad) lines.push(MA_fill(T.repBad, { n: pl.bad }));
    if (info.text) lines.push(MA_fill(T.ignText, { n: info.text }));
    if (info.other) lines.push(MA_fill(T.ignOther, { n: info.other }));
    return lines.join("\n");
}

function MA_keepOriginal(doc, items) {
    var L = doc.layers.add(), i;
    L.name = MA_T.layOrig + " #" + MA_nextNumber(doc);
    for (i = 0; i < items.length; i++) { try { items[i].duplicate(L, ElementPlacement.PLACEATEND); } catch (e) {} }
    L.visible = false; L.locked = true;
    return L;
}

function MA_apply(doc, contours, pl) {
    var i, k = 0, t = 0;
    for (i = 0; i < pl.items.length; i++) {
        var it = pl.items[i];
        if (!it.pieces || !it.pieces.length) continue;
        MA_cutContour(contours[it.idx], it.pieces);
        k++; t += it.tabs.length;
    }
    return { k: k, t: t };
}

// Centres des repères posés / centres of placed markers
function MA_readMarkers(doc) {
    var lays = MA_markerLayers(doc), out = [], refs = [], i, j;
    for (i = 0; i < lays.length; i++) {
        var L = lays[i];
        try { L.locked = false; } catch (e0) {}
        for (j = 0; j < L.pageItems.length; j++) {
            var it = L.pageItems[j], b = it.geometricBounds;
            out.push([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]); refs.push(it);
        }
    }
    return { pts: out, refs: refs, layers: lays };
}

function MA_run(doc, items, cfg) {
    var T = MA_T, opt = MA_opts(cfg), info = { text: 0, other: 0 };
    var contours = MA_collect(items, info);
    if (!contours.length) return T.nothing + (info.text ? "\n" + MA_fill(T.ignText, { n: info.text }) : "");
    var raw = [], i;
    for (i = 0; i < contours.length; i++) raw.push({ pts: contours[i].pts, closed: contours[i].closed, box: contours[i].box });

    if (cfg.action !== "analyse" && opt.act === "fromMarks") {
        var mk = MA_readMarkers(doc);
        if (!mk.pts.length) return T.noMarks;
        var tol = Math.max(opt.gap * 2.5, 2 * MA_MM) * 1.5 + 1 * MA_MM;
        var pm = MA_CORE.planMarkers(raw, mk.pts, opt, tol);
        var kept = opt.keep ? MA_keepOriginal(doc, items) : null;
        var r = MA_apply(doc, contours, pm), txt = MA_fill(T.done, { k: r.k, t: r.t });
        // Repères utilisés supprimés / used markers removed
        var un = {}, j;
        for (j = 0; j < pm.unmatched.length; j++) un["m" + pm.unmatched[j]] = true;
        for (j = mk.refs.length - 1; j >= 0; j--) if (!un["m" + j]) { try { mk.refs[j].remove(); } catch (e1) {} }
        for (j = 0; j < mk.layers.length; j++) { try { if (mk.layers[j].pageItems.length === 0) mk.layers[j].remove(); } catch (e2) {} }
        if (pm.unmatched.length) txt += "\n" + MA_fill(T.unmatched, { n: pm.unmatched.length });
        if (pm.merged) txt += "\n" + MA_fill(T.merged, { n: pm.merged });
        if (kept) txt += "\n" + MA_fill(T.origKept, { l: kept.name });
        return txt + "\n\n" + T.undo;
    }

    var pl = MA_CORE.plan(raw, opt), rep = MA_report(pl, info, opt);
    if (cfg.action === "analyse") return T.analyseTitle + "\n\n" + rep;
    if (opt.act === "mark") {
        var ml = MA_drawMarkers(doc, contours, pl, opt);
        return rep + "\n\n" + MA_fill(T.marked, { t: pl.tabs, l: ml.name });
    }
    if (!pl.tabs) return rep;
    var kp = opt.keep ? MA_keepOriginal(doc, items) : null;
    var rr = MA_apply(doc, contours, pl), out = rep + "\n\n" + MA_fill(T.done, { k: rr.k, t: rr.t });
    if (pl.bad) {
        // Repères orange des attaches à vérifier / orange markers for tabs to check
        var chk = [], q, z;
        for (q = 0; q < pl.items.length; q++) {
            var itq = pl.items[q], tbq = [], tuq = [];
            for (z = 0; z < itq.tabs.length; z++) if (itq.turn && itq.turn[z] > 25) { tbq.push(itq.tabs[z]); tuq.push(itq.turn[z]); }
            chk.push({ tb: itq.tb, tabs: tbq, turn: tuq });
        }
        var cl = MA_drawMarkers(doc, contours, { items: chk }, opt, T.layCheck);
        out += "\n" + MA_fill(T.checkLay, { l: cl.name });
    }
    if (kp) out += "\n" + MA_fill(T.origKept, { l: kp.name });
    return out + "\n\n" + T.undo;
}

function MA_clearMarkers(doc) {
    var lays = MA_markerLayers(doc, true), i, n = 0;
    for (i = lays.length - 1; i >= 0; i--) { try { lays[i].locked = false; lays[i].remove(); n++; } catch (e) {} }
    return MA_fill(MA_T.cleared, { n: n });
}

function MA_main() {
    var T = MA_T;
    if (app.documents.length === 0) { alert(T.noDoc); return; }
    var doc = app.activeDocument, cfg = MA_loadCfg(), items = [], i;
    var sel = doc.selection;
    if (sel && sel.length) for (i = 0; i < sel.length; i++) items.push(sel[i]);
    while (true) {
        var r = MA_dialog(cfg);
        if (!r) return;
        cfg = r; MA_saveCfg(cfg);
        if (r.action === "clear") { alert(MA_clearMarkers(doc)); continue; }
        if (!items.length) { alert(T.noSel); return; }
        if (r.action === "analyse") { alert(MA_run(doc, items, cfg)); continue; }
        var msg = MA_run(doc, items, cfg);
        alert(msg);
        return;
    }
}

if (typeof app !== "undefined" && typeof MA_NO_MAIN === "undefined") {
    try { MA_main(); } catch (err) { alert((MA_FR ? "Erreur : " : "Error: ") + err + (err.line ? " (ligne " + err.line + ")" : "")); }
}
