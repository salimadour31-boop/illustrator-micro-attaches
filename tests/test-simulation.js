// Simulation de l'API Illustrator pour MicroAttaches.jsx (node). Ne remplace pas un essai réel.
// Simulated Illustrator API for MicroAttaches.jsx (node). Does not replace a real test.
var fs = require("fs"), vm = require("vm"), path = require("path");
var src = fs.readFileSync(path.join(__dirname, "..", "MicroAttaches.jsx"), "utf8");
var pass = 0, fail = 0;
function ok(n, c, e) { if (c) { pass++; console.log("ok   " + n); } else { fail++; console.log("FAIL " + n + (e !== undefined ? " -> " + JSON.stringify(e) : "")); } }
var MM = 72 / 25.4, K = 0.5522847498;

// ---------- Faux DOM / mock DOM ----------
function Coll(owner) { this.items = []; this.owner = owner; }
Object.defineProperty(Coll.prototype, "length", { get: function () { return this.items.length; } });
function proxify(c) { return new Proxy(c, { get: function (t, k) { if (typeof k === "string" && /^\d+$/.test(k)) return t.items[+k]; return t[k]; } }); }

function Base(type) { this.typename = type; this.name = ""; this.note = ""; this.locked = false; this.hidden = false; this.parent = null; this.selected = false; }
Base.prototype.remove = function () { var c = this.parent._kids, i = c.indexOf(this); if (i >= 0) c.splice(i, 1); this.removed = true; };
Base.prototype.move = function (rel, place) {
    var old = this.parent._kids, i = old.indexOf(this); if (i >= 0) old.splice(i, 1);
    if (place === "PLACEBEFORE" || place === "PLACEAFTER") { var c = rel.parent._kids, j = c.indexOf(rel); c.splice(place === "PLACEBEFORE" ? j : j + 1, 0, this); this.parent = rel.parent; }
    else { rel._kids.push(this); this.parent = rel; }
};
Object.defineProperty(Base.prototype, "layer", { get: function () { var p = this.parent; while (p && p.typename !== "Layer") p = p.parent; return p; } });

function PathItem() { Base.call(this, "PathItem"); this._pts = []; this.closed = false; this.guides = false; this.clipping = false; this.filled = false; this.stroked = true; this.strokeWidth = 0.25; this.opacity = 100; }
PathItem.prototype = Object.create(Base.prototype);
Object.defineProperty(PathItem.prototype, "pathPoints", { get: function () { var c = new Coll(this); c.items = this._pts; return proxify(c); } });
PathItem.prototype.setEntirePath = function (a) { this._pts = a.map(function (p) { return { anchor: [p[0], p[1]], leftDirection: [p[0], p[1]], rightDirection: [p[0], p[1]], pointType: "CORNER" }; }); };
Object.defineProperty(PathItem.prototype, "geometricBounds", { get: function () {
    var xs = this._pts.map(function (q) { return q.anchor[0]; }), ys = this._pts.map(function (q) { return q.anchor[1]; });
    return [Math.min.apply(null, xs), Math.max.apply(null, ys), Math.max.apply(null, xs), Math.min.apply(null, ys)]; } });
PathItem.prototype.duplicate = function (target, place) {
    var d = new PathItem(), k; for (k in this) if (this.hasOwnProperty(k) && k !== "parent") d[k] = this[k];
    d._pts = JSON.parse(JSON.stringify(this._pts)); d.parent = null;
    if (target) { if (target._kids) { target._kids.push(d); d.parent = target; } } else { var c = this.parent._kids; c.splice(c.indexOf(this) + 1, 0, d); d.parent = this.parent; }
    return d;
};

