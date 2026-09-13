# Vremeplov — sistem izrade aplikacije

Ovaj dokument opisuje **kako je napravljena aplikacija Vremeplov**: koje odluke stoje
iza izgleda, ponašanja i rada sa podacima, i kako su izvedene u kodu.

Pisan je tako da se iste odluke mogu preneti na **drugu aplikaciju** — na primer na
aplikaciju za praćenje reume — a da rezultat izgleda i ponaša se kao deo iste porodice.
Poglavlja 2–7 su opšta i prenose se doslovno. Poglavlje 8 objašnjava šta se menja kad
se sadržaj promeni sa vremenske prognoze na zdravstveni dnevnik.

> Sve što piše ovde je izvučeno iz stvarnog, radnog koda ove aplikacije, ne iz opšte
> teorije. Isečci se mogu kopirati i raditi bez izmena.

---

## 1. Načelo koje drži sve ostalo

**Prikaži samo onoliko koliko podatak stvarno nosi.**

Vremeplov ne crta ikonicu sunca za 14. dan, jer na toj udaljenosti nijedan model ne zna
kakav će dan biti. Umesto toga prikazuje raspon i koliko se modeli međusobno razilaze.

Isto pravilo se prenosi na svaku drugu aplikaciju: ako podatak nije pouzdan, to mora da
se **vidi u prikazu**, a ne da se krije iza lepog broja. To je jedina stvar iz ovog
dokumenta koja nije stvar ukusa.

---

## 2. Boje

Podloga je **neutralna i prati podešavanje telefona** — tamna kad je telefon u tamnom
režimu, svetla kad je u svetlom. To je ono što aplikacije rade, i zato deluje kao
aplikacija, a ne kao sajt sa svojom temom.

### Pravilo koje se ne krši

**Hrom i podaci su odvojeni.**

- **Hrom** (podloga, akcenat, ivice) sme da se menja prema stanju — u Vremeplovu se ton
  podloge menja prema vremenu napolju.
- **Boje podataka su fiksne.** Ako „hladno" jednog dana bude plavo a drugog zeleno,
  grafika laže. Nikad.

### Tokeni

```css
:root{
  color-scheme:light dark;

  --ground:#0F1113;        /* podloga cele strane */
  --surface:#17191C;       /* kartica */
  --surface-2:#1E2125;     /* podignuta površina, meniji */
  --line:rgba(255,255,255,.10);
  --line-strong:rgba(255,255,255,.18);

  --text:#F2F2F0;
  --muted:#A3A7AC;
  --dim:#767B82;
  --accent:#E0A64B;        /* samo hrom, nikad podatak */

  --c-cold:#2E9E8F;        /* hladno / niska vrednost */
  --c-warm:#D4623A;        /* toplo / visoka vrednost */
  --c-rain:#5A6FD6;        /* druga veličina */
  --c-wind:#CE9A3C;        /* treća veličina */

  --s-good:#0ca30c;        /* status — uvek uz oblik ili tekst */
  --s-warn:#fab219;
  --s-serious:#ec835a;
  --s-critical:#d03b3b;

  --radius:18px;
  --radius-sm:12px;
}

@media (prefers-color-scheme:light){
  :root{
    --ground:#F1F1EF;  --surface:#FFFFFF;  --surface-2:#FAFAF8;
    --line:rgba(17,19,21,.11);  --line-strong:rgba(17,19,21,.2);
    --text:#131518;  --muted:#585E66;  --dim:#848A92;  --accent:#9A6A16;

    /* iste veličine, potamnjene da se vide na beloj podlozi */
    --c-cold:#03897C;  --c-warm:#BF4A2C;  --c-rain:#3D4FC7;  --c-wind:#9A6A16;
  }
}
```

**Ono što je obojeno mora da se proveri u oba režima.** Zelena oznaka koja lepo stoji na
tamnoj podlozi na beloj postaje nečitka; isto važi za logotip u beloj boji. Svaka takva
stavka dobija svoju vrednost u svetlom bloku, a dvobojni logotip ide kroz `<picture>`:

```html
<picture>
  <source srcset="logo-belo.png" media="(prefers-color-scheme: dark)">
  <img src="logo-tamno.png" alt="Sidekick">
</picture>
```

### Provereno, ne procenjeno

Boje podataka su prošle proveru razdvojivosti na tačnoj podlozi aplikacije, uključujući
simulaciju daltonizma. Kada menjaš paletu, **proveri je**, ne procenjuj okom.

Pravila koja su iz te provere ispala kao obavezna:

- boja nikad nije jedini nosilac značenja — uvek ide uz oblik, broj ili reč
- dve veličine u istoj grafici moraju da se razlikuju i po obliku (puna / isprekidana linija)
- statusne boje se ne koriste kao „boja serije"

---

## 3. Tipografija

**Sistemski font, bez ijednog fonta sa mreže.**

```css
body{
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,"Segoe UI",Roboto,sans-serif;
  font-size:15px;line-height:1.55;
}

/* Brojevi koji stoje u kolonama moraju da budu iste širine */
.tabular{font-variant-numeric:tabular-nums}

/* Velika vrednost: tanko i zbijeno, bez ukrasa */
.temp{font-weight:250;font-size:clamp(76px,12.5vw,136px);letter-spacing:-.055em;
      font-variant-numeric:tabular-nums}
```

Na iPhone-u to znači **SF Pro** — isti font kojim su ispisane sistemske aplikacije. Zato
aplikacija deluje kao deo telefona, a ne kao stranica sa svojim ukusom. Uz to nema
čekanja da se font skine, nema bljeska pogrešnim fontom i nema zavisnosti od tuđeg
servera.

Dekorativni font (serif, display) na ovako sitnom tekstu izgleda kićasto i usporava
čitanje brojeva — ne koristi se.

---

## 4. Ponašanje kao aplikacija, ne kao stranica

Ovo je deo koji najviše utiče na utisak „ovo je prava aplikacija". Bez njega, ma koliko
lepa bila, ostaje sajt.

### Obavezni CSS

```css
/* Bez dugog pritiska sa menijem, bez plavog označavanja teksta prevlačenjem,
   bez sivog bljeska pri dodiru, bez zuma na dupli tap, bez klaćenja strane. */
html{overflow-x:hidden;overscroll-behavior:none}
body{
  width:100%;max-width:100%;
  -webkit-user-select:none;
  user-select:none;
  -webkit-touch-callout:none;
  -webkit-tap-highlight-color:transparent;
  overflow-x:hidden;
  overscroll-behavior:none;            /* bez odskakanja u oba pravca */
  touch-action:pan-y pinch-zoom;       /* prst pomera stranu samo gore-dole */
}

/* Vodoravno se pomeraju samo elementi koji to zaista treba */
.chart__scroll,.astro__table{touch-action:pan-x}

/* Polja za unos moraju da ostanu normalna */
input,textarea,[contenteditable]{-webkit-user-select:text;user-select:text}

/* Bez čekanja 300ms i bez zuma na dupli tap */
button,a,select,label,[role="button"]{touch-action:manipulation}

/* Atribut hidden mora da nadjača display iz komponenti */
[hidden]{display:none!important}
```

### Bezbedne zone (zarez i donja crta na iPhone-u)

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

```css
:root{
  --safe-top:env(safe-area-inset-top,0px);
  --safe-bottom:env(safe-area-inset-bottom,0px);
  --safe-left:env(safe-area-inset-left,0px);
  --safe-right:env(safe-area-inset-right,0px);
  --gutter:clamp(16px,4vw,32px);
}

.topbar{
  padding:calc(var(--safe-top) + 12px) calc(var(--gutter) + var(--safe-right))
          12px calc(var(--gutter) + var(--safe-left));
}
.page{ padding-bottom:calc(32px + var(--safe-bottom)); }
```

### Mete za dodir

Ništa na šta se dodiruje ne sme biti niže od **40 px** (Apple preporučuje 44). Proveri
merenjem, ne okom:

```js
[...document.querySelectorAll('button,select,input,a')]
  .map(n => Math.round(n.getBoundingClientRect().height))
  .filter(h => h > 0 && h < 40);        // mora da bude prazan niz
```

### Povuci nadole za osvežavanje

```js
function initPullToRefresh(onRefresh) {
  const indicator = document.getElementById('ptr');
  const THRESHOLD = 72;
  let startY = null, distance = 0, active = false;

  document.addEventListener('touchstart', (e) => {
    if (window.scrollY > 0 || e.touches.length !== 1) { startY = null; return; }
    startY = e.touches[0].clientY; distance = 0;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (startY === null || active) return;
    distance = e.touches[0].clientY - startY;
    if (distance <= 0 || window.scrollY > 0) return;
    if (e.target.closest('.chart__scroll')) return;   // vodoravne liste zadržavaju svoje
    if (distance > 8) e.preventDefault();
    indicator.dataset.state = distance >= THRESHOLD ? 'ready' : 'pulling';
  }, { passive: false });                              // passive:false je obavezno

  document.addEventListener('touchend', async () => {
    if (startY === null || active) return;
    const pulled = distance; startY = null;
    if (pulled < THRESHOLD) { indicator.dataset.state = 'done'; return; }
    active = true;
    indicator.dataset.state = 'refreshing';
    await onRefresh();
    indicator.dataset.state = 'done';
    setTimeout(() => { active = false; }, 300);
  }, { passive: true });
}
```

---

## 5. Instalacija na telefon

### manifest.webmanifest

```json
{
  "name": "Vremeplov — vremenska prognoza",
  "short_name": "Vremeplov",
  "lang": "sr",
  "start_url": "./?source=pwa",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#16211C",
  "theme_color": "#16211C",
  "icons": [
    { "src": "assets/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "assets/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

`start_url` i `scope` moraju biti **relativni** (`./`) da bi aplikacija radila i kad
stoji u podfolderu (GitHub Pages: `korisnik.github.io/ime-repozitorijuma/`).

### Meta oznake za iOS

```html
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#16211C">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Vremeplov">
<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">

<!-- splash: bez ovoga iOS pokazuje prazan ekran pri pokretanju -->
<link rel="apple-touch-startup-image"
      media="(device-width:390px) and (device-height:844px) and (-webkit-device-pixel-ratio:3) and (orientation:portrait)"
      href="assets/splash/splash-1170x2532.png">
```

Veličine splash slika za iPhone (portret, @3x):

| Model | Piksela |
|---|---|
| 13 / 13 Pro / 14 | 1170×2532 |
| 13 mini | 1080×2340 |
| 13 Pro Max / 14 Plus | 1284×2778 |
| 14 Pro / 15 / 16 | 1179×2556 |
| 14 Pro Max / 15 Plus | 1290×2796 |

### Service worker — tri strategije, jedna po vrsti sadržaja

```js
const VERSION = 'v5';
const SHELL = `ljuska-${VERSION}`, DATA = `podaci-${VERSION}`, FONTS = `fontovi-${VERSION}`;

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // 1) Podaci: mreža prvo, keš kao rezerva — nikad stari podatak kad ima novog
  if (url.hostname.endsWith('open-meteo.com')) {
    event.respondWith(fetch(request)
      .then((res) => { const c = res.clone(); caches.open(DATA).then(k => k.put(request, c)); return res; })
      .catch(() => caches.match(request)));
    return;
  }

  // 2) Fontovi: keš prvo — da izgled ostane isti i bez mreže
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(caches.match(request).then(c => c || fetch(request).then((res) => {
      const copy = res.clone(); caches.open(FONTS).then(k => k.put(request, copy)); return res;
    })));
    return;
  }

  // 3) Ljuska: keš prvo, uz tiho osvežavanje u pozadini
  if (url.origin === location.origin) {
    event.respondWith(caches.match(request).then((cached) => {
      const network = fetch(request).then((res) => {
        const copy = res.clone(); caches.open(SHELL).then(k => k.put(request, copy)); return res;
      }).catch(() => cached);
      return cached || network;
    }));
  }
});
```

Pri svakoj izmeni **podigni `VERSION`** — inače korisnik i dalje gleda staru verziju.

### Savet za instalaciju — samo tamo gde ima smisla

```js
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
if (iOS && !isStandalone() && localStorage.getItem('savet') !== 'da') {
  setTimeout(() => { document.getElementById('install').hidden = false; }, 4000);
}
```

---

## 6. Komponente

Osnovni gradivni elementi. Svi rade na ravnim površinama — **bez stakla, blura i sjaja**.

### Kartica

```css
.card{
  border:1px solid var(--line);
  border-radius:var(--radius);
  background:var(--surface);
}
```

### Pločica sa vrednošću

```html
<article class="card tile">
  <p class="tile__label">Vetar</p>
  <p class="tile__value">23<small>km/h</small></p>
  <p class="tile__extra">4 Bft · JI</p>
