# Vremeplov

*Vreme koje teče i vreme napolju.* Vremenska prognoza za obalu i kopno.

Web aplikacija koja prikazuje **samo ono što na datoj udaljenosti zaista ima smisla**:
sat po sat do 48 h, dan po dan dok pouzdanost to dozvoljava, dalje isključivo trend.

Instalira se na početni ekran iPhone-a i radi i bez mreže.
Bez build koraka, bez zavisnosti, bez API ključa — čist HTML, CSS i ES moduli.

## Instalacija na iPhone

Aplikacija mora da stoji na **HTTPS** adresi da bi se instalirala. Najjednostavnije
preko GitHub Pages:

1. *Settings → Pages → Deploy from a branch* i izaberi granu (root folder)
2. sačekaj da se objavi, pa na iPhone-u otvori dobijenu adresu **u Safariju**
3. dugme **Podeli → Add to Home Screen**

Posle toga se otvara preko celog ekrana, bez Safari trake, sa svojom ikonicom,
splash ekranom pri pokretanju i osvežavanjem povlačenjem nadole — bez web navika
(dugi pritisak, selektovanje teksta, zum na dupli tap).
Sve podešeno za iPhone 13: bezbedne zone oko zareza i donje crte, mete za dodir
od najmanje 40 px, portret orijentacija, tamna statusna traka.

## Podaci u realnom vremenu

| Šta | Koliko često |
|---|---|
| trenutno stanje i padavine po 15 minuta | na svaka 3 minuta |
| cela prognoza (48 h, dani, trend, more) | na svakih 15 minuta |
| povratak u aplikaciju | odmah, ako su podaci stariji od 2 minuta |
| povratak mreže | odmah |

Traka na vrhu stalno govori u kakvom su stanju podaci: **Uživo** (osveženo pre manje
od 6 minuta), **osveženo pre X min**, ili **Van mreže — podaci od HH:MM**.
Poslednje stanje se čuva lokalno, pa se aplikacija otvara odmah, sa podacima,
i pre nego što mreža odgovori.

**Sledećih 60 minuta** je zasebna traka: padavine u koracima od 15 minuta. Merenja u
toj rezoluciji postoje za srednju Evropu i Severnu Ameriku; za ostale oblasti,
Grčku uključujući, vrednosti se izvode iz satne prognoze — i tako je i označeno
u samoj aplikaciji.

## Zašto je drugačija

Većina prognoza prikazuje 14. dan istom ikonicom i istim brojem kao sutrašnji.
Ovde je pouzdanost prvorazredni podatak:

| Udaljenost | Šta se prikazuje | Zašto |
|---|---|---|
| 0–48 h | sat po sat: temperatura, padavine, vetar, udari | modeli su na ovoj skali pouzdani |
| do 10. dana | dan po dan uz oznaku pouzdanosti | raspored se još pomera, vrednosti drže |
| preko 10. dana | samo raspon temperatura i razilaženje modela | pojedinačni dani više nisu predvidivi |

Oznaka pouzdanosti (tri segmenta uz svaki dan) spaja dva merila: udaljenost dana i
**razilaženje tri modela** — ECMWF IFS, GFS i ICON. Kada se modeli razilaze više od
4 °C, dan se automatski prikazuje kao manje pouzdan, ma koliko blizu bio.

## Šta prikazuje

**Sada** — temperatura, osećaj, stanje, rečenica o narednih 12 h (kada počinje kiša,
dokle ide vetar), vlažnost, pritisak.

**Vetar** — kompas sa kazaljkom koja stoji na strani sa koje vetar duva, brzina,
Boforov stepen sa opisom, udari, preovlađujući pravac, najjači udar u 48 h i
grafik vetra i udara sa strelicama pravca.

**More i plaža** (na obali) — temperatura mora, visina talasa i ključna stvar za
plažu: da li vetar duva **sa mora** (talasi, mutnija voda) ili **sa kopna**
(mirno more). Strana sveta u koju plaža gleda se bira i pamti.

**48 sati** — temperatura kao linija i verovatnoća padavina kao trake, sa detaljima
na prelazak mišem.

**Dan po dan** — ikonica, verovatnoća i količina padavina, vetar i udari, UV, raspon
temperatura u odnosu na ceo period i oznaka pouzdanosti.

**Sunce i Mesec** — izlazak, zalazak, dužina dana, zlatni sat, podnevna visina Sunca
i procena UV po vedrom, faza i osvetljenost Meseca, izlazak i zalazak Meseca, plus
pregled za sedam dana. Ovo se **računa lokalno** (NOAA / Meeus) i ne zavisi od mreže.

## Izgled

Neutralna podloga koja **prati podešavanje telefona** — tamna u tamnom režimu, svetla u
svetlom. Sistemski font (na iPhone-u SF Pro), bez ijednog fonta sa mreže. Bez stakla,
blura i sjaja — ravne površine i tanke linije.