function liveColl(owner, getter, extra) {
    var c = new Coll(owner), k;
    Object.defineProperty(c, "items", { get: getter });
    for (k in extra) c[k] = extra[k];
    return proxify(c);
}
function Container(type) { Base.call(this, type); this._kids = []; var self = this;
    this.pageItems = liveColl(this, function () { return self._kids; }, {});
    this.pathItems = liveColl(this, function () { return self._kids.filter(function (x) { return x.typename === "PathItem"; }); }, {
        add: function () { var p = new PathItem(); p.parent = self; self._kids.push(p); return p; },
        ellipse: function (top, left, w, h) { var p = new PathItem(); p.parent = self; self._kids.push(p); p.closed = true;
            p.setEntirePath([[left + w / 2, top], [left + w, top - h / 2], [left + w / 2, top - h], [left, top - h / 2]]); p.ellipse = true; return p; } });
    this.groupItems = liveColl(this, function () { return self._kids.filter(function (x) { return x.typename === "GroupItem"; }); }, {
        add: function () { var g = new Container("GroupItem"); g.parent = self; self._kids.unshift(g); return g; } });
}
Container.prototype = Object.create(Base.prototype);
Container.prototype.duplicate = function (target) {
    var d = new Container(this.typename), self = this; d.name = this.name;
    this._kids.forEach(function (k) { k.duplicate(d); });
    target._kids.push(d); d.parent = target; return d;
};
function Compound() { Container.call(this, "CompoundPathItem"); }
Compound.prototype = Object.create(Container.prototype);
function Layer(doc) { Container.call(this, "Layer"); this.printable = true; this.visible = true; this.doc = doc; }
Layer.prototype = Object.create(Container.prototype);
Layer.prototype.remove = function () { var a = this.doc._layers, i = a.indexOf(this); if (i >= 0) a.splice(i, 1); this.removed = true; };

function Doc() { var self = this; this._layers = []; this.documentColorSpace = "RGB"; this.selection = [];
    this.layers = liveColl(this, function () { return self._layers; }, {
        add: function () { var L = new Layer(self); self._layers.unshift(L); return L; } });
    var L0 = this.layers.add(); L0.name = "Calque 1";
}

// Formes / shapes
function setPts(p, a, closed) { p._pts = a.map(function (q) { return { anchor: [q[0], q[1]], leftDirection: [q[2], q[3]], rightDirection: [q[4], q[5]], pointType: "SMOOTH" }; }); p.closed = closed; return p; }
function circle(cx, cy, r) { return [[cx + r, cy, cx + r, cy - K * r, cx + r, cy + K * r], [cx, cy + r, cx + K * r, cy + r, cx - K * r, cy + r], [cx - r, cy, cx - r, cy + K * r, cx - r, cy - K * r], [cx, cy - r, cx - K * r, cy - r, cx + K * r, cy - r]]; }
function rect(x, y, w, h) { return [[x, y + h], [x + w, y + h], [x + w, y], [x, y]].map(function (p) { return [p[0], p[1], p[0], p[1], p[0], p[1]]; }); }
function plen(p) { // longueur d'un faux tracé / length of a mock path
    var a = p._pts, n = a.length, s = 0, i, j, m = p.closed ? n : n - 1;
    for (i = 0; i < m; i++) { var A = a[i], B = a[(i + 1) % n], g = [A.anchor[0], A.anchor[1], A.rightDirection[0], A.rightDirection[1], B.leftDirection[0], B.leftDirection[1], B.anchor[0], B.anchor[1]], px = g[0], py = g[1];
        for (j = 1; j <= 200; j++) { var t = j / 200, u = 1 - t, x = u * u * u * g[0] + 3 * u * u * t * g[2] + 3 * u * t * t * g[4] + t * t * t * g[6], y = u * u * u * g[1] + 3 * u * u * t * g[3] + 3 * u * t * t * g[5] + t * t * t * g[7]; s += Math.hypot(x - px, y - py); px = x; py = y; } }
    return s;
}