</article>
```

```css
.tile{padding:14px 15px;display:flex;flex-direction:column;justify-content:center;gap:3px;min-height:98px}
.tile__label{color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.07em}
.tile__value{font-family:"Fraunces",Georgia,serif;font-weight:500;font-size:clamp(23px,2.8vw,28px);
             line-height:1.15;font-variant-numeric:tabular-nums}
.tile__value small{font-size:.44em;color:var(--muted);margin-left:4px;font-family:"Inter",sans-serif}
.tile__extra{color:var(--muted);font-size:12.5px}
```

### Red sa podacima (lista dana, lista unosa)

Mreža sa fiksnim kolonama na širokom ekranu, presložena na uskom:

```css
.day{display:grid;align-items:center;gap:12px;padding:12px 4px;border-bottom:1px solid var(--line);
     grid-template-columns:minmax(96px,1.1fr) 30px 62px 96px 62px minmax(110px,1.6fr) 88px 30px}

@media (max-width:640px){
  .day{grid-template-columns:minmax(74px,1fr) 26px 50px auto 26px;row-gap:4px}
  .day__range{grid-column:4/6;order:9}
}
```

### Traka raspona

Pokazuje gde se jedna vrednost nalazi u odnosu na ceo period:

```css
.range{position:relative;display:block;height:5px;border-radius:99px;background:rgba(236,231,221,.09)}
.range i{position:absolute;top:0;height:100%;border-radius:99px;
         background:linear-gradient(90deg,var(--c-cold),var(--c-warm))}
```

```js
const left = ((min - lo) / (hi - lo)) * 100;
const right = ((hi - max) / (hi - lo)) * 100;
`<span class="range"><i style="left:${left}%;right:${right}%"></i></span>`
```

### Mera u tri segmenta (pouzdanost, jačina, nivo)

Oblik nosi značenje, boja ga samo pojačava — radi i za daltoniste i u crno-belom:

```css
.conf{display:inline-flex;align-items:flex-end;gap:2px;height:14px}
.conf i{width:3px;border-radius:2px;background:rgba(236,231,221,.18)}
.conf i:nth-child(1){height:6px}
.conf i:nth-child(2){height:10px}
.conf i:nth-child(3){height:14px}
.conf--3 i.on{background:var(--s-good)}
.conf--2 i.on{background:var(--s-warn)}
.conf--1 i.on{background:var(--s-serious)}
```

### Oznaka (badge) i pilula

```css
.badge{font-size:11px;letter-spacing:.05em;text-transform:uppercase;padding:4px 9px;border-radius:6px;
       border:1px solid var(--line-strong);color:var(--muted);white-space:nowrap}