Boje podataka su **fiksne**: hladno `#2E9E8F`, toplo `#D4623A`, padavine `#5A6FD6`,
vetar `#CE9A3C` — sa potamnjenim vrednostima za svetli režim. Proverene su validatorom
na obe podloge; razdvojive su i pri daltonizmu.

## Pokretanje

Statična aplikacija, ali koristi ES module — potreban je lokalni server
(`file://` neće raditi):

```bash
python3 -m http.server 8000
# http://localhost:8000
```

Objavljivanje: bilo koji statični hosting, na primer GitHub Pages
(*Settings → Pages → Deploy from a branch*, root).

## Struktura

```
index.html                    struktura stranice i SVG ikonice
assets/css/style.css          stilovi; boje podataka su fiksne, hrom prati vreme
assets/js/app.js              orkestracija i prikaz
assets/js/api.js              Open-Meteo pozivi, uključujući poređenje modela
assets/js/charts.js           SVG grafike (48 h, vetar, kompas, trake raspona)
assets/js/astro.js            Sunce i Mesec — lokalni proračun
assets/js/format.js           jedinice, Bofor, ruža vetrova, pravila pouzdanosti
assets/js/weather-codes.js    WMO kodovi → opis, ikonica, tema
sw.js                         rad bez mreže: ljuska iz keša, podaci mreža-prvo
manifest.webmanifest          instalacija na početni ekran
assets/icons/                 ikonice aplikacije (192, 512, maskable, apple-touch)
```

## Ponašanje kada podatak nedostaje

Osnovna prognoza mora da uspe; sve ostalo su dodaci koji smeju da izostanu:

- **nema podataka o moru** (lokacija u unutrašnjosti) → sekcija „More i plaža" se sakriva
- **poređenje modela ne uspe** → pouzdanost se računa samo po udaljenosti dana,
  uz jasnu poruku korisniku
- **prognoza ne uspe** → zadržava se poslednje prikazano stanje uz oznaku starosti
- **nema mreže** → aplikacija se otvara iz keša, sa jasnim „Van mreže — podaci od HH:MM"

Nikada se ne prikazuje prazna vrednost ni izmišljena preciznost.

## Šta je provereno

Aplikacija je testirana u browseru (Chromium, profil iPhone 13) protiv pravog HTTP
servisa koji odgovara u Open-Meteo formatu i menja vrednosti pri svakom pozivu,
uz ubrzavanje sata da bi se videli ciklusi osvežavanja:

| Provera | Rezultat |
|---|---|
| osvežavanje na 3 minuta | jedan poziv po ciklusu, nove vrednosti u prikazu |
| puno osvežavanje na 15 minuta | prognoza, modeli i more se povlače ponovo |
| nestanak mreže | bez poziva, zadržan prikaz, oznaka „Van mreže — podaci od HH:MM" |
| povratak mreže | trenutno osvežavanje bez čekanja na sledeći ciklus |
| rad bez mreže posle ponovnog učitavanja | cela aplikacija se otvara iz keša |
| server odbije prošireni zahtev | prelazak na osnovni skup polja, ostatak prognoze potpun |
| bez podataka o moru | sekcija se sakriva |

Imena parametara su usklađena sa zvaničnom dokumentacijom. Razilaženje modela se
čita iz svih nizova maksimalne temperature u odgovoru, bez pretpostavke o tačnom
obliku sufiksa po modelu.

## Sistem izrade

[`DIZAJN-SISTEM.md`](DIZAJN-SISTEM.md) opisuje sve odluke iza ove aplikacije — paletu,
tipografiju, ponašanje kao telefonska aplikacija, instalaciju, komponente i rad sa
podacima — tako da se mogu preneti na drugu aplikaciju.

## Izvori

- [Open-Meteo](https://open-meteo.com/) — prognoza, poređenje modela, more, geokodiranje
  (bez registracije i bez ključa)
- WMO WW kodovi za tumačenje vremenskih uslova
- Sunce i Mesec: NOAA solarne jednačine i Meeus, *Astronomical Algorithms*

## Prilagođavanje

- **Brzi izbor mesta** — niz `QUICK` na vrhu `assets/js/app.js`
- **Prag za trend** — `TREND_FROM_DAY` u `assets/js/format.js`
- **Pravila pouzdanosti** — funkcija `confidence()` u istom fajlu
- **Boje podataka** — promenljive `--c-*` i `--s-*` na vrhu `assets/css/style.css`
  (temperatura: hladno↔toplo, padavine, vetar; status boje su odvojene)
- **Teme neba** — blokovi `body[data-sky="…"]`

## Napomene

- Geolokacija zahteva HTTPS ili `localhost` i dozvolu korisnika.
- Sva vremena su u vremenskoj zoni izabranog mesta (`timezone=auto`).
- Podaci o moru postoje samo za tačke koje model pokriva; nekoliko stotina metara
  od obale ume da bude razlika između podatka i praznog odgovora.