function makeCtx(locale) {
    var alerts = [];
    var ctx = {
        Math: Math, String: String, Number: Number, Infinity: Infinity, isNaN: isNaN, parseFloat: parseFloat, parseInt: parseInt, Array: Array,
        alert: function (m) { alerts.push(String(m)); },
        app: { locale: locale, documents: { length: 0 }, activeDocument: null },
        $: { locale: locale },
        ElementPlacement: { PLACEBEFORE: "PLACEBEFORE", PLACEAFTER: "PLACEAFTER", PLACEATEND: "PLACEATEND", PLACEATBEGINNING: "PLACEATBEGINNING" },
        PointType: { SMOOTH: "SMOOTH", CORNER: "CORNER" }, DocumentColorSpace: { CMYK: "CMYK", RGB: "RGB" },
        RGBColor: function () {}, CMYKColor: function () {},
        Folder: { userData: "/tmp" },
        File: function () { this.exists = false; this.open = function () { return false; }; },
        MA_NO_MAIN: true
    };
    vm.createContext(ctx); vm.runInContext(src, ctx);
    ctx.alerts = alerts;
    return ctx;
}
function cfg(ctx, o) { var c = ctx.MA_defaults(), k; c.action = "run"; for (k in o) c[k] = o[k]; return c; }

// ---------- 1. Carré simple coupé / simple square cut ----------
var X = makeCtx("fr_FR"), doc = new Doc(), L0 = doc._layers[0];
var sq = setPts(L0.pathItems.add(), rect(0, 0, 100 * MM, 100 * MM), true); sq.name = "Pièce A"; sq.strokeWidth = 0.01;
var msg = X.MA_run(doc, [sq], cfg(X, { n: "4" }));
var grp = L0._kids.filter(function (x) { return x.typename === "GroupItem"; })[0];
ok("carré : remplacé par un groupe de 4 tracés ouverts", grp && grp._kids.length === 4 && grp._kids.every(function (p) { return !p.closed; }), msg);
ok("carré : original supprimé du calque", L0._kids.indexOf(sq) < 0);
ok("carré : apparence conservée (épaisseur 0,01)", grp && grp._kids.every(function (p) { return p.strokeWidth === 0.01; }));
var tot = grp ? grp._kids.reduce(function (a, p) { return a + plen(p); }, 0) : 0;
ok("carré : longueur coupée = 400 − 4 × 0,8 mm", Math.abs(tot - (400 - 3.2) * MM) < 0.01, tot / MM);
ok("carré : nom du groupe", grp && grp.name === "Pièce A – Micro-attaches", grp && grp.name);
var orig = doc._layers.filter(function (l) { return l.name.indexOf("Micro-attaches – original") === 0; })[0];
ok("carré : copie de l'original sur calque masqué et verrouillé", orig && !orig.visible && orig.locked && orig._kids.length === 1 && orig._kids[0].closed);
ok("carré : message en français avec nombre d'attaches", /4 attache\(s\) créée\(s\)/.test(msg), msg);
ok("carré : poignées des droites rentrées", grp && grp._kids.every(function (p) { return p._pts.every(function (q) { return q.leftDirection[0] === q.anchor[0] && q.rightDirection[1] === q.anchor[1]; }); }));