```

### Traka stanja podataka

Stalno vidljiva, govori koliko su podaci stari:

```css
.live{display:flex;align-items:center;gap:8px;color:var(--dim);font-size:12px}
.live__dot{width:7px;height:7px;border-radius:50%;background:var(--s-good)}
.live[data-state="live"] .live__dot{animation:pulse 2.4s ease-in-out infinite}
.live[data-state="stale"] .live__dot{background:var(--s-warn)}
.live[data-state="offline"] .live__dot{background:var(--s-critical);animation:none}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.82)}}
```

---

## 7. Podaci

### Ništa prazno, ništa izmišljeno

Pravilo: **osnovni podatak mora da uspe; sve ostalo su dodaci koji smeju da izostanu.**

```js
const [osnovno, dodatak1, dodatak2] = await Promise.all([
  obavezno(),                       // ako ovo padne — poruka korisniku
  opciono1().catch(() => null),     // ako ovo padne — sekcija se sakrije
  opciono2().catch(() => null)
]);
```

Kad dodatak izostane, sekcija se **sakriva**, ne prikazuje prazna polja ni crtice.

### Poslednje stanje se pamti

Aplikacija se nikad ne otvara prazna:

```js
function saveSnapshot(state) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...state, fetchedAt: Date.now() })); } catch {}
}

function hydrateFromSnapshot() {
  const s = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (!s || Date.now() - s.fetchedAt > 12 * 60 * 60 * 1000) return false;
  render(s);                         // iscrtaj odmah
  return true;                       // pa tek onda kreni po sveže
}
```

### Ritam osvežavanja

```js
const REFRESH = {
  light: 3 * 60 * 1000,     // često i jeftino: samo ono što se menja iz minuta u minut
  full: 15 * 60 * 1000,     // sve ostalo
  stale: 6 * 60 * 1000,     // posle ovoga podaci više nisu „uživo"
  old: 30 * 60 * 1000       // posle ovoga se traži potpuno ponovno učitavanje
};
```

Uz to: osvežavanje pri **povratku u aplikaciju** (`visibilitychange`) i pri **povratku
mreže** (`online`), i poruka „Van mreže — podaci od HH:MM" kad veze nema.

---

## 8. Kako ovo preneti na aplikaciju za reumu

Sve iz poglavlja 2–7 se preuzima **nepromenjeno**: paleta, tipografija, ponašanje kao
aplikacija, instalacija, service worker, komponente. Menja se samo ono što aplikacija
prikazuje.

### Mapiranje sekcija

| Vremeplov | Aplikacija za reumu |
|---|---|
| **Sada** — velika temperatura | **Danas** — današnji unos bola (0–10) kao velika vrednost, uz ono što je pacijent zabeležio |
| **4 pločice** — vetar, udari, padavine, vlažnost | **4 pločice** — pritisak i njegova promena, vlažnost, temperatura, kvalitet sna |
| **Vetar** — glavna celina sa kompasom | **Okidači** — koji vremenski činilac je danas najizraženiji; ista vizuelna težina |
| **Narednih 48 h** — grafika po satima | **Naredna 2 dana** — kretanje pritiska i vlažnosti, sa označenim naglim padom |
| **Dan po dan** — 10 redova | **Dnevnik** — po jedan red za svaki dan: unos bola, lekovi, vreme tog dana |
| **Trend** — dalje od 10 dana | **Trend** — nedeljni i mesečni prosek bola, bez dnevnog raspoređivanja |
| **Sunce i Mesec** | **Ritam dana** — podsetnik za lekove, jutarnja ukočenost, san |
| **Oznaka pouzdanosti** | **Oznaka jačine veze** — koliko je veza između vremena i bola izražena kod tog pacijenta |

### Podaci koje treba povući

Isti izvor (Open-Meteo, bez ključa i registracije) daje sve što je za reumu relevantno:

```
https://api.open-meteo.com/v1/forecast
  ?latitude=..&longitude=..&timezone=auto
  &current=pressure_msl,surface_pressure,relative_humidity_2m,temperature_2m,apparent_temperature,wind_speed_10m
  &hourly=pressure_msl,relative_humidity_2m,temperature_2m,apparent_temperature
  &daily=temperature_2m_max,temperature_2m_min,precipitation_sum