// ---------- 2. Tracé transparent « O » / compound path "O" ----------
var Y = makeCtx("en_US"), d2 = new Doc(), M0 = d2._layers[0];
var comp = new Compound(); comp.parent = M0; M0._kids.push(comp);
setPts(comp.pathItems.add(), circle(0, 0, 30 * MM), true);
setPts(comp.pathItems.add(), circle(0, 0, 18 * MM), true);
var m2 = Y.MA_run(d2, [comp], cfg(Y, { n: "2", keep: "0" }));
var closedLeft = comp._kids.filter(function (p) { return p.closed; }), openP = comp._kids.filter(function (p) { return !p.closed; });
ok("O : contour extérieur coupé en 2 dans le tracé transparent", openP.length === 2, m2);
ok("O : contre-forme (trou) laissée fermée", closedLeft.length === 1 && Math.abs(plen(closedLeft[0]) - 2 * Math.PI * 18 * MM) < 0.5);
var onC = openP.every(function (p) { return p._pts.every(function (q) { return Math.abs(Math.hypot(q.anchor[0], q.anchor[1]) - 30 * MM) < 0.05; }); });
ok("O : points des morceaux sur le cercle, avec poignées", openP.length > 0 && onC && openP.every(function (p) { return p._pts.some(function (q) { return q.rightDirection[0] !== q.anchor[0] || q.rightDirection[1] !== q.anchor[1]; }); }));
ok("O : points intérieurs lisses", openP.every(function (p) { return p._pts.slice(1, -1).every(function (q) { return q.pointType === "SMOOTH"; }); }));
ok("O : pas de copie de l'original si décoché", d2._layers.length === 1);
ok("O : message anglais", /tab\(s\) created/.test(m2), m2);