```

Ono što se iz toga računa:

- **Promena pritiska u 24 h** — najčešće pominjan okidač; pad veći od 5 hPa označiti
- **Vlažnost iznad 70 %** uz temperaturu ispod 15 °C
- **Nagla promena temperature** između dva dana

Za istoriju (poređenje unosa sa vremenom unazad) postoji arhiva istog servisa:
`https://archive-api.open-meteo.com/v1/archive`.

### Šta se dodaje, a čega u Vremeplovu nema

1. **Unos** — klizač 0–10 za bol, dugmad za zahvaćene zglobove, polje za lekove.
   Klizač mora biti visok bar 44 px i raditi prstom bez preciznog pogađanja.
2. **Čuvanje** — `localStorage` za mali dnevnik, `IndexedDB` ako ide preko godinu dana.
   Bez servera nema ni pitanja o tuđim podacima.
3. **Izvoz** — dugme koje pravi `.csv` ili `.json` za lekara.
4. **Podsetnik** — ako treba obaveštenje za lek, to na iPhone-u traži web push i mali
   server; bez toga podsetnik radi samo dok je aplikacija otvorena.

### Jedna obavezna ograda

Aplikacija beleži i prikazuje, **ne postavlja dijagnozu i ne savetuje terapiju**. Veza
između vremena i bola razlikuje se od osobe do osobe i nije dokazana kao pravilo. Zato:

- nikad ne pisati „danas će vas boleti", nego „danas su prisutni uslovi koje ste ranije
  označavali kao teže"
- korelaciju prikazivati tek kad postoji dovoljno unosa (bar 20–30 dana), i označiti je
  kao slabu kad je slaba — isto merilo u tri segmenta kao za pouzdanost prognoze
- u podnožju, jednom rečenicom: da je reč o ličnom dnevniku, a ne o medicinskom uređaju

---

## 9. Kontrolna lista pre objave

**Izgled**
- [ ] boje podataka su fiksne i ne menjaju se sa stanjem aplikacije
- [ ] nijedno značenje ne počiva samo na boji
- [ ] brojevi u kolonama su `tabular-nums`
- [ ] nema stakla, blura, sjaja ni ljubičastih gradijenata

**Ponašanje**
- [ ] nema označavanja teksta prevlačenjem ni menija na dugi pritisak
- [ ] nema zuma na dupli tap, nema sivog bljeska pri dodiru
- [ ] nijedna meta za dodir nije niža od 40 px
- [ ] stranica se ne preliva vodoravno na 390 px širine
- [ ] prst ne pomera stranu levo-desno (`touch-action:pan-y pinch-zoom`)
- [ ] proveren izgled u svetlom **i** tamnom režimu telefona
- [ ] bezbedne zone poštovane gore i dole

**Instalacija**
- [ ] manifest sa relativnim `start_url` i `scope`
- [ ] ikonice 192, 512, maskable i apple-touch
- [ ] splash slike za bar tri veličine iPhone-a
- [ ] service worker sa podignutom verzijom
- [ ] `.nojekyll` ako ide na GitHub Pages

**Podaci**
- [ ] aplikacija se otvara sa poslednjim zapamćenim stanjem
- [ ] radi bez mreže i to jasno kaže
- [ ] kad dodatni podatak izostane, sekcija se sakriva
- [ ] nigde nema izmišljene preciznosti

---

## 10. Objavljivanje

Statična aplikacija, bez build koraka. Za instalaciju na telefon potreban je **HTTPS**.

**GitHub Pages:** *Settings → Pages → Source: Deploy from a branch → `main` / (root) → Save.*
Adresa je `https://korisnik.github.io/ime-repozitorijuma/`. Zbog podfoldera sve putanje
u kodu moraju biti relativne.

**Instalacija na iPhone:** otvoriti adresu u **Safariju** → *Podeli* → *Add to Home Screen*.
Prvo otvaranje ostaviti desetak sekundi na mreži, da se keširaju fajlovi.

---

*Dokument opisuje aplikaciju Vremeplov. Sve osim poglavlja 8 prenosi se na druge
aplikacije bez izmene.*