// ---------- 3. Analyse : rien ne change / analysis: nothing changes ----------
var Z = makeCtx("fr_FR"), d3 = new Doc(), N0 = d3._layers[0];
var a1 = setPts(N0.pathItems.add(), rect(0, 0, 50 * MM, 20 * MM), true);
var txt = { typename: "TextFrame", locked: false, hidden: false };
var lk = setPts(N0.pathItems.add(), rect(100, 100, 50, 50), true); lk.locked = true;
var m3 = Z.MA_run(d3, [a1, txt, lk], cfg(Z, { action: "analyse" }));
ok("analyse : document inchangé", N0._kids.length === 2 && a1.closed && a1._pts.length === 4 && d3._layers.length === 1);
ok("analyse : textes et objets verrouillés comptés", /Textes ignorés \(vectorisez-les d'abord\) : 1/.test(m3) && /Objets ignorés.*: 1/.test(m3), m3);
ok("analyse : titre « rien n'a été modifié »", m3.indexOf("rien n'a été modifié") > 0);

// ---------- 4. Repères puis coupe aux repères / markers then cut at markers ----------
var W = makeCtx("fr_FR"), d4 = new Doc(), P0 = d4._layers[0];
var b1 = setPts(P0.pathItems.add(), rect(0, 0, 100 * MM, 50 * MM), true);
var m4 = W.MA_run(d4, [b1], cfg(W, { act: "mark", n: "3" }));
var mL = d4._layers.filter(function (l) { return l.name.indexOf("Micro-attaches – repères") === 0; })[0];
ok("repères : calque non imprimable avec 3 repères", mL && !mL.printable && mL._kids.length === 3, m4);
ok("repères : tracé non modifié", b1.closed && P0._kids.indexOf(b1) >= 0);
// L'utilisateur supprime un repère et en ajoute un au milieu du côté gauche / user deletes one marker, adds one
mL._kids[2].remove();
var add = mL.pathItems.ellipse(25 * MM + 3, -3, 6, 6);
var far = mL.pathItems.ellipse(400 * MM, 400 * MM, 6, 6);
var m5 = W.MA_run(d4, [b1], cfg(W, { act: "fromMarks", keep: "0" }));
var g4 = P0._kids.filter(function (x) { return x.typename === "GroupItem"; })[0];
ok("aux repères : 3 attaches (2 gardées + 1 ajoutée)", g4 && g4._kids.length === 3, m5);
var ends = g4 ? g4._kids.map(function (p) { return p._pts[0].anchor; }).concat(g4._kids.map(function (p) { return p._pts[p._pts.length - 1].anchor; })) : [];
ok("aux repères : une coupure sur le côté gauche à mi-hauteur", ends.some(function (a) { return Math.abs(a[0]) < 1e-6 && Math.abs(a[1] - 25 * MM) < 1 * MM; }), ends);
ok("aux repères : repère lointain laissé et signalé", mL._kids.length === 1 && /laissés en place : 1/.test(m5), m5);

// ---------- 5. Effacer les repères / clear markers ----------
var m6 = W.MA_clearMarkers(d4);
ok("effacer : calque de repères supprimé", d4._layers.every(function (l) { return l.name.indexOf("Micro-attaches – repères") < 0; }) && /supprimés : 1/.test(m6), m6);

// ---------- 6. Attache à vérifier (petit cercle) / tab to check (small circle) ----------
var V = makeCtx("fr_FR"), d5 = new Doc(), Q0 = d5._layers[0];
var sm = setPts(Q0.pathItems.add(), circle(0, 0, 1.5 * MM), true);
var m7 = V.MA_run(d5, [sm], cfg(V, { n: "2", keep: "0" }));
var chk = d5._layers.filter(function (l) { return l.name.indexOf("Micro-attaches – à vérifier") === 0; })[0];
ok("petit cercle : attaches posées et repères orange sur calque « à vérifier »", chk && chk._kids.length === 2 && !chk.printable && /à vérifier/.test(m7), m7);
ok("petit cercle : ce calque n'est pas lu comme repères à couper", V.MA_markerLayers(d5).length === 0 && V.MA_markerLayers(d5, true).length === 1);

// ---------- 7. Groupe avec tracé ouvert et masque / group with open path and clipping path ----------
var U = makeCtx("fr_FR"), d6 = new Doc(), R0 = d6._layers[0];
var gg = R0.groupItems.add();
var ln = setPts(gg.pathItems.add(), [[0, 0, 0, 0, 0, 0], [100 * MM, 0, 100 * MM, 0, 100 * MM, 0]], false);
var clip = setPts(gg.pathItems.add(), rect(0, 0, 10, 10), true); clip.clipping = true;
var m8 = U.MA_run(d6, [gg], cfg(U, { open: "1", n: "2", keep: "0" }));
var sub = gg._kids.filter(function (x) { return x.typename === "GroupItem"; })[0];
ok("ligne ouverte incluse : 3 morceaux dans le groupe d'origine", sub && sub._kids.length === 3, m8);
ok("tracé de masque ignoré", gg._kids.indexOf(clip) >= 0 && clip._pts.length === 4);
var m9 = U.MA_run(d6, [], cfg(U, {}));
ok("sélection sans tracé : message « aucun tracé »", /Aucun tracé de coupe/.test(m9), m9);

// ---------- 8. MA_main : pas de document / sélection vide ----------
var S = makeCtx("fr_FR");
S.MA_main();
ok("main : alerte sans document", S.alerts[0] === "Ouvrez un document avant de lancer le script.", S.alerts);
var S2 = makeCtx("fr_FR"), d7 = new Doc();
S2.app.documents = { length: 1 }; S2.app.activeDocument = d7; d7.selection = [];
// Faux ScriptUI : clique sur OK à l'affichage / mock ScriptUI: clicks OK on show
S2.Window = function () {
    var ctrls = [];
    function ctl(type, txt, props) { var c = { type: type, text: txt === undefined ? "" : String(txt), value: false, enabled: true, characters: 0, props: props || {},
        add: function (t, b, x, p) { var k = ctl(t, x, p); if (t === "dropdownlist") { k.items = x; k.selection = { index: 0 }; } ctrls.push(k); return k; } }; return c; }
    var w = ctl("dialog", "");
    w.show = function () { var b = ctrls.filter(function (c) { return c.type === "button" && c.props.name === "ok"; })[0]; b.onClick(); };
    w.close = function () {};
    return w;
};
vm.runInContext("Window = this.Window;", S2);
S2.MA_main();
ok("main : alerte sans sélection après le dialogue", S2.alerts[0] === "Sélectionnez les tracés de coupe (tracés, tracés transparents ou groupes).", S2.alerts);

console.log("\n" + pass + " ok, " + fail + " échec(s)");
process.exit(fail ? 1 : 0);
